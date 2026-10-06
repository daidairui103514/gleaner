/* PDF 双语阅读器：pdf.js 渲染原文，按段落提取文本并双语对照 */
import * as pdfjsLib from '../lib/pdfjs/pdf.mjs';
import { upgradeSelects } from '../common/ui.js';

pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('lib/pdfjs/pdf.worker.mjs');

const CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/';

/* PDF 阅读器是独立的扩展页面，拿不到设置页那套 CSS 规则，
   这里自己把强调色挂上去 */
const ACCENTS = {
  amber: { main: '#e39b2c', soft: '#fac775', fill: '#a8681a', on: '#1a1508', rgb: '186, 117, 23' },
  teal: { main: '#4bd6b4', soft: '#8ff0d8', fill: '#17705c', on: '#04170f', rgb: '23, 112, 92' },
  indigo: { main: '#96a9f7', soft: '#c3cdfb', fill: '#3b4a9c', on: '#0a0f26', rgb: '59, 74, 156' },
  rose: { main: '#f292b6', soft: '#f9c2d5', fill: '#9c3355', on: '#260a14', rgb: '156, 51, 85' },
  slate: { main: '#c2c0b8', soft: '#dedcd4', fill: '#56544c', on: '#14130f', rgb: '86, 84, 76' }
};

function applyAccent(settings) {
  const name = (settings && settings.accent) || 'amber';
  const a = ACCENTS[name] || ACCENTS.amber;
  const rs = document.documentElement.style;
  rs.setProperty('--amber', a.main);
  rs.setProperty('--amber-soft', a.soft);
  rs.setProperty('--amber-fill', a.fill);
  rs.setProperty('--on-amber', a.on);
  rs.setProperty('--amber-dim', a.fill);
  rs.setProperty('--accent-rgb', a.rgb);
  document.documentElement.setAttribute('data-accent', name);
}

const params = new URLSearchParams(location.search);
const fileUrl = params.get('file') || '';

const state = {
  doc: null,
  scale: 1,
  pages: [],
  mode: 'bilingual',
  translating: false,
  /* 解析完成前不允许翻译，否则会提示「没有提取到文本」，误导用户以为 PDF 不支持 */
  ready: false
};

/* 段落文本 → 译文。换字号 / 缩放都会重新提取段落，
   靠这张表把译文按原文接回去，不然会整页变回「等待翻译」。 */
const translationCache = new Map();

const $ = function (id) {
  return document.getElementById(id);
};

/** 更新状态条；working 为真时左侧小圆点会呼吸，表示正在忙 */
function setStatus(text, working) {
  const el = $('status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('working', !!working);
}

/* ------------------------------------------------------------- 文本分组 */

function toScreen(item, viewport) {
  const m = pdfjsLib.Util.transform(viewport.transform, item.transform);
  return {
    x: m[4],
    y: m[5],
    size: Math.hypot(m[2], m[3]) || item.height || 10
  };
}

/** 把 pdf.js 的文本碎片按行、再按段落聚合 */
function groupParagraphs(items, viewport) {
  const lines = [];

  items.forEach(function (item) {
    const text = (item.str || '').replace(/\s+/g, ' ');
    if (!text.trim()) return;
    const pos = toScreen(item, viewport);
    let line = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (Math.abs(lines[i].y - pos.y) < pos.size * 0.55) {
        line = lines[i];
        break;
      }
    }
    if (!line) {
      line = { y: pos.y, size: pos.size, parts: [], lastX: Infinity };
      lines.push(line);
    }
    if (pos.x + 1 < line.lastX && line.parts.length) line.parts.push(' ');
    line.parts.push({ x: pos.x, text: text });
    line.lastX = pos.x + (item.width || 0);
    line.size = Math.max(line.size, pos.size);
  });

  lines.sort(function (a, b) {
    return a.y - b.y;
  });

  const joined = lines.map(function (line) {
    line.text = line.parts
      .sort(function (a, b) {
        return a.x - b.x;
      })
      .map(function (p) {
        return p.text;
      })
      .join('')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return line;
  });

  const paragraphs = [];
  let buffer = null;

  joined.forEach(function (line) {
    if (!line.text) return;
    if (!buffer) {
      buffer = { text: line.text, size: line.size, y: line.y, endY: line.y };
      return;
    }
    const gap = line.y - buffer.endY;
    const continues =
      gap < line.size * 1.9 &&
      !/[.!?。！？:：]$/.test(buffer.text) &&
      buffer.text.length > 0 &&
      !/^\s*[•·\-–—]\s/.test(line.text);
    if (continues) {
      buffer.text += ' ' + line.text;
      buffer.endY = line.y;
      buffer.size = Math.max(buffer.size, line.size);
    } else {
      paragraphs.push(buffer);
      buffer = { text: line.text, size: line.size, y: line.y, endY: line.y };
    }
  });
  if (buffer) paragraphs.push(buffer);

  return paragraphs
    .map(function (p) {
      return { text: p.text.replace(/\s+/g, ' ').trim(), size: p.size };
    })
    .filter(function (p) {
      if (!p.text) return false;
      if (p.text.length < 2) return false;
      if (/^[\d\s./\-–—]+$/.test(p.text)) return false;
      if (!/[A-Za-z\u00c0-\u024f\u0400-\u04ff\u3040-\u30ff\u4e00-\u9fff\u0600-\u06ff\u0e00-\u0e7f\uac00-\ud7af]/.test(p.text)) {
        return false;
      }
      return true;
    });
}

