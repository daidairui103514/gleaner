/* 划词翻译气泡：选中文字 -> 浮标 / 直接出译文。
   支持拖动、切换引擎、完整查看原文与译文、钉住不消失。 */
(function (root) {
  'use strict';

  const S = root.AmberStore;
  const U = root.AmberUtil;
  const Z = 2147483001;

  let host = null;
  let shadow = null;
  let bubble = null;
  let icon = null;
  let lastRect = null;
  let currentText = '';
  let pinned = false;
  let requestId = 0;
  let enginePopOpen = false;

  const BUILTIN_ENGINES = [
    { id: 'bing', name: '必应翻译' },
    { id: 'microsoft', name: '微软官方 API' },
    { id: 'google', name: '谷歌翻译' },
    { id: 'mymemory', name: 'MyMemory' },
    { id: 'builtin', name: '浏览器内置' }
  ];

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
.layer { position: fixed; z-index: ${Z}; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif; }
.icon {
  width: 26px; height: 26px; border-radius: 8px; cursor: pointer;
  background: rgba(24, 22, 19, 0.86);
  border: 1px solid rgba(var(--accent-rgb), 0.8);
  backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
  display: flex; align-items: center; justify-content: center;
  color: var(--amber); font-size: 13px; font-family: "Songti SC", "SimSun", serif;
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
  transition: transform 0.14s ease;
}
.icon:hover { transform: scale(1.08); }

.bubble {
  position: relative;
  width: 420px; max-width: 92vw;
  padding: 13px 14px 11px;
  background: rgba(24, 22, 19, 0.96);
  border: 1px solid rgba(var(--accent-rgb), 0.35);
  border-radius: 13px;
  backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%);
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.46);
  color: #F0E3CC; font-size: 13px; line-height: 1.6;
  display: none;
}
.bubble.show { display: block; }
.bubble.pinned { border-color: rgba(var(--accent-rgb), 0.75); box-shadow: 0 14px 38px rgba(0,0,0,.5), 0 0 0 1px rgba(186,117,23,.25); }

.head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 9px; cursor: move; }
.head .label { font-size: 11px; color: rgba(240, 227, 204, 0.42); letter-spacing: 0.04em; }
.head .grip { font-size: 12px; color: rgba(240, 227, 204, 0.28); }

.src {
  font-size: 12.5px; color: rgba(240, 227, 204, 0.6);
  max-height: 116px; overflow: auto; margin-bottom: 10px;
  word-break: break-word; white-space: pre-wrap;
  padding-right: 4px;
}
.dst {
  font-size: 14.5px; color: var(--amber-soft); word-break: break-word; white-space: pre-wrap;
  border-left: 2px solid var(--amber-fill); padding-left: 10px;
  max-height: 260px; overflow: auto;
  font-family: "Songti SC", "SimSun", Georgia, serif;
}
.dst.loading { color: rgba(240, 227, 204, 0.4); font-family: inherit; font-size: 12.5px; border-left-color: transparent; padding-left: 0; }
.src::-webkit-scrollbar, .dst::-webkit-scrollbar, .engine-pop::-webkit-scrollbar { width: 6px; }
.src::-webkit-scrollbar-thumb, .dst::-webkit-scrollbar-thumb, .engine-pop::-webkit-scrollbar-thumb {
  background: rgba(240, 227, 204, 0.16); border-radius: 3px;
}

