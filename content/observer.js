(function (root) {
  'use strict';

  const S = root.AmberStore;
  const U = root.AmberUtil;

  let observer = null;
  let queue = [];
  let processing = false;
  let lastRun = 0;

  function isOurs(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.hasAttribute && node.hasAttribute('data-amber-skip')) return true;
    const cls = node.className;
    if (typeof cls === 'string' && cls.indexOf('amber-') !== -1) return true;
    return false;
  }

  function handle(mutations) {
    if (!S.state.translated) {
      queue.length = 0;
      return;
    }
    let relevant = false;
    for (const mutation of mutations) {
      if (mutation.type !== 'childList' || !mutation.addedNodes.length) continue;
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (isOurs(node)) continue;
        queue.push(node);
        relevant = true;
      }
    }
    if (relevant) schedule();
  }

  const schedule = U.debounce(function () {
    flush();
  }, 900);

  async function flush() {
    if (processing || !S.state.translated) return;
    const now = Date.now();
    if (now - lastRun < 1200) {
      schedule();
      return;
    }
    if (!queue.length) return;

    const nodes = queue.slice(0, 60);
    queue = queue.slice(60);
    processing = true;
    lastRun = now;

    try {
      const known = new Set(
        S.state.segments.map(function (seg) {
          return seg.el;
        })
      );
      const fresh = [];
      nodes.forEach(function (node) {
        if (!node.isConnected) return;
        if (root.AmberExtract.SKIP_TAGS[node.tagName]) return;
        const found = root.AmberExtract.collect(node);
        found.forEach(function (seg) {
          if (known.has(seg.el)) return;
          if (seg.el.classList.contains('amber-src-block') || seg.el.classList.contains('amber-with-inner-tr')) return;
          known.add(seg.el);
          seg.id = S.state.segments.length + fresh.length;
          fresh.push(seg);
        });
      });

      if (fresh.length) {
        S.state.segments = S.state.segments.concat(fresh);
        S.state.progress.total += fresh.length;
        await root.AmberMain.runSegments(fresh);
      }
    } catch (e) {
    } finally {
      processing = false;
      if (queue.length) schedule();
    }
  }

  function init() {
    if (observer) return;
    const target = document.body || document.documentElement;
    if (!target) return;
    observer = new MutationObserver(handle);
    observer.observe(target, { childList: true, subtree: true });
  }

  root.AmberObserver = {
    init: init,
    flush: flush
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
