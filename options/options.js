import {
  DEFAULT_SETTINGS,
  mergeSettings,
  loadSettings,
  saveSettings,
  loadSiteConfigs,
  removeSiteConfig,
  newProfileId
} from '../common/config.js';
import { ENGINE_LIST } from '../engines/index.js';
import { rebuildSelects, bindRanges } from '../common/ui.js';
import '../common/languages.js';

const $ = function (id) {
  return document.getElementById(id);
};

let settings = null;
let saveTimer = null;
let toastTimer = null;

/* --------------------------------------------------------------- 路径工具 */

function getPath(obj, path) {
  return path.split('.').reduce(function (acc, key) {
    return acc == null ? undefined : acc[key];
  }, obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

/* ---------------------------------------------------------------- 保存 */

function markSaving() {
  const node = $('save-state');
  node.textContent = '保存中';
  node.classList.remove('flash');
}

function markSaved() {
  const node = $('save-state');
  node.textContent = '已保存';
  node.classList.add('flash');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    node.textContent = '改动自动保存';
    node.classList.remove('flash');
  }, 1600);
}

async function commit() {
  try {
    settings = await saveSettings(settings);
    markSaved();
    const tabs = await chrome.tabs.query({});
    tabs.forEach(function (tab) {
      if (!tab.id) return;
      chrome.tabs
        .sendMessage(tab.id, { type: 'amber:settings-changed', settings: settings })
        .catch(function () {});
    });
  } catch (e) {
    $('save-state').textContent = '保存失败';
  }
}

function scheduleCommit(needPreview) {
  markSaving();
  if (needPreview) renderPreview();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(commit, 280);
}

/* ------------------------------------------------------------ 控件绑定表 */

const VAL = 'value';
const NUM = 'number';
const CHK = 'checked';

const CONTROLS = [
  /* 视频字幕 */
  { id: 'subtitle-enabled', path: 'subtitle.enabled', type: CHK },
  { id: 'subtitle-display', path: 'subtitle.display', type: VAL },
  { id: 'subtitle-blur', path: 'subtitle.blur', type: CHK },
  { id: 'subtitle-background', path: 'subtitle.background', type: VAL },
  { id: 'subtitle-fontSize', path: 'subtitle.fontSize', type: NUM, label: 'v-subtitle-fontSize' },
  { id: 'subtitle-offset', path: 'subtitle.offset', type: NUM, label: 'v-subtitle-offset' },
  { id: 'promptLevel', path: 'promptLevel', type: VAL },
  { id: 'useContext', path: 'useContext', type: CHK },
  { id: 'targetLang', path: 'targetLang', type: VAL },
  { id: 'sourceLang', path: 'sourceLang', type: VAL },
  { id: 'concurrency', path: 'concurrency', type: NUM, label: 'v-concurrency' },

  { id: 'colorMode', path: 'style.colorMode', type: VAL, preview: true, after: syncColorPanels },
  { id: 'amberDark', path: 'style.amberDark', type: VAL, preview: true },
  { id: 'amberLight', path: 'style.amberLight', type: VAL, preview: true },
  { id: 'customColor', path: 'style.color', type: VAL, preview: true },
  { id: 'borderColor', path: 'style.borderColor', type: VAL, preview: true },
  { id: 'borderStyle', path: 'style.borderStyle', type: VAL, preview: true },
  { id: 'fontFamily', path: 'style.fontFamily', type: VAL, preview: true },
  { id: 'fontSize', path: 'style.fontSize', type: NUM, preview: true, label: 'v-fontSize' },
  { id: 'opacity', path: 'style.opacity', type: NUM, preview: true, label: 'v-opacity', suffix: '%' },
  { id: 'lineHeight', path: 'style.lineHeight', type: NUM, preview: true, label: 'v-lineHeight', digits: 1 },
  { id: 'paddingLeft', path: 'style.paddingLeft', type: NUM, preview: true, label: 'v-paddingLeft', suffix: 'px' },
  { id: 'maxWidth', path: 'style.maxWidth', type: NUM, preview: true, label: 'v-maxWidth', suffix: 'px' },
  { id: 'marginTop', path: 'style.marginTop', type: NUM, preview: true, label: 'v-marginTop', suffix: 'px' },
  { id: 'marginBottom', path: 'style.marginBottom', type: NUM, preview: true, label: 'v-marginBottom', suffix: 'px' },

  { id: 'auto-byLang', path: 'auto.byLang', type: CHK },
  { id: 'fab-enabled', path: 'fab.enabled', type: CHK },
  { id: 'fab-opacity', path: 'fab.opacity', type: NUM, label: 'v-fabOpacity', suffix: '%' },
  { id: 'fab-bottom', path: 'fab.bottom', type: NUM, label: 'v-fabBottom', suffix: 'px' },
  { id: 'hover-enabled', path: 'hover.enabled', type: CHK },
  { id: 'hover-key', path: 'hover.key', type: VAL },
  { id: 'input-enabled', path: 'input.enabled', type: CHK },
  { id: 'input-trigger', path: 'input.trigger', type: NUM },
  { id: 'pdf-enabled', path: 'pdf.enabled', type: CHK },
  { id: 'ocr-enabled', path: 'ocr.enabled', type: CHK },
  { id: 'subtitle-enabled', path: 'subtitle.enabled', type: CHK },
  { id: 'cache-enabled', path: 'cache.enabled', type: CHK },
  { id: 'cache-days', path: 'cache.maxAgeDays', type: NUM, label: 'v-cacheDays', suffix: ' 天' }
];

