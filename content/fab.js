(function (root) {
  'use strict';

  const V = root.AmberMsg;
  const S = root.AmberStore;

  let host = null;
  let shadow = null;
  let wrap = null;
  let ball = null;
  let ring = null;
  let bar = null;
  let panel = null;
  let sub = null;
  let countLabel = null;
  let toast = null;

  let isOpen = false;
  let subKind = null;
  let toastTimer = null;
  let fontTimer = null;

  const PANEL_WIDTH = 246;
  const SUB_WIDTH = 232;

  const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }

.wrap {
  position: fixed;
  z-index: 2147483000;
  font-family: -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
  -webkit-font-smoothing: antialiased;
  user-select: none;
  --surface: #1d1b17;
  --surface-2: #262319;
  --line: rgba(235, 216, 180, 0.09);
  --line-2: rgba(235, 216, 180, 0.18);
  --text: #ede5d5;
  --text-2: #a59b87;
  --text-3: #7c7466;
  --amber: #e39b2c;
  --amber-soft: #f5c877;
  --amber-fill: #a8681a;
  --on-amber: #1a1508;
  --panel-bg: rgba(29, 27, 23, 0.95);
  --panel-border: rgba(var(--accent-rgb), 0.24);
  --hover: rgba(235, 216, 180, 0.07);
  --accent-rgb: 186, 117, 23;
  --chip-bg: rgba(235, 216, 180, 0.07);
  --shadow: 0 16px 40px rgba(0, 0, 0, 0.44);
}

.wrap[data-theme='light'] {
  --surface: #fdfbf6;
  --surface-2: #efeade;
  --line: rgba(60, 50, 30, 0.12);
  --line-2: rgba(60, 50, 30, 0.22);
  --text: #2b2822;
  --text-2: #6c655a;
  --text-3: #948c7e;
  --amber: #9a5b06;
  --amber-soft: #7d4a05;
  --amber-fill: #b0741a;
  --on-amber: #fffaf0;
  --panel-bg: rgba(253, 251, 246, 0.97);
  --panel-border: rgba(154, 91, 6, 0.3);
  --hover: rgba(60, 50, 30, 0.06);
  --chip-bg: rgba(60, 50, 30, 0.05);
  --shadow: 0 16px 40px rgba(80, 62, 30, 0.18);
}

.ball {
  position: relative;
  width: 38px; height: 38px;
  border-radius: 50%;
  background: var(--amber-fill);
  color: var(--on-amber);
  display: flex; align-items: center; justify-content: center;
  font-family: "Songti SC", "SimSun", Georgia, serif;
  font-size: 16px;
  cursor: pointer;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.36);
  transition: transform 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
  touch-action: none;
}
.ball:hover { transform: scale(1.06); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.44); }
.ball.dragging { transform: scale(1.02); cursor: grabbing; }
.ball.active { background: var(--amber-fill); }
.ball .glyph { position: relative; line-height: 1; transform: translateY(-1px); }

