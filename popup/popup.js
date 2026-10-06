import { loadSettings, getSiteConfig, saveSiteConfig, removeSiteConfig } from '../common/config.js';
import '../common/languages.js';

const V = {
  DO_STATE_QUERY: 'amber:do-state-query',
  DO_TOGGLE: 'amber:do-toggle',
  DO_SET_MODE: 'amber:do-set-mode',
  DO_EXPORT: 'amber:do-export',
  PATCH_SETTINGS: 'amber:patch-settings',
  SETTINGS_CHANGED: 'amber:settings-changed',
  OPEN_OPTIONS: 'amber:open-options'
};

const BUILTIN_ENGINES = [
  { id: 'bing', name: '必应翻译', note: '免配置' },
  { id: 'microsoft', name: '微软官方 API', note: '需 Key' },
  { id: 'google', name: '谷歌翻译', note: '需代理' },
  { id: 'mymemory', name: 'MyMemory', note: '备用' },
  { id: 'builtin', name: '浏览器内置', note: '离线' }
];

function engineList() {
  const list = BUILTIN_ENGINES.slice();
  const profiles =
    (settings && settings.engines && settings.engines.openai && settings.engines.openai.profiles) || [];
  profiles.forEach(function (profile) {
    list.push({ id: 'openai:' + profile.id, name: profile.name || '大模型', note: profile.model || '' });
  });
  if (!profiles.length) list.push({ id: 'openai', name: '大模型', note: '去设置里添加' });
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

const $ = function (id) {
  return document.getElementById(id);
};

const ACCENTS = {
  amber: { main: '#e39b2c', soft: '#fac775', fill: '#a8681a', on: '#1a1508', rgb: '186, 117, 23' },
  teal: { main: '#4bd6b4', soft: '#8ff0d8', fill: '#17705c', on: '#04170f', rgb: '23, 112, 92' },
  indigo: { main: '#96a9f7', soft: '#c3cdfb', fill: '#3b4a9c', on: '#0a0f26', rgb: '59, 74, 156' },
  rose: { main: '#f292b6', soft: '#f9c2d5', fill: '#9c3355', on: '#260a14', rgb: '156, 51, 85' },
  slate: { main: '#c2c0b8', soft: '#dedcd4', fill: '#56544c', on: '#14130f', rgb: '86, 84, 76' }
};

function applyAccent(name) {
  const a = ACCENTS[name] || ACCENTS.amber;
  const rs = document.documentElement.style;
  rs.setProperty('--amber', a.main);
  rs.setProperty('--amber-soft', a.soft);
  rs.setProperty('--amber-fill', a.fill);
  rs.setProperty('--on-amber', a.on);
  rs.setProperty('--accent-rgb', a.rgb);
  document.documentElement.setAttribute('data-accent', ACCENTS[name] ? name : 'amber');
}

let tab = null;
let domain = '';
let settings = null;
let hasSiteConfig = false;
let state = { translated: false, mode: 'bilingual', progress: { done: 0, total: 0 } };
let listKind = 'engine';
let pollTimer = null;

function langName(code) {
  const langs = globalThis.AmberLangs;
  return langs ? langs.label(code) : code;
}

function isBusy() {
  return (
    state.translated &&
    state.progress &&
    state.progress.total > 0 &&
    state.progress.done < state.progress.total
  );
}

function msg(type, payload) {
  return new Promise(function (resolve) {
    if (!tab || !tab.id) {
      resolve({ ok: false, error: '没有可用的标签页' });
      return;
    }
    chrome.tabs.sendMessage(tab.id, Object.assign({ type: type }, payload || {}), function (res) {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: '这个页面不支持翻译（浏览器内部页面）' });
        return;
      }
      resolve(res || { ok: false });
    });
  });
}

function bg(type, payload) {
  return new Promise(function (resolve) {
    chrome.runtime.sendMessage(Object.assign({ type: type }, payload || {}), function (res) {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(res || { ok: false });
    });
  });
}

/** 改设置：这个网站已经存过独立配置就改那一份，否则改全局 */
async function patchSettings(patch) {
  if (hasSiteConfig && domain) {
    const data = await saveSiteConfig(domain, patch);
    return { ok: true, data: data };
  }
  return bg(V.PATCH_SETTINGS, { patch: patch });
}

function tip(message) {
  const node = $('tip');
  node.textContent = message;
  node.classList.add('on');
  clearTimeout(tip._timer);
  tip._timer = setTimeout(function () {
    node.classList.remove('on');
  }, 3000);
}