/* ---------------------------------------------------------------- 渲染 */

function langOptionLabel(item) {
  /* 中文的 nativeName 和中文名基本重复，只显示中文名 */
  if (/^zh/.test(item.code) || item.code === 'yue' || item.code === 'lzh') return item.zh;
  return item.zh + '（' + item.native + '）';
}

function fillLangSelect(select, withAuto) {
  const langs = globalThis.AmberLangs;
  if (!langs || !select) return;
  select.innerHTML = '';

  if (withAuto) {
    const auto = document.createElement('option');
    auto.value = 'auto';
    auto.textContent = '自动检测';
    select.appendChild(auto);
  }

  const popular = document.createElement('optgroup');
  popular.label = '常用';
  const rest = document.createElement('optgroup');
  rest.label = '全部 ' + langs.list.length + ' 种';

  langs.list.forEach(function (item) {
    const option = document.createElement('option');
    option.value = item.code;
    option.textContent = langOptionLabel(item);
    (item.popular ? popular : rest).appendChild(option);
  });

  select.appendChild(popular);
  select.appendChild(rest);
}

function fillEngineSelect() {
  /* 引擎选择已经改成卡片列表，这里只在旧结构还存在时才填 */
  const select = $('engine');
  if (!select) return;
  select.innerHTML = '';
  ENGINE_LIST.forEach(function (engine) {
    const option = document.createElement('option');
    option.value = engine.id;
    option.textContent = engine.name;
    select.appendChild(option);
  });
}

function updateLabel(control) {
  const node = control.label ? $(control.label) : null;
  if (!node) return;
  const el = $(control.id);
  let value = Number(el.value);
  if (control.digits) value = value.toFixed(control.digits);

  if (node.tagName === 'INPUT') {
    if (document.activeElement !== node) node.value = String(value);
  } else {
    node.textContent = value + (control.suffix || '');
  }
}

