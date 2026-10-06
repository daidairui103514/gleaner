(function (root) {
  'use strict';

  const S = root.AmberStore;
  const U = root.AmberUtil;
  const HOVER_CLASS = 'amber-tr-hover';

  let keyDown = false;
  let current = null;
  let currentNode = null;
  let requestId = 0;
  let lastPoint = { x: 0, y: 0 };

  function isSkipped(el) {
    if (!el || el.nodeType !== 1) return true;
    const tag = el.tagName;
    if (root.AmberExtract.SKIP_TAGS[tag]) return true;
    if (el.isContentEditable) return true;
    const cls = el.className;
    if (typeof cls === 'string' && cls.indexOf('amber-') !== -1) return true;
    if (el.hasAttribute && el.hasAttribute('data-amber-skip')) return true;
    return false;
  }

  function containerFromPoint(x, y) {
    let el = document.elementFromPoint(x, y);
    let depth = 0;
    while (el && el !== document.body && el !== document.documentElement && depth < 40) {
      if (isSkipped(el)) return null;
      let display = 'block';
      try {
        display = getComputedStyle(el).display;
      } catch (e) {
        display = 'block';
      }
      if (display !== 'inline' && display !== 'contents' && display !== 'ruby') {
        const rect = el.getBoundingClientRect();
        if (rect.width < 8 || rect.height < 8) return null;
        return el;
      }
      el = el.parentElement;
      depth++;
    }
    return null;
  }

  function textOf(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.' + root.AmberInject.TR_CLASS).forEach(function (node) {
      node.remove();
    });
    return (clone.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function removeNode() {
    if (currentNode && currentNode.parentNode) currentNode.parentNode.removeChild(currentNode);
    currentNode = null;
  }

  function hide() {
    requestId++;
    removeNode();
    current = null;
  }

  async function show(el) {
    if (el.querySelector(':scope > .' + HOVER_CLASS)) return;
    const text = textOf(el);
    if (!text || text.length < 2) return;
    if (!U.isTranslatableText(text)) return;
    if (el.classList.contains('amber-src-block') || el.classList.contains('amber-with-inner-tr')) {
      hide();
      return;
    }

    const id = ++requestId;
    removeNode();

    const node = document.createElement('span');
    node.className = HOVER_CLASS + ' ' + root.AmberInject.TR_CLASS;
    node.setAttribute('data-amber-skip', '');
    const base = root.AmberInject.baseStyleOf(el);
    node.style.setProperty('--amber-base-size', base.size + 'px');
    if (base.weight) node.style.setProperty('--amber-base-weight', base.weight);
    node.textContent = '翻译中…';

    if (el.parentNode) el.insertAdjacentElement('afterend', node);
    else el.appendChild(node);
    currentNode = node;

    try {
      const out = await S.translate([text.slice(0, 2000)]);
      if (id !== requestId) return;
      node.textContent = (out && out[0]) || '没有返回译文';
    } catch (err) {
      if (id !== requestId) return;
      node.textContent = '翻译失败：' + ((err && err.message) || '未知错误');
    }
  }

  const onMove = U.throttle(function (e) {
    lastPoint.x = e.clientX;
    lastPoint.y = e.clientY;
    if (!keyDown) return;
    const el = containerFromPoint(e.clientX, e.clientY);
    if (!el) {
      if (current) hide();
      return;
    }
    if (el === current) return;
    current = el;
    show(el);
  }, 160);

  function init() {
    const config = S.state.settings.hover || {};
    if (config.enabled === false) return;

    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift') return;
        const wanted = config.key || 'Control';
        if (e.key !== wanted) return;
        if (keyDown) return;
        keyDown = true;
        const el = containerFromPoint(lastPoint.x, lastPoint.y);
        if (el) {
          current = el;
          show(el);
        }
      },
      true
    );

    document.addEventListener(
      'keyup',
      function (e) {
        if (e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift') return;
        if (e.key !== (config.key || 'Control')) return;
        keyDown = false;
        hide();
      },
      true
    );

    document.addEventListener('mousemove', onMove, true);
    window.addEventListener('blur', function () {
      keyDown = false;
      hide();
    });
    document.addEventListener('scroll', hide, true);
  }

  root.AmberHover = {
    init: init,
    hide: hide
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