/* ----------------------------------------------------------------- 渲染 */

async function renderPage(num) {
  const page = await state.doc.getPage(num);
  const box = document.querySelector('[data-page="' + num + '"]');
  const holder = box.querySelector('.page-canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const viewport = page.getViewport({ scale: state.scale });
  const renderViewport = page.getViewport({ scale: state.scale * dpr });

  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(renderViewport.width);
  canvas.height = Math.floor(renderViewport.height);
  canvas.style.width = Math.floor(viewport.width) + 'px';
  canvas.style.height = Math.floor(viewport.height) + 'px';
  holder.appendChild(canvas);

  await page.render({ canvasContext: canvas.getContext('2d'), viewport: renderViewport }).promise;

  const content = await page.getTextContent();
  const paragraphs = groupParagraphs(content.items, viewport);

  /* 缩放会重跑这一段，按原文把翻译过的内容接回来 */
  paragraphs.forEach(function (para) {
    const hit = translationCache.get(para.text);
    if (hit) para.translation = hit;
  });

  state.pages[num - 1] = paragraphs;
  paintPage(num);
}

function paintPage(num) {
  const box = document.querySelector('[data-page="' + num + '"]');
  if (!box) return;
  const host = box.querySelector('.page-text');
  const paragraphs = state.pages[num - 1] || [];
  host.innerHTML = '';

  paragraphs.forEach(function (para, index) {
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.dataset.index = String(index);

    const src = document.createElement('div');
    src.className = 'src';
    src.textContent = para.text;

    const dst = document.createElement('div');
    dst.className = 'dst';
    dst.textContent = para.translation || '等待翻译…';
    if (!para.translation) dst.classList.add('hint');

    /* 原文在上、译文在下 */
    seg.appendChild(src);
    seg.appendChild(dst);
    host.appendChild(seg);
  });
}

/* ----------------------------------------------------------------- 翻译 */

function sendTranslate(texts) {
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendMessage(
      {
        type: 'amber:translate',
        payload: { texts: texts, pageTitle: document.title }
      },
      function (response) {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message || '扩展通信失败'));
          return;
        }
        if (!response || !response.ok) {
          reject(new Error((response && response.error) || '翻译失败'));
          return;
        }
        resolve(response.data.translations || []);
      }
    );
  });
}

async function translateAll() {
  if (state.translating) return;

  if (!state.ready) {
    setStatus('PDF 还在解析中，等两秒再点一次。', false);
    return;
  }

  state.translating = true;
  $('translate').disabled = true;

  const tasks = [];
  state.pages.forEach(function (paragraphs, pageIndex) {
    paragraphs.forEach(function (para, segIndex) {
      tasks.push({ pageIndex: pageIndex, segIndex: segIndex, text: para.text });
    });
  });

  const total = tasks.length;
  let done = 0;
  const batchSize = 4;
  let cursor = 0;

  function updateProgress() {
    $('progress').firstElementChild.style.width = (total ? (done / total) * 100 : 0) + '%';
    setStatus('正在翻译 ' + done + ' / ' + total + ' 段…', true);
  }

  async function worker() {
    while (cursor < tasks.length) {
      const start = cursor;
      cursor += batchSize;
      const batch = tasks.slice(start, cursor);
      try {
        const out = await sendTranslate(
          batch.map(function (t) {
            return t.text;
          })
        );
        batch.forEach(function (task, k) {
          const page = state.pages[task.pageIndex];
          const value = out[k] || '';
          if (page && page[task.segIndex]) page[task.segIndex].translation = value;
          if (value) translationCache.set(task.text, value);
          done++;
        });
        batch.forEach(function (task) {
          paintPage(task.pageIndex + 1);
        });
      } catch (err) {
        setStatus('翻译中断：' + ((err && err.message) || '未知错误'), false);
        done += batch.length;
      }
      updateProgress();
    }
  }

  const workers = [];
  for (let i = 0; i < 3; i++) workers.push(worker());
  await Promise.all(workers);

  state.translating = false;
  $('translate').disabled = false;
  $('translate').textContent = '重新翻译';
  $('progress').firstElementChild.style.width = '100%';
  setStatus(
    total
      ? '翻译完成，共 ' + total + ' 段。'
      : '没有可翻译的段落 —— 可能是扫描件（纯图片 PDF），或者正文还没解析完，等两秒再试。',
    false
  );
}