function render() {
  fillLangSelect($('targetLang'), false);
  fillLangSelect($('sourceLang'), true);
  fillEngineSelect();

  CONTROLS.forEach(function (control) {
    const el = $(control.id);
    if (!el) return;
    const value = getPath(settings, control.path);
    if (control.type === CHK) el.checked = value !== false;
    else if (value !== undefined && value !== null) el.value = String(value);
    if (control.label) updateLabel(control);
  });

  const selectMode = settings.select || {};
  $('select-mode').value = selectMode.enabled === false ? 'off' : selectMode.mode || 'icon';

  $('auto-always').value = (settings.auto.always || []).join('\n');
  $('auto-never').value = (settings.auto.never || []).join('\n');
  $('terms').value = (settings.terms || [])
    .map(function (term) {
      return term.from + ' => ' + term.to;
    })
    .join('\n');

  renderAutoLangs();
  renderSiteList().catch(function () {});
  renderEngineList();
  renderEngineDetail();
  rebuildSelects(document);
  bindRanges(document);
  syncColorPanels();
  renderPreview();
  refreshCacheStat();
}

/* ---------------------------------------------------------- 引擎与配置 */

const BUILTIN_ENGINES = [
  { id: 'bing', name: '必应翻译', desc: '免注册、免密钥，国内可直连', note: '免配置' },
  { id: 'microsoft', name: '微软官方 API', desc: 'Azure 翻译，最稳定', note: '' },
  { id: 'google', name: '谷歌翻译', desc: '免密钥，国内需要浏览器走代理', note: '' },
  { id: 'mymemory', name: 'MyMemory', desc: '备用免费通道，质量一般', note: '免配置' },
  { id: 'builtin', name: '浏览器内置', desc: '完全离线，需要较新版本', note: '免配置' }
];

function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/'/g, '&#39;');
}

function openaiConfig() {
  const engines = settings.engines || (settings.engines = {});
  const cfg = engines.openai || (engines.openai = {});
  if (!Array.isArray(cfg.profiles)) cfg.profiles = [];
  return cfg;
}

function renderEngineList() {
  const host = $('engine-list');
  if (!host) return;
  const current = settings.engine || 'bing';

  const rows = BUILTIN_ENGINES.map(function (item) {
    return engineRow(item.id, item.name, item.desc, item.note, current);
  });

  const cfg = openaiConfig();
  if (!cfg.profiles.length) {
    rows.push(engineRow('openai', '大模型', '还没有添加配置，往下翻可以添加', '需配置', current));
  } else {
    cfg.profiles.forEach(function (profile) {
      rows.push(
        engineRow(
          'openai:' + profile.id,
          profile.name || '大模型',
          (profile.model || '') + (profile.baseUrl ? ' · ' + profile.baseUrl : ''),
          profile.apiKey ? '' : '未填 Key',
          current
        )
      );
    });
  }

  host.innerHTML = rows.join('');
}

function engineRow(id, name, desc, badge, current) {
  return (
    '<button class="engine-item' +
    (id === current ? ' on' : '') +
    '" data-engine="' +
    escapeAttr(id) +
    '">' +
    '<span class="dot"></span>' +
    '<span class="info"><strong>' +
    escapeHtml(name) +
    '</strong><small>' +
    escapeHtml(desc) +
    '</small></span>' +
    (badge ? '<span class="badge">' + escapeHtml(badge) + '</span>' : '') +
    '</button>'
  );
}

const FREEFORM_ENGINES = {
  bing: '这个引擎免注册、免密钥，国内可直连，选好目标语言就能直接翻译。',
  google: '免密钥，但国内通常需要浏览器走代理才能连上。',
  mymemory: '备用免费通道，不需要配置，单段长度有限、质量一般。',
  builtin: '使用浏览器内置的离线模型，不需要配置，受地区与硬件限制。'
};