.ring { position: absolute; inset: -1px; width: calc(100% + 2px); height: calc(100% + 2px); transform: rotate(-90deg); pointer-events: none; opacity: 0; transition: opacity 0.2s; }
.ring.on { opacity: 1; }
.ring circle { fill: none; stroke-width: 2; }
.ring .track { stroke: rgba(255, 255, 255, 0.16); }
.ring .barpath { stroke: #ffe0a8; stroke-linecap: round; stroke-dasharray: 125.6; stroke-dashoffset: 125.6; transition: stroke-dashoffset 0.3s ease; }

.count {
  position: absolute; right: 46px; top: 50%; transform: translateY(-50%);
  padding: 4px 8px; border-radius: 8px;
  background: var(--panel-bg);
  border: 0.5px solid rgba(var(--accent-rgb), 0.5);
  color: var(--text); font-size: 11px; line-height: 1; white-space: nowrap;
  opacity: 0; pointer-events: none; transition: opacity 0.2s;
}
.count.on { opacity: 1; }

.panel, .sub {
  position: absolute;
  bottom: 0;
  background: var(--panel-bg);
  backdrop-filter: blur(22px) saturate(150%);
  -webkit-backdrop-filter: blur(22px) saturate(150%);
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  box-shadow: var(--shadow);
  color: var(--text);
  display: none;
}

.panel { width: ${PANEL_WIDTH}px; padding: 15px 16px; }
.panel.open { display: block; animation: pop 0.18s cubic-bezier(0.22, 0.61, 0.36, 1); }
@keyframes pop {
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.panel.left { right: 50px; transform-origin: bottom left; }
.panel.right { left: 50px; transform-origin: bottom right; }

.sub {
  width: ${SUB_WIDTH}px;
  max-height: min(360px, 60vh);
  padding: 11px 12px 12px;
  flex-direction: column;
  z-index: 2;
}
.sub.open { display: flex; animation: sub-in 0.2s cubic-bezier(0.22, 0.61, 0.36, 1); }
@keyframes sub-in {
  from { opacity: 0; transform: translateX(14px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes sub-in-left {
  from { opacity: 0; transform: translateX(-14px); }
  to { opacity: 1; transform: translateX(0); }
}
.sub.left { right: 50px; }
.sub.right { left: 50px; }

.p-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 13px; }
.p-head .meta { min-width: 0; }
.p-head .site { font-size: 12px; color: var(--text-2); font-family: ui-monospace, Consolas, monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 168px; }
.p-head .state { font-size: 11px; color: var(--text-3); margin-top: 2px; }
.p-close { flex: 0 0 auto; width: 22px; height: 22px; border: 0; border-radius: 6px; background: transparent; color: var(--text-3); font-size: 15px; line-height: 1; cursor: pointer; }
.p-close:hover { background: rgba(235, 216, 180, 0.08); color: var(--text); }

.p-main {
  width: 100%; padding: 11px 0; margin-bottom: 13px;
  border: 0; border-radius: 10px;
  background: var(--amber-fill); color: var(--on-amber);
  font: inherit; font-size: 13.5px; font-weight: 500;
  cursor: pointer;
}
.p-main:hover { filter: brightness(1.07); }

.p-block { margin-bottom: 13px; }
.p-block:last-child { margin-bottom: 0; }
.p-label { font-size: 11.5px; color: var(--text-3); margin-bottom: 7px; }

.p-seg { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; }
.p-seg button {
  padding: 8px 0; border: 1px solid var(--line); border-radius: 9px;
  background: transparent; color: var(--text-2);
  font: inherit; font-size: 12px; cursor: pointer;
}
.p-seg button:hover { color: var(--text); border-color: rgba(var(--accent-rgb), 0.34); }
.p-seg button.on { background: var(--amber-fill); border-color: var(--amber-fill); color: var(--on-amber); }

.p-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  width: 100%; padding: 9px 12px;
  border: 1px solid var(--line); border-radius: 10px;
  background: transparent; color: var(--text);
  font: inherit; font-size: 13px; cursor: pointer; text-align: left;
}
.p-row + .p-row { margin-top: 7px; }
.p-row:hover { border-color: rgba(var(--accent-rgb), 0.34); }
.p-row.on { border-color: rgba(var(--accent-rgb), 0.5); background: rgba(var(--accent-rgb), 0.1); }
.p-row small { color: var(--text-3); font-size: 12px; flex: 0 0 auto; max-width: 104px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.p-range { display: flex; align-items: center; gap: 11px; }
.p-range input {
  flex: 1; width: 100%; margin: 0; height: 18px;
  -webkit-appearance: none; appearance: none; background: transparent; cursor: pointer;
}
.p-range input::-webkit-slider-runnable-track {
  height: 4px; border-radius: 2px;
  background: linear-gradient(to right, var(--amber) 0%, var(--amber) var(--fill, 0%), rgba(235,216,180,.16) var(--fill, 0%), rgba(235,216,180,.16) 100%);
}
.p-range input::-webkit-slider-thumb {
  -webkit-appearance: none; width: 13px; height: 13px; margin-top: -4.5px;
  border-radius: 50%; background: var(--amber); border: 2px solid var(--surface);
  box-shadow: 0 1px 4px rgba(0,0,0,.35);
}
.p-range .num { flex: 0 0 42px; text-align: right; font-size: 12px; color: var(--amber); font-variant-numeric: tabular-nums; }

.p-foot { display: flex; gap: 15px; padding-top: 13px; margin-top: 13px; border-top: 1px solid var(--line); }
.p-foot button { border: 0; background: transparent; padding: 0; color: var(--text-3); font: inherit; font-size: 12px; cursor: pointer; }
.p-foot button:hover { color: var(--amber); }

.sub-head { display: flex; align-items: center; gap: 8px; margin-bottom: 9px; flex: 0 0 auto; }
.sub-head button {
  width: 22px; height: 22px; border: 0; border-radius: 6px;
  background: var(--chip-bg); color: var(--text-2);
  font-size: 13px; line-height: 1; cursor: pointer;
}
.sub-head button:hover { background: var(--hover); color: var(--text); }
.sub-head span { font-size: 13px; color: var(--text); }

.sub-list { overflow-y: auto; flex: 1; min-height: 0; margin: 0 -4px; padding: 0 4px; }
.sub-list::-webkit-scrollbar { width: 6px; }
.sub-list::-webkit-scrollbar-thumb { background: rgba(235, 216, 180, 0.16); border-radius: 3px; }
.sub-group { padding: 8px 10px 4px; font-size: 11px; color: var(--text-3); }
.sub-item {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 8px 10px; border: 0; border-radius: 8px;
  background: transparent; color: var(--text-2);
  font: inherit; font-size: 12.5px; text-align: left; width: 100%; cursor: pointer;
}
.sub-item:hover { background: var(--chip-bg); color: var(--text); }
.sub-item.on { background: rgba(var(--accent-rgb), 0.2); color: var(--amber-soft); }
.sub-item em { font-style: normal; font-size: 11px; color: var(--text-3); flex: 0 0 auto; }

.toast {
  position: absolute; right: 50px; bottom: 0;
  padding: 8px 12px; border-radius: 9px;
  background: var(--panel-bg);
  border: 0.5px solid rgba(var(--accent-rgb), 0.45);
  color: var(--text); font-size: 12px; line-height: 1.5;
  opacity: 0; pointer-events: none; transition: opacity 0.2s;
  white-space: normal; width: max-content; max-width: 230px;
}
.toast.on { opacity: 1; }
.toast.left { right: 50px; }
.toast.right { left: 50px; }
.toast.error { color: #f7c1c1; border-color: rgba(226, 75, 74, 0.55); }
.toast.ok { color: #c0dd97; border-color: rgba(151, 196, 89, 0.5); }
`;

  const MODE_LABEL = { bilingual: '双语', translation: '仅译文', source: '仅原文' };


  function profiles() {
    const cfg = (S.state.settings.engines || {}).openai || {};
    return Array.isArray(cfg.profiles) ? cfg.profiles : [];
  }

  function engineList() {
    const list = [
      { id: 'bing', name: '必应翻译', note: '免配置' },
      { id: 'microsoft', name: '微软官方 API', note: '需 Key' },
      { id: 'google', name: '谷歌翻译', note: '需代理' },
      { id: 'mymemory', name: 'MyMemory', note: '备用' },
      { id: 'builtin', name: '浏览器内置', note: '离线' }
    ];

    const items = profiles();
    if (items.length) {
      items.forEach(function (profile) {
        list.push({
          id: 'openai:' + profile.id,
          name: profile.name || '大模型',
          note: profile.model || ''
        });
      });
    } else {
      list.push({ id: 'openai', name: '大模型', note: '去设置里添加' });
    }
    return list;
  }

  function engineName(id) {
    const found = engineList().find(function (item) {
      return item.id === id;
    });
    if (found) return found.name;
    if (String(id || '').indexOf('openai') === 0) return '大模型';
    return id;
  }

  function langLabel(item) {
    if (/^zh/.test(item.code) || item.code === 'yue' || item.code === 'lzh') return item.zh;
    return item.zh;
  }

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }


  function build() {
    if (host) return;
    host = document.createElement('div');
    host.className = 'amber-fab-host';
    host.setAttribute('data-amber-skip', '');
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = CSS;

    wrap = document.createElement('div');
    wrap.className = 'wrap';
    wrap.innerHTML = [
      '<div class="sub" id="sub"></div>',
      '<div class="panel" id="panel"></div>',
      '<div class="toast" id="toast"></div>',
      '<div class="count" id="count"></div>',
      '<div class="ball" id="ball" role="button" tabindex="0" aria-label="翻译控制">',
      '  <svg class="ring" id="ring" viewBox="0 0 40 40">',
      '    <circle class="track" cx="20" cy="20" r="18"></circle>',
      '    <circle class="barpath" id="barpath" cx="20" cy="20" r="18"></circle>',
      '  </svg>',
      '  <span class="glyph">译</span>',
      '</div>'
    ].join('\n');

    shadow.appendChild(style);
    shadow.appendChild(wrap);

    ball = shadow.getElementById('ball');
    ring = shadow.getElementById('ring');
    bar = shadow.getElementById('barpath');
    panel = shadow.getElementById('panel');
    sub = shadow.getElementById('sub');
    toast = shadow.getElementById('toast');
    countLabel = shadow.getElementById('count');

    bind();
    (document.body || document.documentElement).appendChild(host);
    applyPlacement();
    applyTheme();
  }

  function applyTheme() {
    if (!wrap) return;
    const s = S.state.settings || {};
    const accent = S.accentColor();

    wrap.setAttribute('data-theme', s.theme === 'light' ? 'light' : 'dark');
    wrap.setAttribute('data-accent', S.accentName());

    /* 四个关键色一起覆盖 —— 光改 --accent-rgb 不够，
       悬浮球的底色来自 --amber-fill，选中态来自 --amber */
    const rs = wrap.style;
    rs.setProperty('--amber', accent.main);
    rs.setProperty('--amber-soft', accent.soft);
    rs.setProperty('--amber-fill', accent.fill);
    rs.setProperty('--on-amber', accent.on);
    rs.setProperty('--accent-rgb', accent.rgb);
  }

  function applyPlacement() {
    const fab = S.state.settings.fab || {};
    const right = Number(fab.right);
    const bottom = Number(fab.bottom);
    wrap.style.right = (isFinite(right) ? right : 22) + 'px';
    wrap.style.bottom = (isFinite(bottom) ? bottom : 22) + 'px';
  }


  function translatedCount() {
    return (S.state.segments || []).filter(function (seg) {
      return seg.trEl;
    }).length;
  }

  function renderMain() {
    if (!panel) return;
    const st = S.state;
    const settings = st.settings;
    const busy = st.translated && st.progress.total > 0 && st.progress.done < st.progress.total;

    let stateText = '未翻译';
    if (busy) stateText = '翻译中 ' + st.progress.done + ' / ' + st.progress.total;
    else if (st.translated) stateText = '已翻译 ' + translatedCount() + ' 段';

    let mainLabel = '翻译此页';
    if (st.translated) mainLabel = busy ? '停止并还原' : '还原原文';

    const font = Number(settings.style && settings.style.fontSize) || 0;
    const mode = st.mode || 'bilingual';

    panel.innerHTML = [
      '<div class="p-head">',
      '  <div class="meta">',
      '    <div class="site">' + escapeHtml(st.domain || location.hostname) + '</div>',
      '    <div class="state">' + stateText + '</div>',
      '  </div>',
      '  <button class="p-close" data-act="close" title="收起">×</button>',
      '</div>',
      '<button class="p-main" data-act="toggle">' + mainLabel + '</button>',

      '<div class="p-block">',
      '  <div class="p-label">显示方式</div>',
      '  <div class="p-seg">',
      ['bilingual', 'translation', 'source']
        .map(function (m) {
          return '<button data-mode="' + m + '"' + (m === mode ? ' class="on"' : '') + '>' + MODE_LABEL[m] + '</button>';
        })
        .join(''),
      '  </div>',
      '</div>',

      '<div class="p-block">',
      '  <button class="p-row' + (subKind === 'languages' ? ' on' : '') + '" data-act="sub" data-kind="languages"><span>目标语言</span><small>' +
        escapeHtml(langLabel({ code: settings.targetLang, zh: (root.AmberLangs ? root.AmberLangs.label(settings.targetLang) : settings.targetLang) })) +
        '</small></button>',
      '  <button class="p-row' + (subKind === 'engines' ? ' on' : '') + '" data-act="sub" data-kind="engines"><span>翻译引擎</span><small>' +
        escapeHtml(engineName(settings.engine)) +
        '</small></button>',
      '</div>',

      '<div class="p-block">',
      '  <div class="p-label">译文字号</div>',
      '  <div class="p-range">',
      '    <input type="range" min="0" max="30" step="1" value="' + font + '" data-act="font">',
      '    <span class="num" id="font-num">' + (font > 0 ? font + 'px' : '跟随') + '</span>',
      '  </div>',
      '</div>',

      '<div class="p-foot">',
      '  <button data-act="save-site">' + (S.state.hasSiteConfig ? '已存本页' : '记住本页') + '</button>',
      '  <button data-act="options">全部设置</button>',
      '  <button data-act="hide">隐藏</button>',
      '</div>'
    ].join('');

    const slider = panel.querySelector('input[data-act="font"]');
    if (slider) {
      const min = Number(slider.min) || 70;
      const max = Number(slider.max) || 160;
      slider.style.setProperty('--fill', (((Number(font) - min) / (max - min)) * 100).toFixed(1) + '%');
    }
  }


  function renderSub() {
    if (!sub || !subKind) return;

    const title = subKind === 'languages' ? '目标语言' : '翻译引擎';
    const rows = ['<div class="sub-head"><button data-act="sub-close">‹</button><span>' + title + '</span></div>'];

    if (subKind === 'engines') {
      rows.push('<div class="sub-list">');
      engineList().forEach(function (item) {
        rows.push(
          '<button class="sub-item' +
            (item.id === S.state.settings.engine ? ' on' : '') +
            '" data-engine="' +
            escapeHtml(item.id) +
            '"><span>' +
            escapeHtml(item.name) +
            '</span><em>' +
            escapeHtml(item.note) +
            '</em></button>'
        );
      });
      rows.push('</div>');
    } else {
      const langs = root.AmberLangs;
      const current = S.state.settings.targetLang;
      rows.push('<div class="sub-list">');
      if (langs) {
        rows.push('<div class="sub-group">常用</div>');
        langs.list
          .filter(function (item) {
            return item.popular;
          })
          .forEach(function (item) {
            rows.push(langRow(item, current));
          });
        rows.push('<div class="sub-group">全部 ' + langs.list.length + ' 种</div>');
        langs.list
          .filter(function (item) {
            return !item.popular;
          })
          .forEach(function (item) {
            rows.push(langRow(item, current));
          });
      }
      rows.push('</div>');
    }

    sub.innerHTML = rows.join('');
  }

  function langRow(item, current) {
    return (
      '<button class="sub-item' +
      (item.code === current ? ' on' : '') +
      '" data-lang="' +
      escapeHtml(item.code) +
      '"><span>' +
      escapeHtml(item.zh) +
      '</span><em>' +
      escapeHtml(item.native) +
      '</em></button>'
    );
  }

  function openSub(kind) {
    build();
    subKind = kind;
    renderSub();
    placeSub();
    sub.classList.add('open');
    renderMain();
  }

  function closeSub() {
    if (!sub) return;
    subKind = null;
    sub.classList.remove('open');
    renderMain();
  }

  function placeSub() {
    if (!sub) return;
    const panelOpenRight = panel.classList.contains('right');
    const offset = 50 + PANEL_WIDTH + 8;

    sub.classList.toggle('right', panelOpenRight);
    sub.classList.toggle('left', !panelOpenRight);

    if (panelOpenRight) {
      sub.style.left = offset + 'px';
      sub.style.right = '';
    } else {
      sub.style.right = offset + 'px';
      sub.style.left = '';
    }
    sub.style.animationName = panelOpenRight ? 'sub-in' : 'sub-in-left';
  }


  let startX = 0;
  let startY = 0;
  let startRight = 0;
  let startBottom = 0;
  let dragging = false;
  let moved = false;

  function bind() {
    ['mousedown', 'mouseup', 'click', 'dblclick', 'pointerdown', 'pointerup', 'contextmenu'].forEach(function (name) {
      host.addEventListener(name, function (e) {
        e.stopPropagation();
      }, false);
    });

    ball.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);

    ball.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        togglePanel();
      }
    });

    panel.addEventListener('click', onPanelClick);
    panel.addEventListener('input', onSlider);
    sub.addEventListener('click', onSubClick);

    document.addEventListener('click', function (e) {
      if (!isOpen) return;
      const path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(host) !== -1) return;
      closePanel();
    }, true);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (subKind) closeSub();
      else if (isOpen) closePanel();
    }, true);
  }

  function onDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();

    if (isOpen) {
      closePanel();
      return;
    }

    dragging = true;
    moved = false;
    const rect = ball.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startRight = window.innerWidth - rect.right;
    startBottom = window.innerHeight - rect.bottom;
    ball.classList.add('dragging');
  }

  function onMove(e) {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    moved = true;
    const right = Math.min(Math.max(4, startRight - dx), window.innerWidth - 46);
    const bottom = Math.min(Math.max(4, startBottom - dy), window.innerHeight - 46);
    wrap.style.right = right + 'px';
    wrap.style.bottom = bottom + 'px';
    wrap.dataset.right = String(Math.round(right));
    wrap.dataset.bottom = String(Math.round(bottom));
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    if (ball) ball.classList.remove('dragging');

    if (moved) {
      const right = Number(wrap.dataset.right);
      const bottom = Number(wrap.dataset.bottom);
      S.send(V.PATCH_SETTINGS, { patch: { fab: { right: right, bottom: bottom } } }).then(function (res) {
        if (res && res.ok && res.data) S.state.settings = res.data;
      });
      return;
    }
    togglePanel();
  }

  function onPanelClick(e) {
    const target = e.target.closest('[data-act], [data-mode]');
    if (!target) return;

    const act = target.getAttribute('data-act');
    const mode = target.getAttribute('data-mode');

    if (mode) {
      root.AmberMain.setMode(mode);
      renderMain();
      return;
    }

    if (act === 'close') closePanel();
    else if (act === 'sub') openSub(target.getAttribute('data-kind'));
    else if (act === 'toggle') {
      S.state.translated ? root.AmberMain.restorePage() : root.AmberMain.translatePage();
      renderMain();
    } else if (act === 'save-site') onSaveSite();
    else if (act === 'options') {
      S.send(V.OPEN_OPTIONS);
      closePanel();
    } else if (act === 'hide') hide();
  }

  async function onSaveSite() {
    if (S.state.hasSiteConfig) {
      const ok = window.confirm('「' + S.state.domain + '」已经存过一套配置，用当前的覆盖它吗？');
      if (!ok) return;
    }

    const res = await S.saveToSite();
    if (res && res.ok) {
      flash('已记住，下次打开 ' + S.state.domain + ' 自动套用', 'ok');
      renderMain();
    } else {
      flash((res && res.error) || '保存失败', 'error');
    }
  }

  function onSubClick(e) {
    const target = e.target.closest('[data-act], [data-lang], [data-engine]');
    if (!target) return;

    const act = target.getAttribute('data-act');
    const lang = target.getAttribute('data-lang');
    const engine = target.getAttribute('data-engine');

    if (act === 'sub-close') {
      closeSub();
      return;
    }

    if (lang) {
      S.patchSettings({ targetLang: lang }).then(function () {
        S.emit('settings');
      });
      closeSub();
      flash('目标语言：' + (root.AmberLangs ? root.AmberLangs.label(lang) : lang), 'ok');
      return;
    }

    if (engine) {
      S.patchSettings({ engine: engine }).then(function () {
        S.emit('settings');
      });
      closeSub();
      flash('已切换到' + engineName(engine), 'ok');
    }
  }

  function onSlider(e) {
    if (e.target.getAttribute('data-act') !== 'font') return;
    const value = Number(e.target.value);
    const min = Number(e.target.min) || 70;
    const max = Number(e.target.max) || 160;
    e.target.style.setProperty('--fill', (((value - min) / (max - min)) * 100).toFixed(1) + '%');

    const num = panel.querySelector('#font-num');
    if (num) num.textContent = value > 0 ? value + 'px' : '跟随';

    S.state.settings.style = S.state.settings.style || {};
    S.state.settings.style.fontSize = value;
    root.AmberInject.applyStyle(S.state.settings.style);

    clearTimeout(fontTimer);
    fontTimer = setTimeout(function () {
      S.patchSettings({ style: { fontSize: value } });
    }, 260);
  }


  function placePanel() {
    const rect = ball.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;

    let openRight;
    if (spaceRight >= PANEL_WIDTH + 16) openRight = true;
    else if (spaceLeft >= PANEL_WIDTH + 16) openRight = false;
    else openRight = spaceRight > spaceLeft;

    panel.classList.toggle('right', openRight);
    panel.classList.toggle('left', !openRight);
    toast.classList.toggle('right', openRight);
    toast.classList.toggle('left', !openRight);

    if (subKind) placeSub();
  }

  function onResize() {
    placePanel();
  }

  function openPanel() {
    if (isOpen) return;
    build();
    isOpen = true;
    subKind = null;
    renderMain();
    placePanel();
    panel.classList.add('open');
    ball.classList.add('active');
    window.addEventListener('resize', onResize);
  }

  function onResize() {
    placePanel();
    if (subKind) placeSub();
  }

  function closePanel() {
    if (!isOpen) return;
    isOpen = false;
    subKind = null;
    panel.classList.remove('open');
    if (sub) sub.classList.remove('open');
    ball.classList.remove('active');
    window.removeEventListener('resize', onResize);
  }

  function togglePanel() {
    if (isOpen) closePanel();
    else openPanel();
  }


  function sync() {
    if (!ball) return;
    applyTheme();
    const st = S.state;
    const busy = st.translated && st.progress.total > 0 && st.progress.done < st.progress.total;

    if (ring) {
      ring.classList.toggle('on', !!st.translated);
      if (bar) {
        const ratio = st.progress.total ? Math.min(1, st.progress.done / st.progress.total) : st.translated ? 1 : 0;
        bar.style.strokeDashoffset = String(125.6 * (1 - ratio));
      }
    }

    if (countLabel) {
      if (busy) {
        countLabel.textContent = st.progress.done + ' / ' + st.progress.total;
        countLabel.classList.add('on');
      } else {
        countLabel.classList.remove('on');
      }
    }

    if (isOpen) renderMain();
  }

  function setProgress(ratio, done, total) {
    if (ring && countLabel && total) {
      ring.classList.add('on');
      if (bar) bar.style.strokeDashoffset = String(125.6 * (1 - Math.min(1, ratio || 0)));
      if (done < total) {
        countLabel.textContent = done + ' / ' + total;
        countLabel.classList.add('on');
      } else {
        countLabel.classList.remove('on');
      }
    }
    if (isOpen) renderMain();
  }

  function flash(message, kind) {
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast on ' + (kind || '');
    toast.classList.toggle('left', panel.classList.contains('left'));
    toast.classList.toggle('right', panel.classList.contains('right'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('on');
    }, 3200);
  }

  function hide() {
    if (host) host.style.display = 'none';
    closePanel();
    S.send(V.PATCH_SETTINGS, { patch: { fab: { enabled: false } } }).then(function (res) {
      if (res && res.ok && res.data) S.state.settings = res.data;
    });
  }

  function show() {
    if (host) host.style.display = '';
  }

  function init() {
    const fab = S.state.settings.fab || {};
    if (fab.enabled === false) return;
    build();
    S.on(function (event) {
      if (event === 'mode' || event === 'progress' || event === 'settings') sync();
    });
    sync();
  }

  root.AmberFab = {
    init: init,
    sync: sync,
    show: show,
    hide: hide,
    flash: flash,
    setProgress: setProgress,
    setBusy: function () {
      sync();
    },
    refresh: function () {
      if (!host) return;
      const enabled = (S.state.settings.fab || {}).enabled !== false;
      host.style.display = enabled ? '' : 'none';
      applyPlacement();
      sync();
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