.bar { display: flex; align-items: center; gap: 6px; margin-top: 11px; padding-top: 10px; border-top: 1px solid rgba(240, 227, 204, 0.1); flex-wrap: wrap; }
.bar button {
  flex: 0 0 auto; padding: 5px 10px; border-radius: 7px; cursor: pointer;
  background: rgba(240, 227, 204, 0.07);
  border: 0.5px solid rgba(240, 227, 204, 0.16);
  color: #E8D7BB; font-size: 11.5px; font-family: inherit;
  transition: background 0.14s, border-color 0.14s, color 0.14s;
}
.bar button:hover { background: rgba(var(--accent-rgb), 0.26); border-color: rgba(var(--accent-rgb), 0.6); }
.bar button.on { background: rgba(var(--accent-rgb), 0.34); border-color: rgba(var(--accent-rgb), 0.7); color: #FFE6BD; }
.bar .spacer { flex: 1; }

.engine-pop {
  position: absolute; left: 12px; right: 12px; bottom: 46px;
  max-height: 220px; overflow: auto;
  padding: 6px;
  background: rgba(18, 17, 15, 0.98);
  border: 1px solid rgba(var(--accent-rgb), 0.4);
  border-radius: 10px;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
  display: none;
}
.engine-pop.show { display: block; }
.engine-pop button {
  display: block; width: 100%; padding: 8px 10px; border: 0; border-radius: 7px;
  background: transparent; color: #C9BFAE; font: inherit; font-size: 12.5px;
  text-align: left; cursor: pointer;
}
.engine-pop button:hover { background: rgba(240, 227, 204, 0.08); color: #F0E3CC; }
.engine-pop button.on { background: rgba(var(--accent-rgb), 0.24); color: var(--amber-soft); }
`;

  /* ---------------------------------------------------------------- 构建 */

  /** 把当前强调色挂到宿主上，供 shadow 里的 CSS 变量使用 */
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
    host.className = 'amber-bubble-host';
    host.setAttribute('data-amber-skip', '');
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;

    const layer = document.createElement('div');
    layer.className = 'layer';
    layer.innerHTML = [
      '<div class="icon" title="翻译选中内容">译</div>',
      '<div class="bubble">',
      '  <div class="head"><span class="label">原文</span><span class="grip">⠿ 可拖动</span></div>',
      '  <div class="src"></div>',
      '  <div class="label dst-label"></div>',
      '  <div class="dst"></div>',
      '  <div class="bar">',
      '    <button data-action="speak">朗读</button>',
      '    <button data-action="copy">复制译文</button>',
      '    <button data-action="engine">必应翻译 ›</button>',
      '    <button data-action="pin">钉住</button>',
      '    <span class="spacer"></span>',
      '    <button data-action="close">关闭</button>',
      '  </div>',
      '  <div class="engine-pop"></div>',
      '</div>'
    ].join('\n');

    shadow.appendChild(style);
    shadow.appendChild(layer);
    icon = shadow.querySelector('.icon');
    bubble = shadow.querySelector('.bubble');

    /* 划词气泡的配色跟着设置走 */
    applyAccent();

    ['mousedown', 'mouseup', 'click', 'pointerdown', 'pointerup'].forEach(function (name) {
      host.addEventListener(name, function (e) {
        e.stopPropagation();
      }, false);
    });

    icon.addEventListener('click', function (e) {
      e.stopPropagation();
      if (currentText) showBubble(currentText, lastRect);
    });

    shadow.querySelector('.bar').addEventListener('click', onBarClick);
    shadow.querySelector('.engine-pop').addEventListener('click', onEngineClick);
    shadow.querySelector('.head').addEventListener('pointerdown', onDragStart);
    window.addEventListener('pointermove', onDragMove, true);
    window.addEventListener('pointerup', onDragEnd, true);

    (document.body || document.documentElement).appendChild(host);

    document.addEventListener('mousedown', function (e) {
      if (!host) return;
      const path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(host) !== -1) return;
      if (enginePopOpen) {
        closeEnginePop();
        return;
      }
      if (pinned) return;
      hideAll();
    }, true);
  }

  /* ------------------------------------------------------------ 引擎列表 */

  function engineList() {
    const list = BUILTIN_ENGINES.slice();
    const profiles = (S.state.settings.engines && S.state.settings.engines.openai && S.state.settings.engines.openai.profiles) || [];
    profiles.forEach(function (profile) {
      list.push({ id: 'openai:' + profile.id, name: profile.name || '大模型' });
    });
    if (!profiles.length) list.push({ id: 'openai', name: '大模型（未配置）' });
    return list;
  }

  function engineName(id) {
    const found = engineList().find(function (item) {
      return item.id === id;
    });
    return found ? found.name : id;
  }

  function refreshEngineButton() {
    const btn = shadow.querySelector('[data-action="engine"]');
    if (btn) btn.textContent = engineName(S.state.settings.engine) + ' ›';
  }

  function renderEnginePop() {
    const pop = shadow.querySelector('.engine-pop');
    const current = S.state.settings.engine;
    pop.innerHTML = engineList()
      .map(function (item) {
        return (
          '<button data-engine="' +
          item.id +
          '"' +
          (item.id === current ? ' class="on"' : '') +
          '>' +
          item.name +
          (item.id === current ? ' ✓' : '') +
          '</button>'
        );
      })
      .join('');
  }

  function openEnginePop() {
    renderEnginePop();
    shadow.querySelector('.engine-pop').classList.add('show');
    enginePopOpen = true;
  }

  function closeEnginePop() {
    if (!shadow) return;
    shadow.querySelector('.engine-pop').classList.remove('show');
    enginePopOpen = false;
  }

  async function onEngineClick(e) {
    const btn = e.target.closest('[data-engine]');
    if (!btn) return;
    e.stopPropagation();
    const id = btn.getAttribute('data-engine');
    closeEnginePop();

    const res = await S.send(root.AmberMsg.PATCH_SETTINGS, { patch: { engine: id } });
    if (res && res.ok && res.data) S.state.settings = res.data;
    refreshEngineButton();

    /* 换引擎后用新引擎重译当前这段 */
    if (currentText) showBubble(currentText, lastRect);
  }

  /* -------------------------------------------------------------- 交互 */

  async function onBarClick(e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    e.stopPropagation();
    const action = btn.getAttribute('data-action');

    if (action === 'close') {
      pinned = false;
      hideAll();
    } else if (action === 'copy') {
      const dst = shadow.querySelector('.dst');
      navigator.clipboard.writeText(dst.textContent || '').then(function () {
        btn.textContent = '已复制';
        setTimeout(function () {
          btn.textContent = '复制译文';
        }, 1200);
      });
    } else if (action === 'speak') {
      speak(shadow.querySelector('.dst').textContent || '');
    } else if (action === 'pin') {
      pinned = !pinned;
      btn.classList.toggle('on', pinned);
      btn.textContent = pinned ? '已钉住' : '钉住';
      bubble.classList.toggle('pinned', pinned);
    } else if (action === 'engine') {
      if (enginePopOpen) closeEnginePop();
      else openEnginePop();
    }
  }

  function speak(text) {
    const clean = String(text || '').trim().slice(0, 500);
    if (!clean) return;
    try {
      const utter = new SpeechSynthesisUtterance(clean);
      const lang = S.state.settings.targetLang || 'zh-Hans';
      utter.lang = lang.replace('zh-Hans', 'zh-CN').replace('zh-Hant', 'zh-TW');
      speechSynthesis.cancel();
      speechSynthesis.speak(utter);
    } catch (e) {
      /* 浏览器不支持语音合成 */
    }
  }

  /* -------------------------------------------------------------- 拖动 */

  let dragging = false;
  let dragMoved = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  function onDragStart(e) {
    if (e.button !== 0) return;
    const layer = shadow.querySelector('.layer');
    const rect = layer.getBoundingClientRect();
    dragging = true;
    dragMoved = false;
    startX = e.clientX;
    startY = e.clientY;
    originX = rect.left;
    originY = rect.top;
    e.preventDefault();
    e.stopPropagation();
  }

  function onDragMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!dragMoved && Math.abs(dx) + Math.abs(dy) < 4) return;
    dragMoved = true;
    const layer = shadow.querySelector('.layer');
    const w = layer.offsetWidth || 420;
    const h = layer.offsetHeight || 160;
    layer.style.left = Math.max(8, Math.min(originX + dx, window.innerWidth - w - 8)) + 'px';
    layer.style.top = Math.max(8, Math.min(originY + dy, window.innerHeight - h - 8)) + 'px';
  }

  function onDragEnd() {
    dragging = false;
  }

  /* ---------------------------------------------------------- 定位与显示 */

  function positionAt(rect, node) {
    const layer = shadow.querySelector('.layer');
    const width = node.classList.contains('bubble') ? 420 : 26;
    const gap = 8;
    let left = rect.left + (rect.width || 0) / 2 - width / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    let top = rect.top - (node.classList.contains('bubble') ? 52 : 34) - gap;
    if (top < 8) top = Math.min(rect.bottom + gap, window.innerHeight - 80);
    layer.style.left = left + 'px';
    layer.style.top = top + 'px';
  }

  function showIcon(text, rect) {
    build();
    currentText = text;
    lastRect = rect;
    bubble.classList.remove('show');
    icon.style.display = 'flex';
    positionAt(rect, icon);
  }

  async function showBubble(text, rect) {
    build();
    currentText = text;
    lastRect = rect || lastRect;
    icon.style.display = 'none';
    bubble.classList.add('show');
    closeEnginePop();
    if (lastRect) positionAt(lastRect, bubble);

    const src = shadow.querySelector('.src');
    const dst = shadow.querySelector('.dst');
    const dstLabel = shadow.querySelector('.dst-label');
    src.textContent = text;
    dstLabel.textContent = '译文';
    dst.className = 'dst loading';
    dst.textContent = '翻译中…';
    refreshEngineButton();

    const id = ++requestId;
    try {
      const out = await S.translate([text]);
      if (id !== requestId) return;
      const value = (out && out[0]) || '';
      dst.className = 'dst';
      dst.textContent = value || '没有返回译文';
      dstLabel.textContent = '译文 · ' + engineName(S.state.settings.engine);
    } catch (err) {
      if (id !== requestId) return;
      dst.className = 'dst';
      dst.textContent = '翻译失败：' + ((err && err.message) || '未知错误');
    }
    if (lastRect) positionAt(lastRect, bubble);
  }

  function hideAll() {
    if (!shadow) return;
    icon.style.display = 'none';
    bubble.classList.remove('show');
    closeEnginePop();
  }

  /* -------------------------------------------------------------- 入口 */

  function onSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString().trim();
    if (!text || text.length < 1 || text.length > 3000) {
      hideAll();
      return;
    }
    let rect = null;
    try {
      rect = sel.getRangeAt(0).getBoundingClientRect();
    } catch (e) {
      return;
    }
    if (!rect || (!rect.width && !rect.height)) return;

    const mode = (S.state.settings.select && S.state.settings.select.mode) || 'icon';
    if (mode === 'instant') showBubble(text, rect);
    else if (mode === 'icon') showIcon(text, rect);
  }

  function init() {
    build();
    const select = S.state.settings.select || {};
    if (select.enabled === false) {
      hideAll();
      return;
    }

    S.on(function (event) {
      if (event === 'settings') applyAccent();
    });

    let timer = null;
    document.addEventListener(
      'mouseup',
      function (e) {
        if (host && e.composedPath && e.composedPath().indexOf(host) !== -1) return;
        if (/INPUT|TEXTAREA/.test((e.target && e.target.tagName) || '')) return;
        clearTimeout(timer);
        timer = setTimeout(onSelection, 120);
      },
      true
    );

    document.addEventListener(
      'keyup',
      function (e) {
        if (e.key === 'Escape') hideAll();
      },
      true
    );

    window.addEventListener('scroll', function () {
      if (!pinned) hideAll();
    }, { passive: true });
  }

  root.AmberBubble = {
    init: init,
    showForText: function (text) {
      const rect = { left: window.innerWidth / 2, top: 100, width: 0, bottom: 100 };
      showBubble(String(text || '').trim().slice(0, 3000), rect);
    },
    hide: hideAll
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