/** 下面这块只在选中某个引擎时才出现 */
function renderEngineDetail() {
  const host = $('engine-detail');
  if (!host) return;

  const id = settings.engine || 'bing';

  if (FREEFORM_ENGINES[id]) {
    const meta = BUILTIN_ENGINES.find(function (item) {
      return item.id === id;
    });
    host.innerHTML =
      '<p class="glabel">' +
      escapeHtml(meta ? meta.name : id) +
      '</p><div class="detail-card"><p class="detail-note">' +
      FREEFORM_ENGINES[id] +
      '</p></div>';
    return;
  }

  if (id === 'microsoft') {
    const cfg = settings.engines.microsoft || {};
    host.innerHTML = [
      '<p class="glabel">微软官方 API</p>',
      '<div class="detail-card">',
      '  <div class="row2">',
      '    <div class="field"><label>订阅 Key</label><input type="password" data-ms="apiKey" value="' + escapeAttr(cfg.apiKey || '') + '" placeholder="Azure 门户里的 Key" autocomplete="off" /></div>',
      '    <div class="field"><label>区域 Region</label><input type="text" data-ms="region" value="' + escapeAttr(cfg.region || '') + '" placeholder="例如 eastasia" /></div>',
      '  </div>',
      '  <p class="detail-note">在 Azure 门户创建「翻译工具」资源，选 F0 免费层，每月 200 万字符免费。</p>',
      '  <div class="row-actions">',
      '    <button class="btn" data-act="test-ms">测试这套配置</button>',
      '    <span class="tip inline" id="ms-test"></span>',
      '  </div>',
      '</div>'
    ].join('');
    return;
  }

  const cfg = openaiConfig();
  const pid = id.indexOf('openai:') === 0 ? id.slice(7) : cfg.activeId || (cfg.profiles[0] || {}).id;
  const profile = cfg.profiles.find(function (item) {
    return item.id === pid;
  });

  if (!profile) {
    host.innerHTML =
      '<p class="glabel">大模型配置</p><div class="detail-card"><p class="detail-note">还没有添加配置，点上面的「添加一套大模型配置」新建一套。</p></div>';
    return;
  }

  const p = escapeAttr(pid);
  host.innerHTML = [
    '<p class="glabel">' + escapeHtml(profile.name || '大模型') + ' 的配置</p>',
    '<div class="detail-card">',
    '  <p class="detail-note">改完自动保存。名称和模型名会同步显示在上面的引擎列表里。</p>',
    '  <div class="row2">',
    '    <div class="field"><label>名称</label><input type="text" data-field="name" data-id="' + p + '" value="' + escapeAttr(profile.name || '') + '" placeholder="例如 DeepSeek" /></div>',
    '    <div class="field"><label>模型名</label><input type="text" data-field="model" data-id="' + p + '" value="' + escapeAttr(profile.model || '') + '" placeholder="deepseek-chat" /></div>',
    '  </div>',
    '  <div class="field"><label>接口地址</label><input type="text" data-field="baseUrl" data-id="' + p + '" value="' + escapeAttr(profile.baseUrl || '') + '" placeholder="https://api.deepseek.com/v1" /></div>',
    '  <div class="field"><label>API Key</label><input type="password" data-field="apiKey" data-id="' + p + '" value="' + escapeAttr(profile.apiKey || '') + '" placeholder="sk-..." autocomplete="off" /></div>',
    '  <div class="row2">',
    '    <div class="field"><label>温度</label><input type="number" data-field="temperature" data-id="' + p + '" value="' + escapeAttr(profile.temperature == null ? 0.2 : profile.temperature) + '" min="0" max="2" step="0.1" /></div>',
    '    <div class="field"><label>超时（毫秒）</label><input type="number" data-field="timeout" data-id="' + p + '" value="' + escapeAttr(profile.timeout || 60000) + '" min="5000" step="1000" /></div>',
    '  </div>',
    '  <div class="row-actions">',
    '    <button class="btn" data-act="test" data-id="' + p + '">测试这套配置</button>',
    '    <button class="btn danger" data-act="remove" data-id="' + p + '">删除这套配置</button>',
    '    <span class="tip inline" id="profile-test-' + p + '"></span>',
    '  </div>',
    '</div>'
  ].join('');
}

function removeProfile(id) {
  const cfg = openaiConfig();
  cfg.profiles = cfg.profiles.filter(function (item) {
    return item.id !== id;
  });
  if (cfg.activeId === id) cfg.activeId = cfg.profiles.length ? cfg.profiles[0].id : '';
  if (settings.engine === 'openai:' + id) {
    settings.engine = cfg.profiles.length ? 'openai:' + cfg.activeId : 'bing';
  }
  renderEngineList();
  renderEngineDetail();
  scheduleCommit(false);
}

