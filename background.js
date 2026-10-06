import { loadSettings, saveSettings, getSiteConfig, saveSiteConfig } from './common/config.js';
import { cacheKey, getMany, setMany, clearAll, stats as cacheStats, prune } from './common/cache.js';
import { getEngine } from './engines/index.js';


function langLabel(code) {
  const map = {
    'zh-Hans': '简体中文',
    'zh-Hant': '繁体中文'
  };
  return map[code] || code;
}

function applyTerms(text, terms) {
  if (!terms || !terms.length || !text) return text;
  let out = text;
  for (const term of terms) {
    if (!term.from || !term.to) continue;
    out = out.split(term.from).join(term.to);
  }
  return out;
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    return null;
  }
}


async function translateTexts(payload) {
  const texts = Array.isArray(payload.texts) ? payload.texts : [];
  if (!texts.length) return { translations: [] };

  const settings = await loadSettings();
  const requested = String(payload.engine || settings.engine || 'bing');
  const from = payload.from || settings.sourceLang || 'auto';
  const to = payload.to || settings.targetLang;

  let engineId = requested;
  let engineConfig = {};

  if (requested.indexOf('openai:') === 0) {
    const profileId = requested.slice(7);
    const cfg = settings.engines.openai || {};
    const list = Array.isArray(cfg.profiles) ? cfg.profiles : [];
    const profile =
      list.find(function (item) {
        return item.id === profileId;
      }) || list[0] || {};
    engineId = 'openai';
    engineConfig = {
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
      model: profile.model,
      temperature: profile.temperature,
      timeout: profile.timeout
    };
  } else {
    engineConfig = Object.assign({}, settings.engines[requested] || {});
  }

  const engine = getEngine(engineId);

  if (payload.engineConfig) Object.assign(engineConfig, payload.engineConfig);

  const terms = (settings.terms || []).filter(function (t) {
    return t && t.enabled !== false && t.from && t.to;
  });

  const results = new Array(texts.length).fill('');
  const keys = texts.map(function (text) {
    return cacheKey(requested, from, to, text);
  });

  let hits = 0;
  let cached = {};
  if (settings.cache.enabled) {
    try {
      cached = await getMany(keys);
    } catch (e) {
      cached = {};
    }
  }

  const pending = [];
  texts.forEach(function (text, index) {
    const hit = cached[keys[index]];
    if (typeof hit === 'string' && hit) {
      results[index] = hit;
      hits++;
    } else {
      pending.push({ index: index, text: text, key: keys[index] });
    }
  });

  if (!pending.length) {
    return { translations: results, engine: engine.id, hits: hits, count: texts.length };
  }

  const batches = AmberUtilMakeBatches(pending, engine.maxItems, engine.maxChars);
  const ctx = {
    from: from,
    to: to,
    config: engineConfig,
    targetName: langLabel(to),
    pageTitle: payload.pageTitle || '',
    terms: terms,
    promptLevel: settings.promptLevel,
    useContext: settings.useContext
  };

  const store = [];
  let failures = 0;
  let lastError = null;

  const tasks = batches.map(function (batch) {
    return async function () {
      const outs = await engine.translateBatch(
        batch.map(function (item) {
          return item.text;
        }),
        ctx
      );
      batch.forEach(function (item, k) {
        let value = outs[k] || '';
        value = applyTerms(value, terms);
        results[item.index] = value;
        if (value) store.push({ k: item.key, v: value, e: engine.id, f: from, to: to });
      });
    };
  });

  const limit = Math.max(1, Math.min(Number(settings.concurrency) || 4, batches.length));
  await poolRun(tasks, limit, function (err) {
    failures++;
    lastError = err;
  });

  if (settings.cache.enabled && store.length) {
    try {
      await setMany(store);
    } catch (e) {
    }
  }

  const empty = results.filter(function (r) {
    return !r;
  }).length;
  if (empty === texts.length && failures && lastError) throw lastError;

  return { translations: results, engine: engine.id, hits: hits, failures: failures, count: texts.length };
}

