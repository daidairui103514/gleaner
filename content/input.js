(function (root) {
  'use strict';

  const S = root.AmberStore;

  let count = 0;
  let lastAt = 0;
  let inflight = false;

  function editableOf(el) {
    if (!el) return null;
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (['text', 'search', 'url', 'email', 'tel', 'password', 'number', ''].indexOf(type) === -1) return null;
      return el;
    }
    if (el.tagName === 'TEXTAREA') return el;
    if (el.isContentEditable) return el;
    return null;
  }

  function isRich(el) {
    return el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA';
  }

  function getText(el) {
    if (isRich(el)) return (el.innerText || el.textContent || '').trim();
    return (el.value || '').trim();
  }

  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function setValue(el, text) {
    if (isRich(el)) {
      el.focus();
      const sel = window.getSelection();
      sel.selectAllChildren(el);
      document.execCommand('insertText', false, text);
      return;
    }
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) descriptor.set.call(el, text);
    else el.value = text;
    el.selectionStart = el.selectionEnd = text.length;
    fireInput(el);
  }

  function trimTrailingSpaces(el, n) {
    if (isRich(el)) {
      for (let i = 0; i < n; i++) document.execCommand('delete', false, null);
      fireInput(el);
      return;
    }
    const value = el.value;
    let end = el.selectionStart == null ? value.length : el.selectionStart;
    let i = end;
    let removed = 0;
    while (removed < n && i > 0 && value[i - 1] === ' ') {
      i--;
      removed++;
    }
    if (!removed) return;
    setValue(el, value.slice(0, i) + value.slice(end));
    el.selectionStart = el.selectionEnd = i;
  }

  let tipTimer = null;

  function showTip(el, message, kind) {
    let tip = document.querySelector('[data-amber-tip]');
    if (!tip) {
      tip = document.createElement('div');
      tip.setAttribute('data-amber-tip', '');
      tip.setAttribute('data-amber-skip', '');
      tip.style.cssText = [
        'position:absolute',
        'z-index:2147483002',
        'padding:6px 10px',
        'border-radius:8px',
        'font:12px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif',
        'background:rgba(24,22,19,.94)',
        'border:.5px solid rgba(186,117,23,.6)',
        'color:#F0E3CC',
        'pointer-events:none',
        'box-shadow:0 6px 20px rgba(0,0,0,.35)',
        'max-width:280px'
      ].join(';');
      (document.body || document.documentElement).appendChild(tip);
    }
    tip.textContent = message;
    tip.style.color = kind === 'error' ? '#F7C1C1' : kind === 'ok' ? '#C0DD97' : '#F0E3CC';

    let rect;
    try {
      rect = el.getBoundingClientRect();
    } catch (e) {
      rect = { left: 20, bottom: 20, width: 200 };
    }
    tip.style.left = Math.max(8, rect.left + window.scrollX) + 'px';
    tip.style.top = rect.bottom + window.scrollY + 6 + 'px';
    tip.style.display = 'block';

    clearTimeout(tipTimer);
    tipTimer = setTimeout(function () {
      if (tip && tip.parentNode) tip.parentNode.removeChild(tip);
    }, 2600);
  }

  async function translateEditable(el) {
    if (inflight || !el) return;
    const text = getText(el);
    if (!text) return;

    inflight = true;
    showTip(el, '翻译中…');
    try {
      const out = await S.translate([text]);
      const value = (out && out[0]) || '';
      if (!value) {
        showTip(el, '没有返回译文', 'error');
        return;
      }
      setValue(el, value);
      showTip(el, '已翻译为' + langName(S.state.settings.targetLang), 'ok');
    } catch (err) {
      showTip(el, '翻译失败：' + ((err && err.message) || '未知错误'), 'error');
    } finally {
      inflight = false;
    }
  }

  function langName(code) {
    if (code === 'zh-Hans') return '简体中文';
    if (code === 'zh-Hant') return '繁体中文';
    if (code === 'en') return '英语';
    if (code === 'ja') return '日语';
    if (code === 'ko') return '韩语';
    return code;
  }

  function init() {
    const config = S.state.settings.input || {};
    if (config.enabled === false) return;
    const trigger = Math.max(2, Number(config.trigger) || 3);

    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key !== ' ') return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const el = editableOf(e.target);
        if (!el) {
          count = 0;
          return;
        }
        const now = Date.now();
        if (now - lastAt > 600) count = 0;
        lastAt = now;
        count++;

        if (count >= trigger) {
          count = 0;
          e.preventDefault();
          e.stopPropagation();
          trimTrailingSpaces(el, trigger - 1);
          setTimeout(function () {
            translateEditable(el);
          }, 0);
        }
      },
      true
    );

    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key === 'Escape') count = 0;
      },
      true
    );
  }

  root.AmberInput = {
    init: init,
    translateFocused: function () {
      translateEditable(editableOf(document.activeElement));
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