function applyTheme() {
  const theme = settings.theme === 'light' ? 'light' : 'dark';
  const accent = settings.accent || 'amber';
  const root = document.documentElement;

  root.setAttribute('data-theme', theme);
  root.setAttribute('data-accent', accent);

  const btn = $('theme-toggle');
  if (btn) btn.textContent = theme === 'light' ? '切换到深色' : '切换到亮色';

  const picker = $('accent-picker');
  if (picker) {
    picker.querySelectorAll('button').forEach(function (dot) {
      dot.classList.toggle('on', dot.getAttribute('data-accent') === accent);
    });
  }
}

function syncColorPanels() {
  const mode = $('colorMode').value;
  /* 预设和「跟随原文」都不用取色器，只有自定义才显示 */
  $('amber-colors').hidden = true;
  $('custom-colors').hidden = mode !== 'custom';
}

const COLOR_PRESETS = {
  amber: { dark: '#fac775', light: '#9a5b06' },
  teal: { dark: '#7fd8c0', light: '#0f6e56' },
  indigo: { dark: '#a3b4f5', light: '#3b4a9c' },
  rose: { dark: '#f3a6c0', light: '#a83258' },
  slate: { dark: '#bdbab1', light: '#56544c' }
};

function colorFor(style, dark) {
  if (style.colorMode === 'inherit') return 'inherit';
  if (style.colorMode === 'custom') return style.color;
  const preset = COLOR_PRESETS[style.colorMode];
  if (preset) return dark ? preset.dark : preset.light;
  return dark ? style.amberDark : style.amberLight;
}

function fontFamilyOf(value) {
  if (value === 'serif') return 'Georgia, "Songti SC", "SimSun", serif';
  if (value === 'sans') return '-apple-system, "Segoe UI", "Microsoft YaHei", sans-serif';
  if (value === 'mono') return 'ui-monospace, Consolas, monospace';
  return 'inherit';
}

function renderPreview() {
  const style = settings.style;
  document.querySelectorAll('.preview').forEach(function (block) {
    const dark = block.classList.contains('dark');
    const src = block.querySelector('.p-src');
    const dst = block.querySelector('.p-dst');
    if (!dst) return;

    dst.style.fontSize = style.fontSize > 0 ? style.fontSize + 'px' : '15px';
    dst.style.color = colorFor(style, dark);
    dst.style.opacity = String((style.opacity == null ? 100 : style.opacity) / 100);
    dst.style.lineHeight = String(style.lineHeight);
    dst.style.maxWidth = style.maxWidth ? style.maxWidth + 'px' : 'none';
    dst.style.paddingLeft = (style.paddingLeft == null ? 10 : style.paddingLeft) + 'px';
    dst.style.marginTop = (style.marginTop == null ? 6 : style.marginTop) + 'px';
    dst.style.marginBottom = (style.marginBottom == null ? 14 : style.marginBottom) + 'px';
    dst.style.borderLeftWidth = style.borderStyle === 'none' ? '0' : '2px';
    dst.style.borderLeftStyle = style.borderStyle === 'dashed' ? 'dashed' : 'solid';
    dst.style.borderLeftColor = style.borderColor || '#BA7517';
    dst.style.fontFamily = fontFamilyOf(style.fontFamily);
    if (src) src.style.fontSize = '13px';
  });
}

function renderAutoLangs() {
  const container = $('auto-langs');
  const langs = globalThis.AmberLangs;
  if (!container || !langs) return;
  const selected = settings.auto.langs || [];
  container.innerHTML = '';

  langs.popular.forEach(function (code) {
    const item = langs.map[code.toLowerCase()];
    if (!item) return;
    const btn = document.createElement('button');
    btn.textContent = item.zh;
    btn.dataset.code = code;
    btn.classList.toggle('on', selected.indexOf(code) !== -1);
    btn.addEventListener('click', function () {
      const list = settings.auto.langs || [];
      const index = list.indexOf(code);
      if (index === -1) list.push(code);
      else list.splice(index, 1);
      settings.auto.langs = list;
      btn.classList.toggle('on');
      scheduleCommit(false);
    });
    container.appendChild(btn);
  });
}

