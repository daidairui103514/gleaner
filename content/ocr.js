(function (root) {
  'use strict';

  const S = root.AmberStore;
  const Z = 2147483003;

  let host = null;
  let shadow = null;
  let busy = false;

  const CSS = `
:host {
  all: initial;
  --accent-rgb: 186, 117, 23;
  --amber: #e39b2c;
  --amber-soft: #fac775;
  --amber-fill: #ba7517;
  --on-amber: #1a1508;
}
* { box-sizing: border-box; }
.panel {
  position: fixed; right: 24px; bottom: 96px; z-index: ${Z};
  width: 360px; max-width: calc(100vw - 32px); max-height: 74vh;
  display: none; flex-direction: column;
  background: rgba(24, 22, 19, 0.96);
  border: 0.5px solid rgba(var(--accent-rgb), 0.55);
  border-radius: 14px;
  backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%);
  box-shadow: 0 16px 42px rgba(0, 0, 0, 0.46);
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  color: #F0E3CC; overflow: hidden;
}
.panel.show { display: flex; }
.head {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 12px; border-bottom: 0.5px solid rgba(240, 227, 204, 0.12);
  font-size: 12.5px; color: #E8D7BB;
}
.head .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--amber); }
.head .spacer { flex: 1; }
.head button {
  border: 0.5px solid rgba(240, 227, 204, 0.18); background: rgba(240, 227, 204, 0.06);
  color: #E8D7BB; border-radius: 6px; padding: 3px 8px; font-size: 11.5px;
  font-family: inherit; cursor: pointer;
}
.head button:hover { background: rgba(var(--accent-rgb), 0.28); }
.body { padding: 12px; overflow: auto; display: flex; flex-direction: column; gap: 10px; }
.thumb { max-width: 100%; max-height: 130px; border-radius: 8px; border: 0.5px solid rgba(240, 227, 204, 0.14); object-fit: contain; background: #171614; }
.label { font-size: 10.5px; letter-spacing: .05em; text-transform: uppercase; color: rgba(240, 227, 204, 0.4); }
.src { font-size: 12.5px; line-height: 1.6; color: rgba(240, 227, 204, 0.72); white-space: pre-wrap; word-break: break-word; max-height: 130px; overflow: auto; }
.dst {
  font-size: 13.5px; line-height: 1.65; color: var(--amber-soft); white-space: pre-wrap; word-break: break-word;
  border-left: 2px solid var(--amber-fill); padding-left: 9px;
}
.dst.warn {
  font-size: 12px; line-height: 1.65; color: var(--amber-soft);
  border-left: 2px solid rgba(var(--accent-rgb), 0.5);
  background: rgba(var(--accent-rgb), 0.1);
  border-radius: 0 7px 7px 0;
  padding: 8px 11px;
}
.hint { font-size: 12px; color: rgba(240, 227, 204, 0.55); line-height: 1.6; }
.hint.error { color: #F7C1C1; }
`;

  function applyAccent() {
    if (!host) return;
    const accent = S.accentColor();
    const rs = host.style;
    rs.setProperty('--amber', accent.main);
    rs.setProperty('--amber-soft', accent.soft);
    rs.setProperty('--amber-fill', accent.fill);
    rs.setProperty('--on-amber', accent.on);
    rs.setProperty('--accent-rgb', accent.rgb);
  }

  function build() {
    if (host) return;
    host = document.createElement('div');
    host.className = 'amber-ocr-host';
    host.setAttribute('data-amber-skip', '');
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = [
      '<div class="head">',
      '  <span class="dot"></span><span class="title">图片文字翻译</span>',
      '  <span class="spacer"></span>',
      '  <button data-action="copy">复制译文</button>',
      '  <button data-action="close">关闭</button>',
      '</div>',
      '<div class="body"></div>'
    ].join('\n');

    shadow.appendChild(style);
    shadow.appendChild(panel);
    applyAccent();

    ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'].forEach(function (name) {
      host.addEventListener(name, function (e) {
        e.stopPropagation();
      });
    });

    shadow.querySelector('[data-action="close"]').addEventListener('click', hide);
    shadow.querySelector('[data-action="copy"]').addEventListener('click', function () {
      const dst = shadow.querySelector('.dst');
      const text = dst ? dst.textContent : '';
      if (text) {
        navigator.clipboard.writeText(text);
        const btn = shadow.querySelector('[data-action="copy"]');
        btn.textContent = '已复制';
        setTimeout(function () {
          btn.textContent = '复制译文';
        }, 1200);
      }
    });

    (function draggable() {
      const panel = shadow.querySelector('.panel');
      const head = shadow.querySelector('.head');
      let dragging = false;
      let moved = false;
      let sx = 0;
      let sy = 0;
      let ox = 0;
      let oy = 0;

      head.style.cursor = 'move';

      head.addEventListener('pointerdown', function (e) {
        if (e.button !== 0) return;
        if (e.target.closest('button')) return;
        const rect = panel.getBoundingClientRect();
        dragging = true;
        moved = false;
        sx = e.clientX;
        sy = e.clientY;
        ox = rect.left;
        oy = rect.top;
        try {
          head.setPointerCapture(e.pointerId);
        } catch (err) {
        }
        e.preventDefault();
        e.stopPropagation();
      });

      head.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return;
        moved = true;
        if (!panel.dataset.moved) {
          panel.dataset.moved = '1';
          panel.style.right = 'auto';
          panel.style.bottom = 'auto';
        }
        panel.style.left = Math.max(8, Math.min(ox + dx, window.innerWidth - panel.offsetWidth - 8)) + 'px';
        panel.style.top = Math.max(8, Math.min(oy + dy, window.innerHeight - panel.offsetHeight - 8)) + 'px';
      });

      head.addEventListener('pointerup', function () {
        dragging = false;
      });
    })();

    (document.body || document.documentElement).appendChild(host);
  }

  function bodyHtml(imageUrl, message, kind) {
    return [
      imageUrl ? '<img class="thumb" src="' + root.AmberUtil.escapeHtml(imageUrl) + '" alt="">' : '',
      '<div class="hint ' + (kind || '') + '">' + root.AmberUtil.escapeHtml(message) + '</div>'
    ].join('');
  }

  function setBody(html) {
    shadow.querySelector('.body').innerHTML = html;
  }

  function show(imageUrl, message, kind) {
    build();
    setBody(bodyHtml(imageUrl, message, kind));
    shadow.querySelector('.panel').classList.add('show');
  }

  function hide() {
    if (shadow) shadow.querySelector('.panel').classList.remove('show');
  }

  async function runOcr(url) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage({ type: 'amber:ocr-image', url: url }, function (response) {
          const err = chrome.runtime.lastError;
          if (err) {
            resolve({ ok: false, error: err.message });
            return;
          }
          resolve(response || { ok: false, error: '没有收到响应' });
        });
      } catch (e) {
        resolve({ ok: false, error: '扩展通信失败，请刷新页面' });
      }
    });
  }

  async function translateImageByUrl(url) {
    if (!url) return;
    busy = true;
    show(url, '正在识别图片文字…');

    const ocr = await runOcr(url);
    if (!ocr.ok) {
      setBody(bodyHtml(url, '识别失败：' + (ocr.error || '未知错误'), 'error'));
      busy = false;
      return;
    }

    const text = ((ocr.data && ocr.data.text) || '').trim();
    if (!text) {
      setBody(bodyHtml(url, '图片里没有识别到文字。', 'error'));
      busy = false;
      return;
    }

    const conf = ocr.data && typeof ocr.data.confidence === 'number' ? ocr.data.confidence : null;

    setBody(
      [
        '<img class="thumb" src="' + root.AmberUtil.escapeHtml(url) + '" alt="">',
        '<div class="label">识别到的原文' + (conf !== null ? ' · 置信度 ' + conf + '%' : '') + '</div>',
        '<div class="src">' + root.AmberUtil.escapeHtml(text) + '</div>',
        '<div class="label">译文</div>',
        '<div class="dst">翻译中…</div>'
      ].join('')
    );

    try {
      const out = await S.translate([text.slice(0, 4000)]);
      const value = ((out && out[0]) || '').trim();
      const dst = shadow.querySelector('.dst');
      if (!dst) return;

      if (!value || value === text) {
        dst.className = 'dst warn';
        dst.textContent =
          '引擎没能翻译这段文字。' +
          (conf !== null && conf < 70 ? '这次识别置信度只有 ' + conf + '%，' : '') +
          '本地识别擅长印刷体，手写体、艺术字、古籍花体字基本认不出来。' +
          '这类图片建议用云端 OCR（如百度手写文字识别）或视觉大模型。';
      } else {
        dst.textContent = value;
      }
    } catch (err) {
      const dst = shadow.querySelector('.dst');
      if (dst) dst.textContent = '翻译失败：' + ((err && err.message) || '未知错误');
    } finally {
      busy = false;
    }
  }

  function init() {
    S.on(function (event) {
      if (event === 'settings') applyAccent();
    });
  }

  root.AmberOcr = {
    init: init,
    translateImageByUrl: translateImageByUrl,
    isBusy: function () {
      return busy;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
