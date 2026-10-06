(function (root) {
  'use strict';

  const V = root.AmberMsg;
  const S = root.AmberStore;
  const U = root.AmberUtil;

  const state = S.state;

  let viewObserver = null;
  const pendingMap = new Map();
  let errorNotified = false;


  function setupObserver(segments) {
    teardownObserver();
    viewObserver = new IntersectionObserver(
      function (entries) {
        const hit = [];
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          const seg = pendingMap.get(entry.target);
          if (!seg) return;
          pendingMap.delete(entry.target);
          viewObserver.unobserve(entry.target);
          hit.push(seg);
        });
        if (hit.length) {
          runSegments(hit);
        }
      },
      { rootMargin: '400px 0px 600px 0px', threshold: 0 }
    );
    segments.forEach(function (seg) {
      if (!seg.el || !seg.el.isConnected) return;
      pendingMap.set(seg.el, seg);
      viewObserver.observe(seg.el);
    });
  }

  function teardownObserver() {
    if (viewObserver) {
      viewObserver.disconnect();
      viewObserver = null;
    }
    pendingMap.clear();
  }


  function batchLimit() {
    const engine = state.settings.engine;
    if (engine === 'openai' || engine === 'microsoft') return 12;
    if (engine === 'builtin') return 6;
    return 2;
  }

  function batchesOf(segments) {
    const maxCount = batchLimit();
    const maxChars = 3200;
    const out = [];
    let cur = [];
    let size = 0;
    segments.forEach(function (seg) {
      const len = seg.text.length;
      if (cur.length && (cur.length >= maxCount || size + len > maxChars)) {
        out.push(cur);
        cur = [];
        size = 0;
      }
      cur.push(seg);
      size += len;
    });
    if (cur.length) out.push(cur);
    return out;
  }

  let runToken = 0;

  async function runSegments(segments) {
    if (!segments.length) return;
    const token = runToken;
    const batches = batchesOf(segments);
    const concurrency = Math.max(1, Math.min(Number(state.settings.concurrency) || 6, batches.length));
    let index = 0;

    async function worker() {
      while (index < batches.length) {
        if (token !== runToken) return;
        const batch = batches[index++];
        await runBatch(batch, token);
      }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) workers.push(worker());
    await Promise.all(workers);

    updateFabState();
  }

  async function runBatch(batch, token) {
    if (token !== runToken) return;

    batch.forEach(function (seg) {
      if (!seg.trEl) root.AmberInject.markLoading(seg);
    });

    try {
      const translations = await S.translate(
        batch.map(function (seg) {
          return seg.text;
        })
      );
      if (token !== runToken) return;
      batch.forEach(function (seg, k) {
        const value = translations[k];
        root.AmberInject.clearLoading(seg);
        if (value && value.trim()) {
          root.AmberInject.attach(seg, value.trim());
          seg.done = true;
        } else {
          root.AmberInject.markFailed(seg, '引擎没有返回内容');
        }
        state.progress.done++;
      });
    } catch (err) {
      if (token !== runToken) return;
      const message = (err && err.message) || '翻译失败';
      batch.forEach(function (seg) {
        root.AmberInject.markFailed(seg, message);
        state.progress.done++;
      });
      if (!errorNotified) {
        errorNotified = true;
        if (root.AmberFab) root.AmberFab.flash(message, 'error');
      }
    }
    updateFabState();
  }

  function updateFabState() {
    if (!root.AmberFab) return;
    const { done, total } = state.progress;
    root.AmberFab.setProgress(total ? done / total : 0, done, total);
  }


  async function translatePage() {
    if (state.running) return;
    if (state.translated) return;

    errorNotified = false;
    S.ensureStylesheet();
    root.AmberInject.applyStyle(state.settings.style);
    root.AmberInject.applyMode(state.mode);

    const segments = root.AmberExtract.collect();
    if (!segments.length) {
      if (root.AmberFab) root.AmberFab.flash('这个页面没有找到可翻译的正文', 'warn');
      return;
    }

    runToken++;
    state.segments = segments;
    state.translated = true;
    state.running = true;
    S.setProgress(0, segments.length);
    if (root.AmberFab) root.AmberFab.setBusy(true);

    const { near, far } = root.AmberExtract.viewportFirst(segments);
    const nearSegments = near.map(function (i) {
      return segments[i];
    });
    const farSegments = far.map(function (i) {
      return segments[i];
    });

    await runSegments(nearSegments);

    state.running = false;
    if (root.AmberFab) root.AmberFab.setBusy(false);

    if (farSegments.length) setupObserver(farSegments);

    const failed = segments.filter(function (seg) {
      return !seg.done;
    }).length;
    if (failed === segments.length && root.AmberFab) {
      root.AmberFab.flash('全部段落都翻译失败了，检查引擎设置', 'error');
    }
  }

  function restorePage() {
    /* 先作废仍在路上的翻译任务，否则还原之后还会冒出新的译文 */
    runToken++;
    teardownObserver();
    root.AmberInject.removeAll();
    state.segments = [];
    state.translated = false;
    state.running = false;
    state.progress = { done: 0, total: 0 };
    errorNotified = false;
    if (root.AmberFab) {
      root.AmberFab.setBusy(false);
      root.AmberFab.setProgress(0, 0, 0);
    }
  }

  async function ensureTranslated() {
    if (state.translated) return;
    await translatePage();
  }

  function cycleMode() {
    const order = ['bilingual', 'translation', 'source'];
    const next = order[(order.indexOf(state.mode) + 1) % order.length];
    setMode(next);
    return next;
  }

  function setMode(mode) {
    if (mode === 'cycle') return cycleMode();
    S.setMode(mode);
    root.AmberInject.applyMode(mode);
    if (root.AmberPopupPanel) root.AmberPopupPanel.syncMode(mode);
    return mode;
  }


  async function exportMarkdown() {
    if (!state.segments.length) {
      if (root.AmberFab) root.AmberFab.flash('先翻译页面再导出', 'warn');
      return;
    }
    const markdown = root.AmberInject.exportSegments(state.segments);
    try {
      await navigator.clipboard.writeText(markdown);
      if (root.AmberFab) root.AmberFab.flash('双语对照已复制到剪贴板', 'ok');
    } catch (e) {
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (document.title || 'translation').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) + '.md';
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 3000);
      if (root.AmberFab) root.AmberFab.flash('已导出 Markdown 文件', 'ok');
    }
  }


  function matchDomain(domain, pattern) {
    if (!pattern) return false;
    const p = String(pattern).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!p) return false;
    if (p === domain) return true;
    if (p.startsWith('*.')) {
      const base = p.slice(2);
      return domain === base || domain.endsWith('.' + base);
    }
    return domain.endsWith('.' + p) || domain === p;
  }

  function pageLanguage() {
    const attr = (document.documentElement.getAttribute('lang') || '').toLowerCase();
    if (attr) return attr.split('-')[0];
    const sample = (document.body && document.body.innerText ? document.body.innerText : '').slice(0, 600);
    if (/[\u3040-\u30ff]/.test(sample)) return 'ja';
    if (/[\uac00-\ud7af]/.test(sample)) return 'ko';
    if (/[\u4e00-\u9fff]/.test(sample)) return 'zh';
    return 'en';
  }

  function shouldAutoTranslate() {
    try {
      if (new URLSearchParams(location.search).get('amber') === 'auto') return true;
    } catch (e) {
    }

    const auto = state.settings.auto || {};
    const domain = state.domain;

    if ((auto.never || []).some(function (p) {
      return matchDomain(domain, p);
    })) {
      return false;
    }
    if ((auto.always || []).some(function (p) {
      return matchDomain(domain, p);
    })) {
      return true;
    }
    if (auto.byLang) {
      const lang = pageLanguage();
      const target = String(state.settings.targetLang || '').toLowerCase();
      if (target.startsWith(lang)) return false;
      return (auto.langs || []).indexOf(lang) !== -1;
    }
    return false;
  }


  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || typeof message.type !== 'string') return false;
    if (message.type.indexOf('amber:') !== 0) return false;

    switch (message.type) {
      case V.DO_TRANSLATE:
        if (message.selection) {
          if (root.AmberBubble) root.AmberBubble.showForText(message.selection);
        } else if (message.editable) {
          if (root.AmberInput) root.AmberInput.translateFocused();
        } else {
          state.translated ? null : translatePage();
        }
        sendResponse({ ok: true, data: { translated: state.translated } });
        return true;

      case V.DO_RESTORE:
        restorePage();
        sendResponse({ ok: true, data: { translated: false } });
        return true;

      case V.DO_TOGGLE:
        if (state.translated) restorePage();
        else translatePage();
        sendResponse({ ok: true, data: { translated: state.translated, mode: state.mode } });
        return true;

      case V.DO_SET_MODE: {
        const mode = setMode(message.cycle ? 'cycle' : message.mode);
        sendResponse({ ok: true, data: { mode: mode } });
        return true;
      }

      case V.DO_TOGGLE_FAB:
        if (root.AmberFab) root.AmberFab.toggle();
        sendResponse({ ok: true });
        return true;

      case V.DO_EXPORT:
        exportMarkdown();
        sendResponse({ ok: true });
        return true;

      case V.DO_OCR:
        if (root.AmberOcr) {
          root.AmberOcr.translateImageByUrl(message.srcUrl);
        }
        sendResponse({ ok: true });
        return true;

      case V.DO_STATE_QUERY:
        sendResponse({
          ok: true,
          data: {
            translated: state.translated,
            mode: state.mode,
            progress: state.progress,
            domain: state.domain,
            segments: state.segments.length
          }
        });
        return true;

      case V.SETTINGS_CHANGED:
        if (message.settings) {
          state.settings = message.settings;
          root.AmberInject.applyStyle(state.settings.style);
          if (root.AmberFab) root.AmberFab.refresh();
        }
        sendResponse({ ok: true });
        return true;

      default:
        return false;
    }
  });


  async function boot() {
    await S.loadSettings();
    S.ensureStylesheet();
    root.AmberInject.applyStyle(state.settings.style);

    if (window.top === window) {
      if (root.AmberFab) root.AmberFab.init();
      if (root.AmberSubtitle) root.AmberSubtitle.init();
    }
    if (root.AmberBubble) root.AmberBubble.init();
    if (root.AmberHover) root.AmberHover.init();
    if (root.AmberInput) root.AmberInput.init();
    if (root.AmberObserver) root.AmberObserver.init();
    if (root.AmberOcr) root.AmberOcr.init();

    if (shouldAutoTranslate()) {
      setTimeout(function () {
        translatePage();
      }, 700);
    }
  }

  root.AmberMain = {
    boot: boot,
    translatePage: translatePage,
    restorePage: restorePage,
    ensureTranslated: ensureTranslated,
    runSegments: runSegments,
    setMode: setMode,
    cycleMode: cycleMode,
    exportMarkdown: exportMarkdown,
    shouldAutoTranslate: shouldAutoTranslate,
    matchDomain: matchDomain,
    state: state
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