async function renderSiteList() {
  const siteConfigs = await loadSiteConfigs();
  const container = $('site-list');
  const domains = Object.keys(siteConfigs);
  container.innerHTML = '';

  if (!domains.length) {
    container.innerHTML = '<p class="empty">还没有单独配置的网站。</p>';
    return;
  }

  domains.forEach(function (domain) {
    const config = siteConfigs[domain];
    const item = document.createElement('div');
    item.className = 'site-item';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = domain;

    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = (config.engine || settings.engine) + ' / ' + (config.targetLang || '');

    const remove = document.createElement('button');
    remove.textContent = '删除';
    remove.addEventListener('click', async function () {
      await removeSiteConfig(domain);
      renderSiteList();
    });

    item.appendChild(name);
    item.appendChild(meta);
    item.appendChild(remove);
    container.appendChild(item);
  });
}

async function refreshCacheStat() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'amber:cache-stats' });
    const count = res && res.ok && res.data ? res.data.count : 0;
    $('cache-stat').textContent = '缓存 ' + count + ' 条';
  } catch (e) {
    $('cache-stat').textContent = '缓存不可读';
  }
}

/* ---------------------------------------------------------------- 绑定 */

function bindControls() {
  CONTROLS.forEach(function (control) {
    const el = $(control.id);
    if (!el) return;
    const event = control.type === CHK ? 'change' : control.type === NUM ? 'input' : 'change';
    el.addEventListener(event, function () {
      if (control.type === CHK) setPath(settings, control.path, el.checked);
      else if (control.type === NUM) setPath(settings, control.path, Number(el.value));
      else setPath(settings, control.path, el.value);
      if (control.label) updateLabel(control);
      if (control.after) control.after();
      scheduleCommit(!!control.preview);
    });
  });

  $('select-mode').addEventListener('change', function () {
    const value = $('select-mode').value;
    settings.select = value === 'off' ? { enabled: false, mode: 'icon' } : { enabled: true, mode: value };
    scheduleCommit(false);
  });

  ['auto-always', 'auto-never'].forEach(function (id) {
    $(id).addEventListener('input', function () {
      const list = $(id)
        .value.split('\n')
        .map(function (line) {
          return line.trim().toLowerCase();
        })
        .filter(Boolean);
      if (id === 'auto-always') settings.auto.always = list;
      else settings.auto.never = list;
      scheduleCommit(false);
    });
  });

  $('terms').addEventListener('input', function () {
    settings.terms = $('terms')
      .value.split('\n')
      .map(function (line) {
        const parts = line.split('=>');
        if (parts.length < 2) return null;
        const from = parts[0].trim();
        const to = parts.slice(1).join('=>').trim();
        if (!from || !to) return null;
        return { from: from, to: to, enabled: true };
      })
      .filter(Boolean);
    scheduleCommit(false);
  });

  $('reset-style').addEventListener('click', function () {
    settings.style = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.style));
    render();
    scheduleCommit(true);
  });

  const picker = $('accent-picker');
  if (picker) {
    picker.addEventListener('click', function (e) {
      const dot = e.target.closest('[data-accent]');
      if (!dot) return;
      settings.accent = dot.getAttribute('data-accent');
      applyTheme();
      scheduleCommit(false);
    });
  }

  $('theme-toggle').addEventListener('click', function () {
    settings.theme = settings.theme === 'light' ? 'dark' : 'light';
    applyTheme();
    scheduleCommit(false);
  });

  $('clear-cache').addEventListener('click', clearCache);
  $('clear-cache-2').addEventListener('click', clearCache);
  $('test-engine').addEventListener('click', testEngine);
  $('export-settings').addEventListener('click', exportSettings);
  $('import-settings').addEventListener('click', importSettings);

  $('reset-all').addEventListener('click', async function () {
    settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    await saveSettings(settings);
    render();
    markSaved();
    $('test-result').textContent = '已恢复全部默认设置。';
  });

  bindNav();
  bindBanner();
  bindEngineControls();

  window.addEventListener('beforeunload', function () {
    clearTimeout(saveTimer);
    commit();
  });
}

