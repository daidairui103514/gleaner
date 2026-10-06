(function (root) {
  'use strict';

  const TR_CLASS = 'amber-tr';
  const HOST_ATTR = 'data-amber-host';

  const MODE_CLASSES = ['amber-mode-bilingual', 'amber-mode-translation', 'amber-mode-source'];

  function createTranslationNode(text, base) {
    const node = document.createElement('span');
    node.className = TR_CLASS;
    node.setAttribute('dir', 'auto');
    node.setAttribute('lang', root.AmberStore.state.settings.targetLang || '');
    if (base && base.size) node.style.setProperty('--amber-base-size', base.size + 'px');
    if (base && base.weight) node.style.setProperty('--amber-base-weight', base.weight);
    if (base && base.style && base.style !== 'normal' && base.style !== 'inherit') {
      node.style.setProperty('--amber-base-style', base.style);
    }
    if (base && base.align && base.align !== 'start' && base.align !== 'left') {
      node.style.setProperty('--amber-base-align', base.align);
    }
    node.textContent = text;
    return node;
  }

  function baseStyleOf(el) {
    const out = { size: 0, weight: '', style: '', align: '' };
    try {
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize);
      if (size && isFinite(size)) out.size = size;
      if (cs.fontWeight && cs.fontWeight !== '400' && cs.fontWeight !== 'normal') out.weight = cs.fontWeight;
      if (cs.fontStyle && cs.fontStyle !== 'normal') out.style = cs.fontStyle;
      if (cs.textAlign) out.align = cs.textAlign;
    } catch (e) {
    }
    if (!out.size) {
      try {
        out.size = parseFloat(getComputedStyle(document.body).fontSize) || 16;
      } catch (e) {
        out.size = 16;
      }
    }
    return out;
  }

  function attach(segment, text) {
    if (!segment || !segment.el || !text) return null;
    if (segment.trEl && segment.trEl.isConnected) {
      segment.trEl.textContent = text;
      return segment.trEl;
    }

    const node = createTranslationNode(text, baseStyleOf(segment.el));
    node.setAttribute('data-amber-for', String(segment.id));

    if (segment.insertMode === 'inner') {
      segment.el.appendChild(node);
      segment.el.classList.add('amber-with-inner-tr');
      segment.hosted = true;
    } else if (segment.el.parentNode) {
      segment.el.classList.add('amber-src-block');
      segment.el.insertAdjacentElement('afterend', node);
    } else {
      segment.el.appendChild(node);
      segment.el.classList.add('amber-with-inner-tr');
      segment.hosted = true;
    }

    segment.trEl = node;
    return node;
  }

  function markLoading(segment) {
    if (!segment || !segment.el || segment.loadingEl) return;
    const node = document.createElement('span');
    node.className = TR_CLASS + ' amber-tr-loading';
    node.setAttribute('data-amber-for', String(segment.id));
    node.setAttribute('aria-hidden', 'true');
    node.innerHTML = '<i class="amber-skeleton"></i>';

    if (segment.insertMode === 'inner') {
      segment.el.appendChild(node);
    } else if (segment.el.parentNode) {
      segment.el.insertAdjacentElement('afterend', node);
    } else {
      segment.el.appendChild(node);
    }
    segment.loadingEl = node;
  }

  function clearLoading(segment) {
    if (segment && segment.loadingEl && segment.loadingEl.parentNode) {
      segment.loadingEl.parentNode.removeChild(segment.loadingEl);
    }
    if (segment) segment.loadingEl = null;
  }

  function markFailed(segment, reason) {
    clearLoading(segment);
    if (!segment || !segment.el) return;
    const node = document.createElement('span');
    node.className = TR_CLASS + ' amber-tr-error';
    node.setAttribute('data-amber-for', String(segment.id));
    node.textContent = '翻译失败：' + (reason || '未知错误') + '（点击重试）';
    node.addEventListener('click', function () {
      node.remove();
      segment.failed = false;
      root.AmberStore.emit('retry', segment);
    });
    if (segment.insertMode === 'inner') {
      segment.el.appendChild(node);
      segment.el.classList.add('amber-with-inner-tr');
    } else if (segment.el.parentNode) {
      segment.el.insertAdjacentElement('afterend', node);
    }
    segment.trEl = node;
  }


  function applyMode(mode) {
    const html = document.documentElement;
    MODE_CLASSES.forEach(function (cls) {
      html.classList.remove(cls);
    });
    html.classList.add('amber-mode-' + (mode || 'bilingual'));
    html.setAttribute('data-amber-active', '1');
    return mode;
  }


  function detectPageDark() {
    function luminance(color) {
      const m = /rgba?\(([^)]+)\)/.exec(color || '');
      if (!m) return null;
      const parts = m[1].split(',').map(function (v) {
        return parseFloat(v);
      });
      if (parts.length >= 4 && parts[3] === 0) return null;
      const [r, g, b] = parts;
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    }

    const candidates = [document.body, document.documentElement];
    for (const el of candidates) {
      if (!el) continue;
      try {
        const cs = getComputedStyle(el);
        const lum = luminance(cs.backgroundColor);
        if (lum === null) continue;
        return lum < 0.5;
      } catch (e) {
      }
    }
    return false;
  }

  const COLOR_PRESETS = {
    amber: { dark: '#fac775', light: '#9a5b06' },
    teal: { dark: '#7fd8c0', light: '#0f6e56' },
    indigo: { dark: '#a3b4f5', light: '#3b4a9c' },
    rose: { dark: '#f3a6c0', light: '#a83258' },
    slate: { dark: '#bdbab1', light: '#56544c' }
  };

  function applyStyle(style) {
    const s = Object.assign({}, style || {});
    const rs = document.documentElement.style;

    if (s.fontSize > 0) {
      rs.setProperty('--amber-font-size', s.fontSize + 'px');
    } else {
      rs.removeProperty('--amber-font-size');
    }
    rs.setProperty('--amber-scale', '1');
    rs.setProperty('--amber-line-height', String(s.lineHeight || 1.6));
    rs.setProperty('--amber-opacity', String((s.opacity == null ? 100 : s.opacity) / 100));
    rs.setProperty('--amber-margin-top', (s.marginTop == null ? 6 : s.marginTop) + 'px');
    rs.setProperty('--amber-margin-bottom', (s.marginBottom == null ? 14 : s.marginBottom) + 'px');
    rs.setProperty('--amber-padding-left', (s.paddingLeft == null ? 10 : s.paddingLeft) + 'px');
    rs.setProperty('--amber-max-width', s.maxWidth ? s.maxWidth + 'px' : 'none');

    const dark = detectPageDark();
    let color = s.color || '#FAC775';
    if (s.colorMode === 'inherit') {
      color = 'inherit';
      rs.setProperty('--amber-opacity', '1');
    } else if (s.colorMode === 'custom') {
      color = s.color || '#FAC775';
    } else {
      const preset = COLOR_PRESETS[s.colorMode];
      color = preset ? (dark ? preset.dark : preset.light) : dark ? '#FAC775' : '#9A5B06';
    }
    rs.setProperty('--amber-color', color);
    rs.setProperty('--amber-border-color', s.borderColor || '#BA7517');
    rs.setProperty('--amber-background', s.background && s.background !== 'transparent' ? s.background : 'transparent');
    rs.setProperty('--amber-font-family', fontFamilyOf(s.fontFamily));
    rs.setProperty('--amber-border-width', s.borderStyle === 'none' ? '0px' : '2px');
    rs.setProperty('--amber-border-style', s.borderStyle === 'dashed' ? 'dashed' : 'solid');
    rs.setProperty('--amber-page-dark', dark ? '1' : '0');
    document.documentElement.classList.toggle('amber-page-dark', dark);
  }

  function fontFamilyOf(value) {
    if (value === 'serif') return 'Georgia, "Songti SC", "SimSun", "Noto Serif CJK SC", serif';
    if (value === 'sans') return '-apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif';
    if (value === 'mono') return 'ui-monospace, "Cascadia Mono", Consolas, monospace';
    return 'inherit';
  }


  function removeAll() {
    document.querySelectorAll('.' + TR_CLASS).forEach(function (node) {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    ['.amber-with-inner-tr', '.amber-src-block'].forEach(function (selector) {
      document.querySelectorAll(selector).forEach(function (el) {
        el.classList.remove(selector.slice(1));
      });
    });
    MODE_CLASSES.forEach(function (cls) {
      document.documentElement.classList.remove(cls);
    });
    document.documentElement.removeAttribute('data-amber-active');
  }

  function exportSegments(segments) {
    const lines = [];
    lines.push('# ' + (document.title || location.hostname));
    lines.push('');
    lines.push('> 原文：' + location.href);
    lines.push('');
    segments.forEach(function (seg) {
      const source = (seg.text || '').trim();
      const target = seg.trEl ? (seg.trEl.textContent || '').trim() : '';
      if (!target || /^翻译失败/.test(target)) return;
      lines.push(source);
      lines.push('');
      lines.push('> ' + target);
      lines.push('');
    });
    return lines.join('\n');
  }

  root.AmberInject = {
    TR_CLASS: TR_CLASS,
    attach: attach,
    markLoading: markLoading,
    clearLoading: clearLoading,
    markFailed: markFailed,
    applyMode: applyMode,
    applyStyle: applyStyle,
    detectPageDark: detectPageDark,
    removeAll: removeAll,
    exportSegments: exportSegments,
    baseStyleOf: baseStyleOf
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
