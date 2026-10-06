/* 视频双语字幕
   不去改播放器原生的字幕 DOM（那样会被它的滚动/重建冲掉，或者和原字幕叠成好几行），
   而是「接管渲染」——把原生字幕隐藏掉，在同一位置自己画一层「原文 + 译文」。 */
(function (root) {
  'use strict';

  const S = root.AmberStore;
  const U = root.AmberUtil;
  const V = root.AmberMsg;

  /* 原字幕文本元素 */
  const TEXT_SELECTORS = [
    '.ytp-caption-segment',
    '.caption-visual-line',
    '.bpx-player-subtitle-panel-text',
    '.player-timedtext-text-container span',
    '.shaka-text-container span',
    '.vjs-text-track-cue',
    '.jw-text-track-cue',
    '.dplayer-subtitle',
    '[class*="subtitle-text"]',
    '[class*="SubtitleText"]'
  ];

  /* 字幕窗口。最小的放最前：YouTube 滚动字幕时 DOM 里会同时存在多个窗口，
     必须能单独拿到「这一个」，否则同一句会被抓好几遍。 */
  const CONTAINER_SELECTORS = [
    '.caption-window',
    '#ytp-caption-window-container',
    '.ytp-caption-window-container',
    '.bpx-player-subtitle-panel',
    '#bpx-player-subtitle-panel',
    '.player-timedtext',
    '.vjs-text-track-display',
    '.jw-text-track-display',
    '.shaka-text-container'
  ];

  /* 播放器右下角控制栏 */
  const CONTROLS_SELECTORS = [
    '.ytp-right-controls',
    '.bpx-player-control-bottom-right',
    '.vjs-control-bar',
    '.jw-controlbar .jw-button-container'
  ];

  const BTN_CLASS = 'amber-player-btn';
  const MENU_CLASS = 'amber-player-menu';
  const LAYER_CLASS = 'amber-subtitle';

  let observer = null;
  let video = null;
  let lastText = '';
  let requestId = 0;
  let ticking = false;
  let watcher = null;
  let nativeNode = null;
  let layer = null;
  let lastContainer = null;
  let floatBtn = null;
  const cache = new Map();

  /* ------------------------------------------------------------ 元素查找 */

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function visibleTextOf(node) {
    let rect;
    try {
      rect = node.getBoundingClientRect();
    } catch (e) {
      return '';
    }
    if (rect.width <= 1 || rect.height <= 1) return '';
    /* 用 visibility 隐藏过的元素照样能读到文本，所以隐藏后不会自断 */
    return normalizeText(node.textContent);
  }

  /**
   * 取当前正在显示的那一条字幕。
   * 优先按「字幕窗口」取，且只取最后一个非空窗口。
   */
  function currentSubtitleText() {
    for (let i = 0; i < CONTAINER_SELECTORS.length; i++) {
      let windows;
      try {
        windows = Array.from(document.querySelectorAll(CONTAINER_SELECTORS[i]));
      } catch (e) {
        continue;
      }

      const showing = [];
      windows.forEach(function (node) {
        const text = visibleTextOf(node);
        if (text) showing.push({ node: node, text: text });
      });
      if (!showing.length) continue;

      const latest = showing[showing.length - 1];
      return { text: latest.text, nodes: [latest.node], container: latest.node };
    }

    for (let i = 0; i < TEXT_SELECTORS.length; i++) {
      let nodes;
      try {
        nodes = Array.from(document.querySelectorAll(TEXT_SELECTORS[i]));
      } catch (e) {
        continue;
      }

      const parts = [];
      const picked = [];
      nodes.forEach(function (node) {
        const value = visibleTextOf(node);
        if (!value) return;
        picked.push(node);
        if (parts.indexOf(value) === -1) parts.push(value);
      });
      if (!parts.length) continue;

      const text = normalizeText(parts.join(' '));
      if (text) return { text: text, nodes: picked, container: null };
    }

    return null;
  }

  function findVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    let best = null;
    let bestArea = 0;
    videos.forEach(function (v) {
      const rect = v.getBoundingClientRect();
      const area = rect.width * rect.height;
      if (area > bestArea) {
        bestArea = area;
        best = v;
      }
    });
    return best;
  }

  function findControls() {
    for (let i = 0; i < CONTROLS_SELECTORS.length; i++) {
      let node = null;
      try {
        node = document.querySelector(CONTROLS_SELECTORS[i]);
      } catch (e) {
        continue;
      }
      if (node) return node;
    }
    return null;
  }

  /* ---------------------------------------------------- 接管式双语渲染 */

  function ensureLayer() {
    if (layer && layer.isConnected) return layer;

    layer = document.createElement('div');
    layer.className = LAYER_CLASS;
    layer.setAttribute('data-amber-skip', '');
    layer.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      'z-index:2147482000',
      'pointer-events:none',
      'text-align:center',
      'display:none',
      'box-sizing:border-box',
      'padding:2px 0'
    ].join(';');
    layer.innerHTML =
      '<span class="' + LAYER_CLASS + '-src"></span><span class="' + LAYER_CLASS + '-dst"></span>';
    (document.body || document.documentElement).appendChild(layer);
    applyLayerAccent();
    return layer;
  }

  /**
   * 字幕层是挂在页面 DOM 上的，页面里没有扩展的 CSS 变量，
   * 不挂上去的话 var(--amber-soft) 取不到值，译文会退回继承色（变成灰白）。
   */
  function applyLayerAccent() {
    if (!layer) return;
    const accent = S.accentColor();
    const rs = layer.style;
    rs.setProperty('--amber', accent.main);
    rs.setProperty('--amber-soft', accent.soft);
    rs.setProperty('--amber-fill', accent.fill);
    rs.setProperty('--on-amber', accent.on);
    rs.setProperty('--accent-rgb', accent.rgb);
  }

  /**
   * 把页面上所有原生字幕窗口统统藏起来。
   * 只藏一个是不够的 —— YouTube 滚动字幕时 DOM 里同时挂着好几个窗口
   * （正在淡出的旧的 + 正在淡入的新的），漏掉的那些会继续显示原文，
   * 看起来就成了「重复好几行」。
   */
  function hideAllNative() {
    let nodes = [];
    try {
      nodes = Array.from(document.querySelectorAll(CONTAINER_SELECTORS.join(',')));
    } catch (e) {
      return;
    }
    nodes.forEach(function (node) {
      if (node.getAttribute('data-amber-hidden') === '1') return;
      node.setAttribute('data-amber-hidden', '1');
      /* 用 visibility 而不是 display：位置和尺寸还能量，只是看不见 */
      node.style.setProperty('visibility', 'hidden', 'important');
    });
  }

  function restoreAllNative() {
    document.querySelectorAll('[data-amber-hidden]').forEach(function (node) {
      node.style.removeProperty('visibility');
      node.removeAttribute('data-amber-hidden');
    });
    nativeNode = null;
  }

  function syncPosition(container) {
    if (!layer || !container || !container.isConnected) return;
    const rect = container.getBoundingClientRect();
    if (rect.height < 2) return;

    const video = findVideo();
    const videoWidth = video ? video.getBoundingClientRect().width : window.innerWidth;

    /* 宽度不能跟着原生容器走：原文短的时候容器很窄，
       长句译文会被挤成一列一个字。改成水平居中于原生字幕，
       宽度在「视频宽度的一半」到「92%」之间自适应。 */
    const centerX = rect.left + rect.width / 2;
    const minWidth = Math.max(rect.width, Math.min(videoWidth * 0.5, videoWidth - 80));

    layer.style.top = Math.round(rect.top) + 'px';
    layer.style.left = Math.round(centerX) + 'px';
    layer.style.transform = 'translateX(-50%)';
    layer.style.width = 'auto';
    layer.style.minWidth = Math.round(minWidth) + 'px';
    layer.style.maxWidth = Math.round(videoWidth * 0.92) + 'px';
    layer.style.height = 'auto';
  }

  /**
   * 字号基准取「原生字幕文字元素」的字号。
   * 容器（.caption-window）的字号往往是继承来的或者很小，
   * 拿它当基准算出来的译文会比原字幕小一截。
   */
  function baseSizeFor(container, nodes) {
    const scale = ((S.state.settings.subtitle && S.state.settings.subtitle.fontSize) || 100) / 100;
    let base = 0;

    /* 优先取容器里真正显示文字的那一层 —— 容器自身的字号往往小一截 */
    let probes = [];
    if (container) {
      try {
        probes = Array.from(container.querySelectorAll(TEXT_SELECTORS.join(',')));
      } catch (e) {
        probes = [];
      }
    }
    if (!probes.length && nodes && nodes.length) probes = nodes;

    /* 取其中最大的字号 —— 越靠内层（真正显示文字的那层）字号越大，
       不能取第一个：querySelectorAll 按 DOM 顺序返回，
       外层包裹元素（.caption-visual-line 之类）排在前面，字号偏小。 */
    let biggest = 0;
    for (let i = 0; i < probes.length; i++) {
      const size = parseFloat(getComputedStyle(probes[i]).fontSize);
      if (size && isFinite(size) && size > biggest) biggest = size;
    }
    if (biggest > 6) base = biggest;

    if (!base && container) {
      const size = parseFloat(getComputedStyle(container).fontSize);
      if (size && isFinite(size) && size > 6) base = size;
    }

    if (!base) base = 21;
    return Math.round(base * (scale || 1));
  }

  /** 字幕两行共用的基础样式；底色和描影按设置走 */
  function lineStyles(fontSize) {
    const cfg = S.state.settings.subtitle || {};
    const bg = cfg.background || 'translucent';

    const background =
      bg === 'none' ? 'transparent' : bg === 'solid' ? 'rgba(8,8,8,.93)' : 'rgba(8,8,8,.55)';
    const padding = bg === 'none' ? '2px 4px' : '2px 10px';
    /* 去掉底色之后光靠字色看不清，把描影加重 */
    const shadow =
      bg === 'none'
        ? 'text-shadow:0 1px 4px rgba(0,0,0,.95), 0 0 12px rgba(0,0,0,.85);'
        : 'text-shadow:0 1px 3px rgba(0,0,0,.9);';

    return (
      'display:inline-block;max-width:96%;border-radius:4px;' +
      'white-space:pre-wrap;word-break:break-word;' +
      'background:' + background + ';padding:' + padding + ';' +
      'font-size:' + fontSize + 'px;line-height:1.38;' + shadow
    );
  }

  function subOffset() {
    const value = Number((S.state.settings.subtitle || {}).offset);
    return isFinite(value) && value >= 0 ? value : 7;
  }

  function renderBilingual(container, source, translation, pending, nodes) {
    const node = ensureLayer();
    applyLayerAccent();

    if (container) {
      hideAllNative();
      lastContainer = container;
      syncPosition(container);
    }

    const fontSize = container ? baseSizeFor(container, nodes) : 21;
    const mode = (S.state.settings.subtitle && S.state.settings.subtitle.display) || 'bilingual';
    const blur = !!(S.state.settings.subtitle && S.state.settings.subtitle.blur);

    const lineBase = lineStyles(fontSize);

    const srcNode = node.querySelector('.' + LAYER_CLASS + '-src');
    const dstNode = node.querySelector('.' + LAYER_CLASS + '-dst');

    const showSrc = mode !== 'translation';
    const showDst = mode !== 'source';

    /* 还没翻译好：先把原文顶上去。
       既不显示「翻译中」这种占位文字，也不让字幕整块消失，
       翻译返回后再补上译文。 */
    if (pending && !translation) {
      srcNode.textContent = source;
      srcNode.style.cssText = lineBase + 'color:#fff;margin:0 2px;';
      dstNode.textContent = '';
      dstNode.style.cssText = 'display:none;';
      node.style.display = 'block';
      return;
    }

    srcNode.textContent = source;
    srcNode.style.cssText = lineBase + 'color:#fff;margin:0 2px;' + (showSrc ? '' : 'display:none;');

    dstNode.textContent = translation;
    dstNode.style.cssText =
      lineBase +
      'color:var(--amber-soft);margin:2px 2px 0;' +
      'font-family:"Songti SC","SimSun",Georgia,serif;' +
      (showDst ? '' : 'display:none;') +
      (blur ? 'filter:blur(4px);' : '');

    node.style.display = 'block';
  }

  function clearAll() {
    if (layer) layer.style.display = 'none';
    restoreAllNative();
    lastContainer = null;
  }

  /* -------------------------------------------------------------- 主循环 */

  /* -------------------------------------------- 字幕轨（预翻译快车道）

     页面世界的嗅探器会把整条带时间戳的字幕送过来，
     我们提前把后面几十句翻好，轮到显示时直接取缓存 —— 零延迟。
     YouTube 和 B 站走这条路，其他站点退回下面的实时抓 DOM 方案。 */

  const track = {
    rows: [],
    site: '',
    lang: '',
    index: -1,
    prefetchTo: 0,
    /* 嗅探器的进度文字，出问题时显示在菜单里 */
    status: ''
  };

  function adoptTrack(data) {
    const rows = data.rows || [];

    /* 内容完全一样就不用重来（嗅探器会补发几次同样的数据） */
    if (
      track.rows.length === rows.length &&
      track.rows[0] &&
      rows[0] &&
      track.rows[0].text === rows[0].text &&
      track.site === data.site
    ) {
      return;
    }

    track.site = data.site || '';
    track.lang = data.lang || '';
    track.status = '';
    track.index = -1;
    track.prefetchTo = 0;
    track.rows = rows.map(function (row) {
      return {
        start: Number(row.start) || 0,
        end: Number(row.end) || 0,
        text: String(row.text || '').trim(),
        translation: '',
        pending: false
      };
    });

    /* 换视频了，先把上一支的字幕清掉 */
    lastText = '';
    if (layer) layer.style.display = 'none';

    /* 从当前播放位置开始预翻，边看边往后翻 */
    const video = findVideo();
    prefetch(findIndexAt(video ? video.currentTime : 0));
  }

  function findIndexAt(time) {
    const rows = track.rows;
    if (!rows.length) return -1;

    const cur = rows[track.index];
    if (cur && time >= cur.start - 0.25 && time <= cur.end + 0.7) return track.index;

    for (let i = Math.max(0, track.index); i < Math.min(rows.length, track.index + 6); i++) {
      const row = rows[i];
      if (row && time >= row.start - 0.25 && time <= row.end + 0.7) return i;
    }

    let lo = 0;
    let hi = rows.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].start <= time) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best >= 0 && time <= rows[best].end + 0.7) return best;
    return -1;
  }

  async function prefetch(fromIndex) {
    const rows = track.rows;
    if (!rows.length) return;

    /* 一次多备一些，并且并发跑 —— 字幕翻译必须跑在播放前面，
       否则用户会先看到一句没译文的原文 */
    const until = Math.min(rows.length, Math.max(0, fromIndex) + 300);
    const batch = [];
    for (let i = Math.max(0, fromIndex); i < until; i++) {
      const row = rows[i];
      if (!row || row.translation || row.pending || !row.text) continue;
      row.pending = true;
      batch.push(row);
    }
    if (!batch.length) return;
    track.prefetchTo = until;

    const chunks = [];
    for (let i = 0; i < batch.length; i += 12) {
      chunks.push(batch.slice(i, i + 12));
    }

    let cursor = 0;
    async function worker() {
      while (cursor < chunks.length) {
        const chunk = chunks[cursor++];
        try {
          const out = await S.translate(
            chunk.map(function (row) {
              return row.text.slice(0, 400);
            })
          );
          chunk.forEach(function (row, k) {
            row.translation = (out && out[k]) || '';
            row.pending = false;
          });
          /* 翻到的正好是当前显示那句时，立刻把译文补上去 */
          const current = track.rows[track.index];
          if (current && chunk.indexOf(current) !== -1) renderTrackRow(current);
        } catch (e) {
          /* 单批失败不要整批放弃 —— 清掉标记等下一轮重试 */
          chunk.forEach(function (row) {
            row.pending = false;
          });
        }
      }
    }

    await Promise.all([worker(), worker(), worker()]);
  }

  function renderTrackRow(row) {
    const node = ensureLayer();
    applyLayerAccent();
    const video = findVideo();
    if (!node || !video) return;

    const rect = video.getBoundingClientRect();
    if (rect.width < 120) return;

    const scale = ((S.state.settings.subtitle && S.state.settings.subtitle.fontSize) || 100) / 100;
    /* 按视频宽度估算基准字号，和播放器自带字幕的观感接近 */
    const base = Math.max(15, Math.round(rect.width * 0.024));
    const fontSize = Math.max(12, Math.round(base * scale));

    const mode = (S.state.settings.subtitle && S.state.settings.subtitle.display) || 'bilingual';
    const blur = !!(S.state.settings.subtitle && S.state.settings.subtitle.blur);
    const showSrc = mode !== 'translation';
    const showDst = mode !== 'source';

    const lineBase = lineStyles(fontSize);

    const srcNode = node.querySelector('.' + LAYER_CLASS + '-src');
    const dstNode = node.querySelector('.' + LAYER_CLASS + '-dst');
    const value = row.translation || '';

    srcNode.textContent = row.text;
    srcNode.style.cssText = lineBase + 'color:#fff;margin:0 2px;' + (showSrc ? '' : 'display:none;');

    dstNode.textContent = value;
    dstNode.style.cssText =
      lineBase +
      'color:var(--amber-soft);margin:2px 2px 0;' +
      'font-family:"Songti SC","SimSun",Georgia,serif;' +
      (showDst && value ? '' : 'display:none;') +
      (blur ? 'filter:blur(4px);' : '');

    /* 贴在视频底部（不依赖原生字幕的位置），同时把播放器自带的字幕藏掉 */
    hideAllNative();
    node.style.display = 'block';
    node.style.left = Math.round(rect.left + rect.width / 2) + 'px';
    node.style.top = 'auto';
    node.style.transform = 'translateX(-50%)';
    node.style.bottom = Math.round(window.innerHeight - rect.bottom + rect.height * (subOffset() / 100)) + 'px';
    node.style.width = 'auto';
    node.style.minWidth = Math.round(rect.width * 0.3) + 'px';
    node.style.maxWidth = Math.round(rect.width * 0.92) + 'px';
    node.style.height = 'auto';

    lastContainer = null;
  }

  function tickTrack() {
    const video = findVideo();
    if (!video || !track.rows.length) return;

    const index = findIndexAt(video.currentTime);
    if (index === track.index) return;
    track.index = index;

    if (index < 0) {
      if (layer) layer.style.display = 'none';
      return;
    }

    /* 快到预翻边界了就继续往后翻；当前这句还没译文就立刻补一次 */
    const row = track.rows[index];
    if (!row.translation && !row.pending) prefetch(index);
    else if (index + 60 > track.prefetchTo) prefetch(index);

    renderTrackRow(row);
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    const data = e.data;
    if (!data || data.source !== 'amber-subtitle-track') return;

    /* 嗅探器说换视频了：清掉上一支的字幕，别继续显示旧的 */
    if (data.reset) {
      track.rows = [];
      track.index = -1;
      track.prefetchTo = 0;
      track.status = '换视频，重新抓取…';
      lastText = '';
      if (layer) layer.style.display = 'none';
      return;
    }

    /* 嗅探器上报的进度，方便定位卡在哪一步 */
    if (data.status) {
      track.status = data.status;
      return;
    }
    if (data.error || !Array.isArray(data.rows) || !data.rows.length) return;
    adoptTrack(data);
  });

  async function tick() {
    if (ticking) return;
    const config = S.state.settings.subtitle || {};

    if (config.enabled === false) {
      if (lastText) {
        lastText = '';
        clearAll();
      }
      if (layer) layer.style.display = 'none';
      return;
    }

    /* 有字幕轨就走预翻译快车道（零延迟），没有才退回实时抓 DOM */
    if (track.rows.length) {
      tickTrack();
      return;
    }

    const found = currentSubtitleText();
    if (!found) {
      if (lastText) {
        lastText = '';
        clearAll();
      }
      return;
    }

    if (found.text === lastText) {
      /* 文本没变，但播放器可能又挂上了新的字幕窗口，或者尺寸变了 */
      hideAllNative();
      if (lastContainer && lastContainer.isConnected) syncPosition(lastContainer);
      return;
    }

    lastText = found.text;

    if (cache.has(found.text)) {
      renderBilingual(found.container, found.text, cache.get(found.text), false, found.nodes);
      return;
    }

    /* 先接管：立刻藏掉原生字幕并占位，不等网络返回。
       否则在等翻译的这几秒里，用户会先看到原文闪一下才换成译文。 */
    renderBilingual(found.container, found.text, '', true, found.nodes);

    ticking = true;
    const id = ++requestId;
    try {
      const out = await S.translate([found.text.slice(0, 600)]);
      const value = (out && out[0]) || '';
      if (id !== requestId) return;
      cache.set(found.text, value);
      if (cache.size > 400) {
        cache.delete(cache.keys().next().value);
      }
      if (lastText !== found.text) return;
      renderBilingual(found.container, found.text, value, false, found.nodes);
    } catch (e) {
      /* 单条失败跳过，不打扰观看 */
    } finally {
      ticking = false;
    }
  }

  const onMutate = U.throttle(function () {
    tick();
  }, 120);

  /* -------------------------------------------------------- 播放器菜单 */

  function menuHtml() {
    const config = S.state.settings.subtitle || {};
    const on = config.enabled !== false;
    const display = config.display || 'bilingual';
    const blur = !!config.blur;
    const bg = config.background || 'translucent';
    const fontSize = config.fontSize || 100;
    const langs = root.AmberLangs;
    const langLabel = langs ? langs.label(S.state.settings.targetLang) : S.state.settings.targetLang;

    const engines = [
      { id: 'bing', name: '必应翻译' },
      { id: 'microsoft', name: '微软官方' },
      { id: 'google', name: '谷歌翻译' },
      { id: 'mymemory', name: 'MyMemory' },
      { id: 'builtin', name: '内置离线' }
    ];
    const profiles =
      (S.state.settings.engines && S.state.settings.engines.openai && S.state.settings.engines.openai.profiles) ||
      [];
    profiles.forEach(function (p) {
      engines.push({ id: 'openai:' + p.id, name: p.name || '大模型' });
    });

    const label = { bilingual: '双语', translation: '仅译文', source: '仅原文' };

    return [
      '<div class="amber-pm-title">视频字幕</div>',
      '<div class="amber-pm-row"><span>字幕翻译</span><button class="amber-pm-switch' +
        (on ? ' on' : '') +
        '" data-pm="toggle-sub"><i></i></button></div>',
      '<div class="amber-pm-row"><span>显示</span><div class="amber-pm-seg">' +
        ['bilingual', 'translation', 'source']
          .map(function (m) {
            return (
              '<button data-pm="display" data-value="' +
              m +
              '"' +
              (m === display ? ' class="on"' : '') +
              '>' +
              label[m] +
              '</button>'
            );
          })
          .join('') +
        '</div></div>',
      '<div class="amber-pm-row"><span>译文字号</span><div class="amber-pm-range">' +
        '<input type="range" min="80" max="180" step="5" value="' +
        fontSize +
        '" data-pm="font" /><b>' +
        fontSize +
        '%</b></div></div>',
      '<div class="amber-pm-row"><span>模糊译文</span><button class="amber-pm-switch' +
        (blur ? ' on' : '') +
        '" data-pm="blur"><i></i></button></div>',
      '<div class="amber-pm-row"><span>底色</span><div class="amber-pm-seg">' +
        [['solid', '实底'], ['translucent', '半透'], ['none', '透明']]
          .map(function (pair) {
            return (
              '<button data-pm="bg" data-value="' +
              pair[0] +
              '"' +
              (pair[0] === bg ? ' class="on"' : '') +
              '>' +
              pair[1] +
              '</button>'
            );
          })
          .join('') +
        '</div></div>',
      '<div class="amber-pm-row"><span>引擎</span><select data-pm="engine">' +
        engines
          .map(function (e) {
            return (
              '<option value="' +
              e.id +
              '"' +
              (e.id === S.state.settings.engine ? ' selected' : '') +
              '>' +
              e.name +
              '</option>'
            );
          })
          .join('') +
        '</select></div>',
      '<div class="amber-pm-row"><span>目标语言</span><b>' + langLabel + '</b></div>',
      '<div class="amber-pm-row"><span>字幕轨</span><b>' +
        (track.rows.length
          ? track.rows.length + ' 条 · 已预翻译'
          : track.status || '未获取到，走实时抓取') +
        '</b></div>',
      '<div class="amber-pm-foot"><button data-pm="options">全部设置</button></div>'
    ].join('');
  }

  function menuStyle() {
    return [
      '.amber-pm-title{font-size:11px;color:rgba(237,229,213,.45);letter-spacing:.05em;margin-bottom:9px}',
      '.amber-pm-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0}',
      '.amber-pm-row>span{color:#A59B87;flex:0 0 auto;font-size:12.5px}',
      '.amber-pm-row>b{color:#EDE5D5;font-weight:400;font-size:12.5px}',
      '.amber-pm-row select{background:#262319;color:#EDE5D5;border:1px solid rgba(235,216,180,.16);border-radius:7px;padding:3px 6px;font:inherit;font-size:12px;max-width:118px}',
      '.amber-pm-switch{position:relative;width:36px;height:20px;border-radius:10px;border:1px solid rgba(235,216,180,.2);background:#262319;cursor:pointer;padding:0;flex:0 0 auto}',
      '.amber-pm-switch i{position:absolute;left:2px;top:2px;width:14px;height:14px;border-radius:50%;background:#7c7466;transition:transform .18s,background .18s}',
      '.amber-pm-switch.on{background:var(--amber-fill);border-color:var(--amber-fill)}',
      '.amber-pm-switch.on i{transform:translateX(16px);background:var(--on-amber)}',
      '.amber-pm-seg{display:flex;gap:3px}',
      '.amber-pm-seg button{padding:4px 8px;border:1px solid rgba(235,216,180,.16);border-radius:7px;background:transparent;color:#A59B87;font:inherit;font-size:11.5px;cursor:pointer}',
      '.amber-pm-seg button.on{background:var(--amber-fill);border-color:var(--amber-fill);color:var(--on-amber)}',
      '.amber-pm-range{display:flex;align-items:center;gap:8px}',
      '.amber-pm-range input{-webkit-appearance:none;appearance:none;width:84px;height:16px;background:transparent;cursor:pointer}',
      '.amber-pm-range input::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:rgba(235,216,180,.18)}',
      '.amber-pm-range input::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;margin-top:-4px;border-radius:50%;background:var(--amber);border:2px solid #1d1b17}',
      '.amber-pm-range b{color:var(--amber);font-weight:400;font-size:12px;min-width:38px;text-align:right}',
      '.amber-pm-foot{margin-top:9px;padding-top:9px;border-top:1px solid rgba(235,216,180,.1)}',
      '.amber-pm-foot button{width:100%;padding:7px 0;border:1px solid rgba(235,216,180,.16);border-radius:8px;background:transparent;color:#A59B87;font:inherit;font-size:12px;cursor:pointer}',
      '.amber-pm-foot button:hover{color:var(--amber);border-color:rgba(var(--accent-rgb),.45)}'
    ].join('');
  }

  function closeMenu() {
    const menu = document.querySelector('.' + MENU_CLASS);
    if (menu) menu.remove();
  }

  function repaint() {
    /* 走字幕轨时要用轨道那套渲染 —— 之前这里固定走实时那套，
       所以改了底色 / 字号画面上完全没反应 */
    if (track.rows.length) {
      const row = track.rows[track.index];
      if (row) renderTrackRow(row);
      return;
    }

    if (!lastText) return;
    const found = currentSubtitleText();
    const container = (found && found.container) || lastContainer;
    if (!container) return;
    renderBilingual(container, lastText, cache.get(lastText) || '', false, found && found.nodes);
  }

  async function onMenuEvent(e) {
    const target = e.target.closest('[data-pm]');
    if (!target) return;
    const action = target.getAttribute('data-pm');
    const subtitle = Object.assign({}, S.state.settings.subtitle || {});

    if (action === 'toggle-sub') {
      subtitle.enabled = !(subtitle.enabled !== false);
      target.classList.toggle('on', subtitle.enabled);
      if (!subtitle.enabled) clearAll();
    } else if (action === 'display') {
      subtitle.display = target.getAttribute('data-value');
      target.parentElement.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('on', b === target);
      });
    } else if (action === 'blur') {
      subtitle.blur = !subtitle.blur;
      target.classList.toggle('on', subtitle.blur);
    } else if (action === 'bg') {
      subtitle.background = target.getAttribute('data-value');
      target.parentElement.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('on', b === target);
      });
    } else if (action === 'font') {
      subtitle.fontSize = Number(target.value);
      const num = target.parentElement.querySelector('b');
      if (num) num.textContent = subtitle.fontSize + '%';
      S.state.settings.subtitle = subtitle;
      repaint();
      clearTimeout(onMenuEvent._timer);
      onMenuEvent._timer = setTimeout(function () {
        S.patchSettings({ subtitle: subtitle });
      }, 300);
      return;
    } else if (action === 'engine') {
      await S.patchSettings({ engine: target.value });
      return;
    } else if (action === 'options') {
      S.send(V.OPEN_OPTIONS);
      closeMenu();
      return;
    } else {
      return;
    }

    await S.patchSettings({ subtitle: subtitle });
    S.state.settings.subtitle = subtitle;
    repaint();
  }

  function toggleMenu(btn) {
    if (document.querySelector('.' + MENU_CLASS)) {
      closeMenu();
      return;
    }

    const menu = document.createElement('div');
    menu.className = MENU_CLASS;
    menu.setAttribute('data-amber-skip', '');
    menu.innerHTML = menuHtml();
    menu.style.cssText = [
      'position:absolute',
      'right:4px',
      'bottom:56px',
      'z-index:2147482500',
      'width:236px',
      'padding:11px 12px',
      'border-radius:12px',
      'background:rgba(24,22,19,.97)',
      'border:1px solid rgba(var(--accent-rgb),.4)',
      'box-shadow:0 14px 36px rgba(0,0,0,.5)',
      'color:#EDE5D5',
      'font:13px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
      'backdrop-filter:blur(16px)'
    ].join(';');

    const style = document.createElement('style');
    style.textContent = menuStyle();
    menu.appendChild(style);

    /* 菜单挂在页面 DOM 里，拿不到扩展的变量，得自己把配色挂上去 */
    const accent = S.accentColor();
    menu.style.setProperty('--amber', accent.main);
    menu.style.setProperty('--amber-soft', accent.soft);
    menu.style.setProperty('--amber-fill', accent.fill);
    menu.style.setProperty('--on-amber', accent.on);
    menu.style.setProperty('--accent-rgb', accent.rgb);

    menu.addEventListener('click', onMenuEvent);
    menu.addEventListener('input', onMenuEvent);
    menu.addEventListener('change', onMenuEvent);

    const holder = btn.closest('#movie_player, .html5-video-player, .bpx-player-container');
    if (holder) {
      holder.appendChild(menu);
    } else {
      /* 浮动按钮的情况：菜单也走 fixed，贴在按钮上方 */
      const rect = btn.getBoundingClientRect();
      menu.style.position = 'fixed';
      menu.style.right = Math.max(8, window.innerWidth - rect.right - 186) + 'px';
      menu.style.bottom = Math.max(8, window.innerHeight - rect.top + 8) + 'px';
      document.body.appendChild(menu);
    }

    document.addEventListener(
      'click',
      function onDoc(ev) {
        if (menu.contains(ev.target) || btn.contains(ev.target)) return;
        menu.remove();
        document.removeEventListener('click', onDoc, true);
      },
      true
    );
  }

  function createButton() {
    const btn = document.createElement('button');
    btn.className = BTN_CLASS;
    btn.type = 'button';
    btn.title = '拾穗译 · 字幕设置';
    btn.setAttribute('data-amber-skip', '');
    btn.textContent = '译';
    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'justify-content:center',
      'flex:0 0 auto',
      'width:40px',
      'height:100%',
      'padding:0',
      'border:0',
      'background:transparent',
      'color:#fff',
      'cursor:pointer',
      'opacity:.92',
      'font-size:14px',
      'font-weight:600',
      'line-height:1',
      'font-family:inherit',
      'vertical-align:top'
    ].join(';');
    btn.addEventListener('mouseenter', function () {
      btn.style.opacity = '1';
      btn.style.color = 'var(--amber)';
    });
    btn.addEventListener('mouseleave', function () {
      btn.style.opacity = '.92';
      btn.style.color = '#fff';
    });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      toggleMenu(btn);
    });
    return btn;
  }

  function positionFloat(video) {
    if (!floatBtn || !video) return;
    const rect = video.getBoundingClientRect();
    if (rect.width < 120) return;
    floatBtn.style.left = Math.round(rect.right - 46) + 'px';
    floatBtn.style.top = Math.round(rect.bottom - 96) + 'px';
  }

  function ensureFloatButton(video) {
    if (floatBtn && floatBtn.isConnected) {
      positionFloat(video);
      return;
    }
    floatBtn = createButton();
    const accent = S.accentColor();
    floatBtn.style.cssText +=
      ';position:fixed;z-index:2147482400;width:34px;height:34px;border-radius:50%;' +
      'background:rgba(24,22,19,.86);border:1px solid rgba(var(--accent-rgb),.55);color:var(--amber);' +
      'box-shadow:0 4px 14px rgba(0,0,0,.4);backdrop-filter:blur(10px);';
    floatBtn.style.setProperty('--amber', accent.main);
    floatBtn.style.setProperty('--accent-rgb', accent.rgb);
    document.body.appendChild(floatBtn);
    positionFloat(video);
  }

  /**
   * 播放器按钮：优先插进原生控制栏；
   * 控制栏找不到（或者被播放器重建冲掉）时，退而在视频右下角浮一个小球。
   */
  function injectPlayerButton() {
    const controls = findControls();

    if (controls) {
      if (floatBtn) {
        floatBtn.remove();
        floatBtn = null;
      }
      const existing = controls.querySelector('.' + BTN_CLASS);
      if (existing && existing.isConnected) return;
      const btn = createButton();
      btn.classList.add('ytp-button');
      controls.insertBefore(btn, controls.firstChild);
      return;
    }

    const video = findVideo();
    if (video) ensureFloatButton(video);
  }

  /* -------------------------------------------------------------- 生命周期 */

  function start() {
    if (!observer) {
      observer = new MutationObserver(function () {
        onMutate();
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    if (!watcher) {
      watcher = setInterval(function () {
        const v = findVideo();
        if (!v) {
          if (lastText) {
            lastText = '';
            clearAll();
          }
          return;
        }
        injectPlayerButton();
        if (floatBtn && floatBtn.isConnected) positionFloat(v);
        onMutate();
      }, 700);
    }

    /* 字幕轨模式：靠播放进度切句，轮询要密一点才不会拖拍 */
    setInterval(function () {
      if (!track.rows.length) return;
      const config = S.state.settings.subtitle || {};
      if (config.enabled === false) {
        if (layer) layer.style.display = 'none';
        return;
      }
      tickTrack();
    }, 250);

    ['resize', 'fullscreenchange', 'webkitfullscreenchange'].forEach(function (name) {
      window.addEventListener(name, function () {
        /* 字幕轨模式：字号是按视频宽度算的，尺寸一变必须重画 */
        if (track.rows.length) {
          const row = track.rows[track.index];
          if (row) renderTrackRow(row);
          return;
        }
        if (lastContainer && lastContainer.isConnected) syncPosition(lastContainer);
      });
    });

    /* 设置页改完立刻在当前页生效 */
    S.on(function (event) {
      if (event !== 'settings') return;
      if (track.rows.length) {
        const row = track.rows[track.index];
        if (row) renderTrackRow(row);
      } else if (lastContainer && lastText) {
        repaint();
      }
      injectPlayerButton();
    });

    /* 嗅探器在 document_start 就跑，而这边是 document_idle 才加载，
       它发消息时接收端可能还不存在 —— 那条消息会永久丢掉。
       所以主动去问一次，并且隔几秒补问，直到拿到为止。 */
    [0, 1500, 4000, 9000].forEach(function (delay) {
      setTimeout(function () {
        if (track.rows.length) return;
        try {
          window.postMessage({ source: 'amber-subtitle-request' }, '*');
        } catch (e) {
          /* 忽略 */
        }
      }, delay);
    });

    injectPlayerButton();
    onMutate();
  }

  function init() {
    if (findVideo()) {
      start();
      return;
    }

    let tries = 0;
    const timer = setInterval(function () {
      tries++;
      if (findVideo()) {
        clearInterval(timer);
        start();
      } else if (tries >= 300) {
        clearInterval(timer);
      }
    }, 1000);
  }

  root.AmberSubtitle = {
    init: init,
    refresh: function () {
      clearAll();
      lastText = '';
      injectPlayerButton();
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