async function testProfile(id) {
  const node = $('profile-test-' + id);
  if (node) node.textContent = '正在测试…';

  const cfg = openaiConfig();
  const profile = cfg.profiles.find(function (item) {
    return item.id === id;
  });
  if (!profile) {
    if (node) node.textContent = '找不到这套配置';
    return;
  }

  try {
    /* 先把还没保存的编辑写进去，再测 */
    await commit();
    const res = await chrome.runtime.sendMessage({
      type: 'amber:translate',
      payload: {
        texts: ['The quick brown fox jumps over the lazy dog.'],
        engine: 'openai:' + id,
        from: 'en',
        to: settings.targetLang
      }
    });
    const ok = res && res.ok && res.data && res.data.translations && res.data.translations[0];
    if (node) {
      node.textContent = ok
        ? '连通正常：' + res.data.translations[0]
        : '测试失败：' + ((res && res.error) || '没有返回结果');
    }
  } catch (err) {
    if (node) node.textContent = '测试失败：' + ((err && err.message) || '未知错误');
  }
}

function bindEngineControls() {
  const list = $('engine-list');
  if (list) {
    list.addEventListener('click', function (e) {
      const item = e.target.closest('[data-engine]');
      if (!item) return;
      settings.engine = item.getAttribute('data-engine');
      renderEngineList();
      renderEngineDetail();
      scheduleCommit(false);
    });
  }

  const host = $('engine-detail');

  if (host) {
    host.addEventListener('click', function (e) {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      const id = btn.getAttribute('data-id');

      if (act === 'test') testProfile(id);
      else if (act === 'test-ms') testMicrosoft();
      else if (act === 'remove') removeProfile(id);
    });

    /* 输入时只更新数据，不重建 DOM，避免输入框失焦 */
    host.addEventListener('input', function (e) {
      const msField = e.target.getAttribute('data-ms');
      if (msField) {
        const cfg = settings.engines.microsoft || (settings.engines.microsoft = {});
        cfg[msField] = e.target.value;
        markSaving();
        return;
      }

      const field = e.target.getAttribute('data-field');
      if (!field) return;
      const id = e.target.getAttribute('data-id');
      const cfg = openaiConfig();
      const profile = cfg.profiles.find(function (item) {
        return item.id === id;
      });
      if (!profile) return;
      profile[field] = e.target.value;
      markSaving();
    });

    /* 离开输入框后刷新引擎列表里的名称 */
    host.addEventListener('focusout', function () {
      clearTimeout(focusTimer);
      focusTimer = setTimeout(function () {
        commit().then(function () {
          renderEngineList();
        });
      }, 240);
    });
  }

  const add = $('add-profile');
  if (add) {
    add.addEventListener('click', function () {
      const cfg = openaiConfig();
      const profile = {
        id: newProfileId(),
        name: '大模型 ' + (cfg.profiles.length + 1),
        baseUrl: 'https://api.deepseek.com/v1',
        model: 'deepseek-chat',
        apiKey: '',
        temperature: 0.2,
        timeout: 60000
      };
      cfg.profiles.push(profile);
      cfg.activeId = profile.id;
      /* 新建后直接切过去，下面的配置区就会显示它的表单 */
      settings.engine = 'openai:' + profile.id;
      renderEngineList();
      renderEngineDetail();
      scheduleCommit(false);
    });
  }
}