function AmberUtilMakeBatches(items, maxCount, maxChars) {
  maxCount = maxCount || 20;
  maxChars = maxChars || 4000;
  const batches = [];
  let cur = [];
  let size = 0;
  for (const item of items) {
    const len = (item.text || '').length;
    if (cur.length && (cur.length >= maxCount || size + len > maxChars)) {
      batches.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(item);
    size += len;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

function poolRun(tasks, limit, onError) {
  return new Promise(function (resolve) {
    let index = 0;
    let running = 0;
    function next() {
      while (running < limit && index < tasks.length) {
        const task = tasks[index++];
        running++;
        Promise.resolve()
          .then(task)
          .catch(function (err) {
            if (onError) onError(err);
          })
          .then(function () {
            running--;
            if (index >= tasks.length && running === 0) resolve();
            else next();
          });
      }
      if (!tasks.length) resolve();
    }
    next();
  });
}


const M = {
  TRANSLATE: 'amber:translate',
  TRANSLATE_PAGE: 'amber:translate-page',
  PING: 'amber:ping',
  GET_SETTINGS: 'amber:get-settings',
  PATCH_SETTINGS: 'amber:patch-settings',
  GET_SITE_CONFIG: 'amber:get-site-config',
  SAVE_SITE_CONFIG: 'amber:save-site-config',
  CLEAR_CACHE: 'amber:clear-cache',
  CACHE_STATS: 'amber:cache-stats',
  OPEN_OPTIONS: 'amber:open-options',
  DETECT_LANG: 'amber:detect-lang',
  DO_TRANSLATE: 'amber:do-translate',
  DO_RESTORE: 'amber:do-restore',
  DO_SET_MODE: 'amber:do-set-mode',
  DO_TOGGLE: 'amber:do-toggle',
  DO_TOGGLE_FAB: 'amber:do-toggle-fab',
  DO_EXPORT: 'amber:do-export',
  DO_OCR: 'amber:do-ocr',
  OCR_IMAGE: 'amber:ocr-image',
  OCR_RUN: 'amber:ocr-run',
  SETTINGS_CHANGED: 'amber:settings-changed'
};


let offscreenSetup = null;

async function ensureOffscreen() {
  if (offscreenSetup) return offscreenSetup;
  offscreenSetup = (async function () {
    if (chrome.runtime.getContexts) {
      const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
      if (contexts && contexts.length) return;
    }
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['WORKERS'],
      justification: '在后台线程运行本地图片文字识别（OCR）'
    });
  })();
  offscreenSetup.catch(function () {
    offscreenSetup = null;
  });
  return offscreenSetup;
}

async function runOcr(url, lang) {
  await ensureOffscreen();
  return new Promise(function (resolve, reject) {
    chrome.runtime.sendMessage({ type: 'amber:ocr-run', url: url, lang: lang }, function (response) {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message || 'OCR 通信失败'));
        return;
      }
      if (!response) {
        reject(new Error('OCR 没有响应'));
        return;
      }
      if (!response.ok) {
        reject(new Error(response.error || '图片文字识别失败'));
        return;
      }
      resolve((response.data && response.data.text) || '');
    });
  });
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || typeof message.type !== 'string' || message.type.indexOf('amber:') !== 0) return false;
  /* 这条是发给离屏文档的，后台自己不要处理 */
  if (message.type === M.OCR_RUN) return false;

  (async function () {
    try {
      switch (message.type) {
        case M.OCR_IMAGE: {
          const text = await runOcr(message.url, message.lang);
          sendResponse({ ok: true, data: { text: text } });
          break;
        }
        case M.TRANSLATE: {
          const result = await translateTexts(message.payload || {});
          sendResponse({ ok: true, data: result });
          break;
        }
        case M.PING:
          sendResponse({ ok: true, data: { version: chrome.runtime.getManifest().version } });
          break;
        case M.GET_SETTINGS: {
          const settings = await loadSettings();
          sendResponse({ ok: true, data: settings });
          break;
        }
        case M.PATCH_SETTINGS: {
          const settings = await saveSettings(message.patch || {});
          broadcastSettings(settings);
          sendResponse({ ok: true, data: settings });
          break;
        }
        case M.GET_SITE_CONFIG: {
          const config = await getSiteConfig(message.domain);
          const settings = await loadSettings();
          sendResponse({ ok: true, data: config || settings, hasSiteConfig: !!config });
          break;
        }
        case M.SAVE_SITE_CONFIG: {
          const saved = await saveSiteConfig(message.domain, message.patch || {});
          sendResponse({ ok: true, data: saved });
          break;
        }
        case M.CLEAR_CACHE: {
          await clearAll();
          sendResponse({ ok: true, data: await cacheStats() });
          break;
        }
        case M.CACHE_STATS: {
          sendResponse({ ok: true, data: await cacheStats() });
          break;
        }
        case M.OPEN_OPTIONS: {
          chrome.runtime.openOptionsPage();
          sendResponse({ ok: true });
          break;
        }
        case M.DETECT_LANG: {
          sendResponse({ ok: true, data: { lang: detectByHeuristic(message.text || '') } });
          break;
        }
        default:
          sendResponse({ ok: false, error: '未知消息类型：' + message.type });
      }
    } catch (err) {
      sendResponse({ ok: false, error: (err && err.message) || String(err) });
    }
  })();

  return true;
});

function detectByHeuristic(text) {
  if (/[\u3040-\u30ff]/.test(text)) return 'ja';
  if (/[\uac00-\ud7af]/.test(text)) return 'ko';
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh-Hans';
  if (/[\u0400-\u04ff]/.test(text)) return 'ru';
  if (/[\u0600-\u06ff]/.test(text)) return 'ar';
  if (/[\u0e00-\u0e7f]/.test(text)) return 'th';
  if (/[\u0900-\u097f]/.test(text)) return 'hi';
  return 'en';
}

