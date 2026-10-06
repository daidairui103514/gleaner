/* 内容脚本侧：配置读取、与后台通信、页面状态 */
(function (root) {
  'use strict';

  const STYLE_ID = 'amber-style';

  const FALLBACK_SETTINGS = {
    engine: 'bing',
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    displayMode: 'bilingual',
    style: {
      fontSize: 0,
      lineHeight: 1.6,
      colorMode: 'amber',
      color: '#FAC775',
      amberDark: '#FAC775',
      amberLight: '#9A5B06',
      opacity: 100,
      fontFamily: 'inherit',
      borderStyle: 'line',
      borderColor: '#BA7517',
      background: 'transparent',
      marginTop: 6,
      marginBottom: 14,
      paddingLeft: 10,
      maxWidth: 100
    },
    fab: { enabled: true, right: 24, bottom: 24, opacity: 90 },
    hover: { enabled: true, key: 'Control' },
    select: { enabled: true, mode: 'instant' },
    input: { enabled: true, trigger: 3 },
    subtitle: { enabled: true, fontSize: 100 },
    ocr: { enabled: true, overlay: true },
    auto: { byLang: false, langs: [], always: [], never: [] }
  };

  const state = {
    settings: FALLBACK_SETTINGS,
    siteConfig: null,
    hasSiteConfig: false,
    domain: '',
    translated: false,
    mode: 'bilingual',
    segments: [],
    running: false,
    progress: { done: 0, total: 0 },
    detectLang: '',
    frameReady: false
  };

  const listeners = new Set();

  function emit(event, payload) {
    listeners.forEach(function (fn) {
      try {
        fn(event, payload);
      } catch (e) {
        /* 单个监听器异常不影响其它 */
      }
    });
  }

  function on(fn) {
    listeners.add(fn);
    return function () {
      listeners.delete(fn);
    };
  }

  function send(type, payload) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(Object.assign({ type: type }, payload || {}), function (response) {
          const err = chrome.runtime.lastError;
          if (err) {
            resolve({ ok: false, error: err.message || '扩展通信失败，请刷新页面' });
            return;
          }
          resolve(response || { ok: false, error: '没有收到响应' });
        });
      } catch (e) {
        resolve({ ok: false, error: '扩展已更新或停用，请刷新页面' });
      }
    });
  }

  /** 带重试的翻译请求 */
  async function translate(texts, options) {
    const payload = Object.assign(
      {
        texts: texts,
        from: state.settings.sourceLang,
        to: state.settings.targetLang,
        engine: state.settings.engine,
        pageTitle: document.title
      },
      options || {}
    );

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await send(root.AmberMsg.TRANSLATE, { payload: payload });
      if (res && res.ok && res.data) return res.data.translations || [];
      lastError = (res && res.error) || '翻译失败';
      if (/没有配置|不支持|未知消息/.test(lastError)) break;
      await sleep(600 * Math.pow(2, attempt));
    }
    throw new Error(lastError || '翻译失败');
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function loadSettings() {
    state.domain = root.AmberUtil.domainOf(location.href);
    const res = await send(root.AmberMsg.GET_SITE_CONFIG, { domain: state.domain });
    if (res && res.ok && res.data) {
      state.settings = res.data;
      state.mode = res.data.displayMode || 'bilingual';
      state.hasSiteConfig = !!res.hasSiteConfig;
    }
    return state.settings;
  }

  /**
   * 改设置：这个网站已经存过独立配置就改那一份，否则改全局。
   * 配合「存本页」，就能实现「在页面上调好 -> 记住这个网站」。
   */
  async function patchSettings(patch) {
    if (state.hasSiteConfig && state.domain) {
      const res = await send(root.AmberMsg.SAVE_SITE_CONFIG, { domain: state.domain, patch: patch });
      if (res && res.ok && res.data) state.settings = res.data;
      return res;
    }
    const res = await send(root.AmberMsg.PATCH_SETTINGS, { patch: patch });
    if (res && res.ok && res.data) state.settings = res.data;
    return res;
  }

  /** 把当前这套配置记到这个网站名下 */
  async function saveToSite() {
    if (!state.domain) return { ok: false, error: '这个页面不支持单独保存' };
    const s = state.settings;
    const res = await send(root.AmberMsg.SAVE_SITE_CONFIG, {
      domain: state.domain,
      patch: {
        engine: s.engine,
        targetLang: s.targetLang,
        displayMode: state.mode || s.displayMode,
        style: s.style
      }
    });
    if (res && res.ok) state.hasSiteConfig = true;
    return res;
  }

  function setMode(mode) {
    state.mode = mode;
    state.settings.displayMode = mode;
    emit('mode', mode);
  }

  function setProgress(done, total) {
    state.progress.done = done;
    state.progress.total = total;
    emit('progress', state.progress);
  }

  /** 注入扩展自己的样式表（用于隔离站点样式） */
  function ensureStylesheet() {
    if (document.getElementById(STYLE_ID)) return;
    const link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('content/content.css');
    link.addEventListener('error', function () {
      /* 样式表加载失败时由 fab/bubble 内联样式兜底 */
    });
    (document.head || document.documentElement).appendChild(link);
  }

  /* 设置页改了东西，已经打开的页面要跟着变，不用手动刷新 */
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local' || !changes.settings || !changes.settings.newValue) return;

      /* 这个站点存过独立配置就完全以它为准，全局改动一律不影响它。
         要改这里的设置，用页面上悬浮面板 / 播放器菜单里那套 ——
         那边改完会当场生效，并且直接写进本页的配置。 */
      if (state.hasSiteConfig) return;

      state.settings = changes.settings.newValue;
      state.mode = state.settings.displayMode || state.mode;
      emit('settings');
    });
  } catch (e) {
    /* 忽略 */
  }

  /* 强调色表：界面各个浮层（悬浮球、划词气泡、播放器菜单）都从这里取色，
     否则换了配色之后只有设置页在变，页面上那些还是老颜色。 */
  const ACCENTS = {
    amber: { main: '#e39b2c', soft: '#f5c877', fill: '#a8681a', on: '#1a1508', rgb: '186, 117, 23' },
    teal: { main: '#4bd6b4', soft: '#8ff0d8', fill: '#17705c', on: '#04170f', rgb: '23, 112, 92' },
    indigo: { main: '#96a9f7', soft: '#c3cdfb', fill: '#3b4a9c', on: '#0a0f26', rgb: '59, 74, 156' },
    rose: { main: '#f292b6', soft: '#f9c2d5', fill: '#9c3355', on: '#260a14', rgb: '156, 51, 85' },
    slate: { main: '#c2c0b8', soft: '#dedcd4', fill: '#56544c', on: '#14130f', rgb: '86, 84, 76' }
  };

  function accentColor() {
    const name = (state.settings && state.settings.accent) || 'amber';
    return ACCENTS[name] || ACCENTS.amber;
  }

  function accentName() {
    const name = (state.settings && state.settings.accent) || 'amber';
    return ACCENTS[name] ? name : 'amber';
  }

  root.AmberStore = {
    state: state,
    on: on,
    emit: emit,
    send: send,
    translate: translate,
    sleep: sleep,
    loadSettings: loadSettings,
    patchSettings: patchSettings,
    saveToSite: saveToSite,
    setMode: setMode,
    setProgress: setProgress,
    ensureStylesheet: ensureStylesheet,
    accentColor: accentColor,
    accentName: accentName
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