async function testMicrosoft() {
  const node = $('ms-test');
  if (node) node.textContent = '正在测试…';
  try {
    await commit();
    const res = await chrome.runtime.sendMessage({
      type: 'amber:translate',
      payload: {
        texts: ['The quick brown fox jumps over the lazy dog.'],
        engine: 'microsoft',
        from: 'en',
        to: settings.targetLang
      }
    });
    const ok = res && res.ok && res.data && res.data.translations && res.data.translations[0];
    if (node) {
      node.textContent = ok
        ? '连通正常：' + res.data.translations[0]
        : '测试失败：' + ((res && res.error) || '没有返回结果');
    }
  } catch (err) {
    if (node) node.textContent = '测试失败：' + ((err && err.message) || '未知错误');
  }
}

let focusTimer = null;

function bindNav() {
  const links = Array.from(document.querySelectorAll('#nav a'));

  function show(id) {
    let found = false;
    document.querySelectorAll('main > section').forEach(function (section) {
      const on = section.id === id;
      section.hidden = !on;
      if (on) found = true;
    });
    if (!found) return false;
    links.forEach(function (link) {
      link.classList.toggle('on', link.getAttribute('href') === '#' + id);
    });
    /* 分区从 hidden 变可见后要重新量一次，否则自定义下拉按 0 宽度算出来是错的 */
    rebuildSelects(document);
    bindRanges(document);
    return true;
  }

  links.forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      const id = link.getAttribute('href').slice(1);
      if (show(id)) history.replaceState(null, '', '#' + id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  const initial = location.hash.slice(1);
  if (!show(initial || 'sec-engine')) show('sec-engine');
}

function bindBanner() {
  const banner = $('pin-banner');
  if (localStorage.getItem('amber-pin-tip') === 'done') {
    banner.hidden = true;
    return;
  }
  banner.hidden = false;
  $('pin-close').addEventListener('click', function () {
    banner.hidden = true;
    localStorage.setItem('amber-pin-tip', 'done');
  });
}

async function clearCache() {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'amber:clear-cache' });
    await refreshCacheStat();
    $('test-result').textContent = res && res.ok ? '缓存已清空。' : '清空失败。';
  } catch (e) {
    $('test-result').textContent = '清空失败：' + ((e && e.message) || '未知错误');
  }
}

async function testEngine() {
  const node = $('test-result');
  node.textContent = '正在测试…';
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'amber:translate',
      payload: {
        texts: ['The quick brown fox jumps over the lazy dog.'],
        engine: settings.engine,
        from: 'en',
        to: settings.targetLang
      }
    });
    if (res && res.ok && res.data && res.data.translations && res.data.translations[0]) {
      node.textContent = '连通正常：' + res.data.translations[0];
    } else {
      node.textContent = '测试失败：' + ((res && res.error) || '没有返回结果');
    }
  } catch (e) {
    node.textContent = '测试失败：' + ((e && e.message) || '未知错误');
  }
}

function exportSettings() {
  const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'amber-translate-settings.json';
  a.click();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 2000);
}

function importSettings() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.addEventListener('change', function () {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function () {
      try {
        const parsed = JSON.parse(String(reader.result));
        settings = mergeSettings(DEFAULT_SETTINGS, parsed);
        await saveSettings(settings);
        render();
        markSaved();
        $('test-result').textContent = '设置已导入。';
      } catch (e) {
        $('test-result').textContent = '导入失败：文件不是有效的设置备份。';
      }
    };
    reader.readAsText(file);
  });
  input.click();
}

/* ---------------------------------------------------------------- 启动 */

async function init() {
  try {
    settings = await loadSettings();
    const version = chrome.runtime.getManifest().version;
    $('version').textContent = 'v' + version;
    $('version-2').textContent = 'v' + version;

    applyTheme();
    render();
    bindControls();
  } catch (err) {
    console.error('[拾穗译] 设置页初始化失败：', err);
    $('save-state').textContent = '初始化失败：' + ((err && err.message) || '未知错误');
  }
}

init();