function render() {
  const busy = isBusy();

  let stateText = '未翻译';
  if (busy) stateText = '翻译中 ' + state.progress.done + '/' + state.progress.total;
  else if (state.translated) stateText = '已翻译';
  $('state').textContent = stateText;

  const button = $('toggle');
  if (state.translated) {
    button.textContent = busy ? '停止并还原' : '还原原文';
  } else {
    button.textContent = '翻译此页';
  }
  button.disabled = false;

  document.querySelectorAll('#modes button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-mode') === (state.mode || 'bilingual'));
  });

  const font = (settings.style && settings.style.fontSize) || 0;
  $('font').value = String(font);
  $('font-num').textContent = font > 0 ? font + 'px' : '跟随';
  paintRange($('font'));

  $('engine-name').textContent = engineName(settings.engine);
  $('lang-name').textContent = langName(settings.targetLang);
  markAccents(settings.accent || 'amber');
}

function paintRange(input) {
  if (!input) return;
  const min = Number(input.min) || 0;
  const max = Number(input.max) || 100;
  const value = Number(input.value);
  const percent = ((value - min) / (max - min)) * 100;
  input.style.setProperty('--fill', percent + '%');
}

function renderList() {
  const host = $('engine-list');

  if (listKind === 'engine') {
    host.innerHTML = engineList().map(function (item) {
      return (
        '<button class="list-item' +
        (item.id === settings.engine ? ' on' : '') +
        '" data-engine="' +
        item.id +
        '"><span>' +
        item.name +
        '</span><small>' +
        item.note +
        '</small></button>'
      );
    }).join('');
    return;
  }

  const langs = globalThis.AmberLangs;
  if (!langs) return;
  const label = function (item) {
    if (/^zh/.test(item.code) || item.code === 'yue' || item.code === 'lzh') return item.zh;
    return item.zh + ' / ' + item.native;
  };
  host.innerHTML =
    '<div class="list-group">常用</div>' +
    langs.list
      .filter(function (item) {
        return item.popular;
      })
      .map(function (item) {
        return itemRow(item, label);
      })
      .join('') +
    '<div class="list-group">全部 ' +
    langs.list.length +
    ' 种</div>' +
    langs.list
      .filter(function (item) {
        return !item.popular;
      })
      .map(function (item) {
        return itemRow(item, label);
      })
      .join('');
}

function itemRow(item, label) {
  return (
    '<button class="list-item' +
    (item.code === settings.targetLang ? ' on' : '') +
    '" data-lang="' +
    item.code +
    '"><span>' +
    label(item) +
    '</span></button>'
  );
}

function renderSiteView() {
  $('site-domain').textContent = domain || '当前页面';
  $('site-tip').textContent = hasSiteConfig
    ? '当前已使用这个网站的单独设置。'
    : '当前跟随全局设置。保存后，这个网站会记住你现在的选择。';
  $('site-delete').disabled = !hasSiteConfig;
}

function showView(id) {
  ['main-view', 'engine-view', 'site-view'].forEach(function (view) {
    $(view).hidden = view !== id;
  });
}


async function init() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  tab = tabs[0] || null;

  if (tab && tab.url) {
    try {
      domain = new URL(tab.url).hostname.replace(/^www\./, '');
    } catch (e) {
      domain = '';
    }
  }
  $('site').textContent = domain || '当前页面不支持';

  settings = await loadSettings();
  document.documentElement.setAttribute('data-theme', settings.theme === 'light' ? 'light' : 'dark');
  applyAccent(settings.accent);
  const siteConfig = domain ? await getSiteConfig(domain) : null;
  hasSiteConfig = !!siteConfig;
  if (siteConfig) settings = siteConfig;

  const res = await msg(V.DO_STATE_QUERY);
  if (res && res.ok && res.data) {
    state.translated = !!res.data.translated;
    state.mode = res.data.mode || settings.displayMode || 'bilingual';
    state.progress = res.data.progress || { done: 0, total: 0 };
  } else {
    $('state').textContent = '不可用';
  }

  render();
  renderSiteView();

  pollTimer = setInterval(async function () {
    const now = await msg(V.DO_STATE_QUERY);
    if (!now || !now.ok || !now.data) return;
    const busy = now.data.progress && now.data.progress.total > 0 && now.data.progress.done < now.data.progress.total;
    state.translated = !!now.data.translated;
    state.progress = now.data.progress || state.progress;
    if (state.translated && busy) render();
  }, 900);
}