/* ----------------------------------------------------------------- 轮廓 */

async function loadDocument() {
  if (!fileUrl) {
    setStatus('没有指定 PDF 地址。', false);
    return;
  }

  $('translate').disabled = true;
  setStatus('正在解析 PDF…', true);

  try {
    const task = pdfjsLib.getDocument({
      url: fileUrl,
      withCredentials: true,
      cMapUrl: CDN + 'cmaps/',
      cMapPacked: true,
      standardFontDataUrl: CDN + 'standard_fonts/'
    });
    state.doc = await task.promise;
  } catch (err) {
    setStatus('PDF 打开失败：' + ((err && err.message) || '可能是跨域或权限限制'), false);
    return;
  }

  let name = fileUrl;
  try {
    name = decodeURIComponent(fileUrl.split('/').pop().split('?')[0]) || fileUrl;
  } catch (e) {
    /* 用原始地址兜底 */
  }
  document.title = name + ' · PDF 双语翻译';
  $('doc-title').textContent = name;
  $('doc-title').title = fileUrl;
  $('page-total').textContent = '/ ' + state.doc.numPages;
  $('page-input').max = String(state.doc.numPages);
  setStatus('共 ' + state.doc.numPages + ' 页，点击「翻译全文」开始双语对照。', false);

  const container = $('pages');
  container.innerHTML = '';
  for (let i = 1; i <= state.doc.numPages; i++) {
    const box = document.createElement('section');
    box.className = 'page';
    box.dataset.page = String(i);
    box.innerHTML = '<div class="page-canvas"><span class="page-num">第 ' + i + ' 页</span></div><div class="page-text"></div>';
    container.appendChild(box);
  }

  for (let i = 1; i <= state.doc.numPages; i++) {
    await renderPage(i);
  }

  state.ready = true;
  $('translate').disabled = false;
  setStatus('共 ' + state.doc.numPages + ' 页，已就绪，点「翻译全文」开始双语对照。', false);
}

/* ----------------------------------------------------------------- 交互 */

function bindUi() {
  $('translate').addEventListener('click', translateAll);

  $('mode').addEventListener('click', function () {
    const order = ['bilingual', 'source', 'translation'];
    state.mode = order[(order.indexOf(state.mode) + 1) % order.length];
    document.body.className = 'mode-' + state.mode;
    $('mode').textContent = { bilingual: '双语对照', source: '仅原文', translation: '仅译文' }[state.mode];
  });

  $('prev').addEventListener('click', function () {
    const input = $('page-input');
    input.value = String(Math.max(1, Number(input.value) - 1));
    jump();
  });

  $('next').addEventListener('click', function () {
    const input = $('page-input');
    input.value = String(Math.min(state.doc ? state.doc.numPages : 1, Number(input.value) + 1));
    jump();
  });

  $('page-input').addEventListener('change', jump);

  $('zoom').addEventListener('change', async function () {
    state.scale = Number($('zoom').value);
    if (!state.doc) return;
    for (let i = 1; i <= state.doc.numPages; i++) {
      const box = document.querySelector('[data-page="' + i + '"] .page-canvas');
      const canvas = box && box.querySelector('canvas');
      if (canvas) canvas.remove();
      await renderPage(i);
    }
  });
}

function jump() {
  const num = Math.max(1, Math.min(state.doc ? state.doc.numPages : 1, Number($('page-input').value) || 1));
  const box = document.querySelector('[data-page="' + num + '"]');
  if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

bindUi();
/* 工具栏的下拉也换成和设置页一致的自定义控件，不用浏览器默认样式 */
upgradeSelects(document);

/* 读一次设置把强调色挂上，之后设置页改了也跟着变 */
(async function () {
  try {
    const stored = await chrome.storage.local.get('settings');
    applyAccent(stored.settings || {});
  } catch (e) {
    applyAccent({});
  }
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes.settings || !changes.settings.newValue) return;
      applyAccent(changes.settings.newValue);
    });
  } catch (e) {
    /* 忽略 */
  }
})();

loadDocument();