async function broadcastSettings(settings) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id) sendToTab(tab.id, { type: 'amber:settings-changed', settings: settings });
  }
}


async function activeTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function ensureContent(tabId) {
  const ok = await sendToTab(tabId, { type: M.PING });
  if (ok && ok.ok) return true;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: false },
      files: [
        'common/languages.js',
        'common/messages.js',
        'common/util.js',
        'content/store.js',
        'content/extract.js',
        'content/inject.js',
        'content/fab.js',
        'content/bubble.js',
        'content/hover.js',
        'content/input.js',
        'content/observer.js',
        'content/subtitle.js',
        'content/ocr.js',
        'content/main.js'
      ]
    });
    await chrome.scripting.insertCSS({ target: { tabId: tabId }, files: ['content/content.css'] });
    return true;
  } catch (e) {
    return false;
  }
}

chrome.commands.onCommand.addListener(async function (command, tab) {
  const target = tab || (await activeTab());
  if (!target || !target.id) return;
  await ensureContent(target.id);
  if (command === 'toggle-translate') {
    sendToTab(target.id, { type: M.DO_TOGGLE });
  } else if (command === 'toggle-mode') {
    sendToTab(target.id, { type: M.DO_SET_MODE, cycle: true });
  } else if (command === 'toggle-fab') {
    sendToTab(target.id, { type: M.DO_TOGGLE_FAB });
  }
});

async function setupMenus() {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: 'gleaner-page',
    title: '拾穗译：翻译此页',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'amber-restore-page',
    title: '拾穗译：还原原文',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'amber-sep',
    type: 'separator',
    contexts: ['page', 'selection', 'image']
  });
  chrome.contextMenus.create({
    id: 'gleaner-selection',
    title: '拾穗译：翻译「%s」',
    contexts: ['selection']
  });
  chrome.contextMenus.create({
    id: 'gleaner-input',
    title: '拾穗译：翻译并替换输入框内容',
    contexts: ['editable']
  });
  chrome.contextMenus.create({
    id: 'gleaner-image',
    title: '拾穗译：识别并翻译图片文字',
    contexts: ['image']
  });
  chrome.contextMenus.create({
    id: 'amber-options',
    title: '拾穗译：打开设置',
    contexts: ['page', 'selection', 'image']
  });
}

chrome.contextMenus.onClicked.addListener(async function (info, tab) {
  if (!tab || !tab.id) return;
  if (info.menuItemId === 'amber-options') {
    chrome.runtime.openOptionsPage();
    return;
  }
  await ensureContent(tab.id);

  if (info.menuItemId === 'gleaner-page') {
    sendToTab(tab.id, { type: M.DO_TRANSLATE });
  } else if (info.menuItemId === 'amber-restore-page') {
    sendToTab(tab.id, { type: M.DO_RESTORE });
  } else if (info.menuItemId === 'gleaner-selection') {
    sendToTab(tab.id, { type: M.DO_TRANSLATE, selection: info.selectionText || '' });
  } else if (info.menuItemId === 'gleaner-input') {
    sendToTab(tab.id, { type: M.DO_TRANSLATE, editable: true });
  } else if (info.menuItemId === 'gleaner-image') {
    sendToTab(tab.id, { type: 'amber:do-ocr', srcUrl: info.srcUrl || '' });
  }
});


function isPdfUrl(url) {
  if (!url) return false;
  if (url.indexOf(chrome.runtime.getURL('')) === 0) return false;
  if (!/^(https?|file):/i.test(url)) return false;
  return /\.pdf($|[?#])/i.test(url);
}

chrome.tabs.onUpdated.addListener(async function (tabId, changeInfo) {
  const url = changeInfo.url;
  if (!url || !isPdfUrl(url)) return;
  try {
    const settings = await loadSettings();
    if (settings.pdf && settings.pdf.enabled === false) return;
  } catch (e) {
  }
  const viewer = chrome.runtime.getURL('pdf/viewer.html') + '?file=' + encodeURIComponent(url);
  chrome.tabs.update(tabId, { url: viewer }).catch(function () {});
});


chrome.runtime.onInstalled.addListener(async function (details) {
  await setupMenus();
  const settings = await loadSettings();
  await saveSettings(settings);
  try {
    await chrome.alarms.create('amber-prune', { periodInMinutes: 24 * 60 });
  } catch (e) {
  }
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html?welcome=1') });
  }
});

chrome.runtime.onStartup.addListener(function () {
  setupMenus();
});

if (chrome.alarms && chrome.alarms.onAlarm) {
  chrome.alarms.onAlarm.addListener(async function (alarm) {
    if (alarm.name !== 'amber-prune') return;
    const settings = await loadSettings();
    if (settings.cache.enabled) {
      await prune(settings.cache.maxAgeDays);
    }
  });
}