window.addEventListener('unload', function () {
  clearInterval(pollTimer);
});


$('toggle').addEventListener('click', async function () {
  const wasTranslated = state.translated;
  const res = await msg(V.DO_TOGGLE);
  if (!res || !res.ok) {
    tip((res && res.error) || '操作失败，请刷新页面后重试');
    return;
  }
  state.translated = !!(res.data && res.data.translated);
  state.progress = (res.data && res.data.progress) || { done: 0, total: 0 };
  render();
  if (state.translated && !wasTranslated) window.close();
});

document.querySelectorAll('#modes button').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const mode = btn.getAttribute('data-mode');
    state.mode = mode;
    settings.displayMode = mode;
    render();
    patchSettings({ displayMode: mode });
    msg(V.DO_SET_MODE, { mode: mode });
  });
});

let fontTimer = null;
$('font').addEventListener('input', function () {
  const value = Number($('font').value);
  $('font-num').textContent = value > 0 ? value + 'px' : '跟随';
  paintRange($('font'));
  settings.style.fontSize = value;
  clearTimeout(fontTimer);
  fontTimer = setTimeout(function () {
    const patch = { patch: { style: { fontSize: value } } };
    const req = hasSiteConfig && domain ? saveSiteConfig(domain, { style: { fontSize: value } }) : bg(V.PATCH_SETTINGS, patch);
    Promise.resolve(req).then(function () {
      msg(V.SETTINGS_CHANGED, { settings: settings });
    });
  }, 240);
});

function markAccents(name) {
  const el = $('accents');
  if (!el) return;
  el.querySelectorAll('button').forEach(function (b) {
    b.classList.toggle('on', b.getAttribute('data-accent') === name);
  });
}

$('accents').addEventListener('click', async function (e) {
  const dot = e.target.closest('[data-accent]');
  if (!dot) return;
  const name = dot.getAttribute('data-accent');

  applyAccent(name);
  markAccents(name);

  const res = await patchSettings({ accent: name });
  if (res && res.ok && res.data) settings = res.data;

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) await msg(V.SETTINGS_CHANGED, { settings: settings });
  } catch (err) {
  }
});

$('open-engines').addEventListener('click', function () {
  listKind = 'engine';
  document.querySelector('#engine-view .sub-head span').textContent = '选择引擎';
  renderList();
  showView('engine-view');
});

$('open-langs').addEventListener('click', function () {
  listKind = 'language';
  document.querySelector('#engine-view .sub-head span').textContent = '目标语言';
  renderList();
  showView('engine-view');
});

$('back').addEventListener('click', function () {
  showView('main-view');
  render();
});

$('engine-list').addEventListener('click', async function (e) {
  const engineBtn = e.target.closest('[data-engine]');
  const langBtn = e.target.closest('[data-lang]');

  if (engineBtn) {
    const id = engineBtn.getAttribute('data-engine');
    const res = await patchSettings({ engine: id });
    if (res.ok) settings = res.data;
    showView('main-view');
    render();
    tip('已切换到' + engineName(id));
    msg(V.SETTINGS_CHANGED, { settings: settings });
  } else if (langBtn) {
    const code = langBtn.getAttribute('data-lang');
    const res = await patchSettings({ targetLang: code });
    if (res.ok) settings = res.data;
    showView('main-view');
    render();
    tip('目标语言：' + langName(code));
    msg(V.SETTINGS_CHANGED, { settings: settings });
  }
});


$('site-config').addEventListener('click', function () {
  renderSiteView();
  showView('site-view');
});

$('site-back').addEventListener('click', function () {
  showView('main-view');
});

$('site-save').addEventListener('click', async function () {
  if (!domain) {
    $('site-tip').textContent = '当前页面不支持单独配置。';
    return;
  }
  await saveSiteConfig(domain, {
    engine: settings.engine,
    targetLang: settings.targetLang,
    displayMode: settings.displayMode || 'bilingual',
    style: settings.style
  });
  hasSiteConfig = true;
  renderSiteView();
  $('site-tip').textContent = '已保存。以后打开 ' + domain + ' 会用这套设置。';
});

$('site-delete').addEventListener('click', async function () {
  if (!domain) return;
  await removeSiteConfig(domain);
  hasSiteConfig = false;
  settings = await loadSettings();
  render();
  renderSiteView();
  $('site-tip').textContent = '已删除，' + domain + ' 改回跟随全局设置。';
});

$('options').addEventListener('click', function () {
  chrome.runtime.openOptionsPage();
  window.close();
});

init();
