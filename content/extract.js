/* 段落提取：把页面正文拆成「可翻译的段落块」 */
(function (root) {
  'use strict';

  const SKIP_TAGS = {
    SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1,
    CODE: 1, PRE: 1, KBD: 1, SAMP: 1, VAR: 1,
    TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, OPTGROUP: 1,
    SVG: 1, CANVAS: 1, MATH: 1, IFRAME: 1, OBJECT: 1, EMBED: 1,
    VIDEO: 1, AUDIO: 1, MAP: 1, AREA: 1,
    SCRIPT: 1, HEAD: 1, META: 1, LINK: 1, TITLE: 1
  };

  const INNER_TAGS = { LI: 1, TD: 1, TH: 1, DT: 1, DD: 1, CAPTION: 1, FIGCAPTION: 1, SUMMARY: 1 };

  const INLINE_DISPLAY = {
    inline: 1,
    contents: 1,
    ruby: 1,
    'ruby-text': 1,
    'ruby-base': 1
  };

  const MAX_SEGMENT_CHARS = 6000;

  const styleCache = new WeakMap();

  function displayOf(el) {
    let value = styleCache.get(el);
    if (value !== undefined) return value;
    try {
      value = getComputedStyle(el).display;
    } catch (e) {
      value = 'block';
    }
    styleCache.set(el, value);
    return value;
  }

  function isHidden(el) {
    if (el.hidden) return true;
    if (el.getAttribute('aria-hidden') === 'true') return true;
    const style = styleCache.get(el === document.body ? el : el);
    try {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return true;
      if (cs.opacity === '0' && el.tagName !== 'HTML') return true;
    } catch (e) {
      return false;
    }
    return false;
  }

  function isSkipped(el) {
    if (!el || el.nodeType !== 1) return true;
    if (SKIP_TAGS[el.tagName]) return true;
    if (el.isContentEditable) return true;
    const cls = el.className;
    if (typeof cls === 'string' && cls.indexOf('amber-') !== -1) return true;
    if (el.getAttribute && el.getAttribute('data-amber-skip') !== null) return true;
    return false;
  }

  /** 向上找到最近的块级容器 */
  function blockContainer(textNode) {
    let el = textNode.parentElement;
    let depth = 0;
    while (el && el !== document.body && el !== document.documentElement && depth < 60) {
      if (isSkipped(el)) return null;
      const display = displayOf(el);
      if (!INLINE_DISPLAY[display] && display !== 'inline') {
        if (el.tagName === 'BR') return null;
        if (isHidden(el)) return null;
        return el;
      }
      el = el.parentElement;
      depth++;
    }
    return null;
  }

  function decideInsertMode(el) {
    if (INNER_TAGS[el.tagName]) return 'inner';
    const parent = el.parentElement;
    if (parent && !isSkipped(parent)) {
      const pd = displayOf(parent);
      if (pd === 'flex' || pd === 'grid' || pd === 'inline-flex' || pd === 'inline-grid') return 'inner';
    }
    if (el.tagName === 'TR') return 'inner';
    if (el.tagName === 'P' && el.parentElement && el.parentElement.tagName === 'TD') return 'inner';
    return 'sibling';
  }

  /* --------------------------------------------------------- 语言识别 */

  /* 有独立字符集的语言，直接按字判断（注意要带 g 标志，match 才会返回全部匹配） */
  const SCRIPT_RULES = [
    { lang: 'ja', re: /[\u3040-\u30ff]/g },
    { lang: 'ko', re: /[\uac00-\ud7af]/g },
    { lang: 'zh', re: /[\u4e00-\u9fff]/g },
    { lang: 'ru', re: /[\u0400-\u04ff]/g },
    { lang: 'ar', re: /[\u0600-\u06ff]/g },
    { lang: 'th', re: /[\u0e00-\u0e7f]/g },
    { lang: 'he', re: /[\u0590-\u05ff]/g },
    { lang: 'el', re: /[\u0370-\u03ff]/g },
    { lang: 'hi', re: /[\u0900-\u097f]/g },
    { lang: 'bn', re: /[\u0980-\u09ff]/g },
    { lang: 'ta', re: /[\u0b80-\u0bff]/g },
    { lang: 'te', re: /[\u0c00-\u0c7f]/g },
    { lang: 'ka', re: /[\u10a0-\u10ff]/g },
    { lang: 'hy', re: /[\u0530-\u058f]/g },
    { lang: 'my', re: /[\u1000-\u109f]/g },
    { lang: 'km', re: /[\u1780-\u17ff]/g },
    { lang: 'lo', re: /[\u0e80-\u0eff]/g }
  ];

  /* 共用拉丁字母的语言，靠特征字符区分 */
  const LATIN_MARKS = [
    { lang: 'vi', re: /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i },
    { lang: 'tr', re: /[ğış]/i },
    { lang: 'pl', re: /[ąćęłńśźż]/i },
    { lang: 'cs', re: /[ěščřžůťďň]/i },
    { lang: 'hu', re: /[őű]/i },
    { lang: 'ro', re: /[ăâîșț]/i },
    { lang: 'de', re: /[äöüß]/i },
    { lang: 'es', re: /[ñ¿¡]/i },
    { lang: 'pt', re: /[ãõ]/i },
    { lang: 'is', re: /[ðþ]/i },
    { lang: 'fr', re: /[àâçéèêëîïôûùÿœ]/i }
  ];

  /* 拉丁语言的常用词，用来兜底判断 */
  const STOPWORDS = {
    en: ['the', 'and', 'of', 'to', 'is', 'are', 'was', 'were', 'that', 'this', 'with', 'for', 'from', 'have', 'has', 'been', 'will', 'would', 'can', 'could', 'should', 'they', 'their', 'there', 'which', 'when', 'what', 'your', 'you', 'not', 'but', 'all', 'more', 'other', 'into', 'than', 'then', 'them', 'these', 'its', 'about', 'because', 'while', 'still', 'just', 'only', 'in', 'it', 'be', 'by', 'a', 'an', 'on', 'at', 'or', 'as', 'if', 'we', 'do', 'no', 'so', 'up', 'out', 'my', 'me', 'he', 'she', 'our', 'who', 'how', 'why', 'any', 'each', 'both', 'such', 'too', 'very', 'now', 'here', 'some', 'also', 'over', 'after', 'before', 'between', 'under', 'during'],
    fr: ['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'est', 'que', 'qui', 'dans', 'pour', 'sur', 'avec', 'pas', 'plus', 'par', 'au', 'aux', 'ce', 'cette', 'sont', 'nous', 'vous', 'ils', 'elles', 'mais', 'comme', 'tout', 'se', 'ne', 'sa', 'son', 'ses'],
    de: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'mit', 'sich', 'auf', 'für', 'von', 'den', 'dem', 'ein', 'eine', 'zu', 'sind', 'des', 'als', 'auch', 'werden', 'wird', 'kann', 'noch', 'bei', 'aus', 'wenn', 'sie', 'wir', 'ich', 'aber', 'so'],
    es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'es', 'por', 'con', 'para', 'no', 'se', 'del', 'al', 'como', 'más', 'pero', 'sus', 'esta', 'son', 'entre', 'cuando', 'lo', 'su', 'si'],
    pt: ['o', 'a', 'os', 'as', 'de', 'que', 'e', 'em', 'um', 'uma', 'para', 'com', 'não', 'se', 'do', 'da', 'dos', 'das', 'por', 'mais', 'como', 'mas', 'são', 'ao', 'à', 'no', 'na'],
    it: ['il', 'la', 'i', 'le', 'di', 'che', 'e', 'in', 'un', 'una', 'per', 'con', 'non', 'si', 'del', 'della', 'dei', 'come', 'più', 'ma', 'sono', 'anche', 'questo', 'questa', 'è', 'lo', 'gli'],
    nl: ['de', 'het', 'een', 'en', 'van', 'is', 'dat', 'op', 'te', 'voor', 'met', 'niet', 'zijn', 'aan', 'ook', 'als', 'maar', 'door', 'om', 'dan', 'wordt', 'je', 'we', 'ze']
  };

  function detectLanguage(text) {
    const sample = text.slice(0, 500);

    for (let i = 0; i < SCRIPT_RULES.length; i++) {
      const found = sample.match(SCRIPT_RULES[i].re);
      if (found && found.length >= 2) return SCRIPT_RULES[i].lang;
    }

    const letters = sample.match(/[A-Za-z\u00c0-\u024f]/g);
    if (!letters || letters.length < 4) return '';

    for (let i = 0; i < LATIN_MARKS.length; i++) {
      if (LATIN_MARKS[i].re.test(sample)) return LATIN_MARKS[i].lang;
    }

    const words = (sample.toLowerCase().match(/[a-zà-öø-ÿ']{2,}/g) || []).slice(0, 120);
    if (words.length < 3) return '';

    let best = '';
    let bestScore = 0;
    Object.keys(STOPWORDS).forEach(function (lang) {
      const list = STOPWORDS[lang];
      let hits = 0;
      for (let i = 0; i < words.length; i++) {
        if (list.indexOf(words[i]) !== -1) hits++;
      }
      const score = hits / words.length;
      if (score > bestScore) {
        bestScore = score;
        best = lang;
      }
    });

    return bestScore >= 0.12 ? best : '';
  }

  /**
   * 判断这一段是否已经是目标语言。
   * 目标是英文，页面上的英文段落就跳过；目标是日文，日文段落就跳过，以此类推。
   */
  function sameLanguage(text, targetLang) {
    if (!targetLang) return false;
    const target = String(targetLang).toLowerCase().split('-')[0];
    const detected = detectLanguage(text);
    if (!detected) return false;
    if (target === 'yue' || target === 'lzh') return detected === 'zh';
    return detected === target;
  }

  /**
   * 提取可翻译段落
   * @param {Element} scope 起始节点，默认 document.body
   * @returns {Array<{id:number, el:Element, text:string, insertMode:string}>}
   */
  function collect(scope) {
    const start = scope || document.body;
    if (!start) return [];

    const walker = document.createTreeWalker(start, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        const text = node.nodeValue;
        if (!text || !text.trim()) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (isSkipped(parent)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const groups = new Map();
    const order = [];
    let node = walker.nextNode();
    let guard = 0;

    while (node && guard < 200000) {
      guard++;
      const container = blockContainer(node);
      if (container) {
        let group = groups.get(container);
        if (!group) {
          group = { el: container, parts: [] };
          groups.set(container, group);
          order.push(container);
        }
        group.parts.push(node.nodeValue);
      }
      node = walker.nextNode();
    }

    const result = [];
    let id = 0;
    const shown = new Set();

    for (const el of order) {
      const group = groups.get(el);
      const raw = group.parts.join('').replace(/\s+/g, ' ').trim();
      if (!raw || raw.length > MAX_SEGMENT_CHARS) continue;
      if (!root.AmberUtil.isTranslatableText(raw)) continue;
      if (sameLanguage(raw, root.AmberStore.state.settings.targetLang)) continue;

      const key = raw.slice(0, 160);
      if (shown.has(key) && raw.length < 40) continue;
      shown.add(key);

      result.push({
        id: id++,
        el: el,
        text: raw,
        insertMode: decideInsertMode(el)
      });
    }

    return result;
  }

  /** 取出当前视口内（以及上方已滚过）的段落下标 */
  function viewportFirst(segments) {
    const vh = window.innerHeight || 800;
    const near = [];
    const far = [];
    segments.forEach(function (seg, index) {
      let rect;
      try {
        rect = seg.el.getBoundingClientRect();
      } catch (e) {
        near.push(index);
        return;
      }
      if (rect.width === 0 && rect.height === 0) {
        near.push(index);
        return;
      }
      if (rect.top < vh * 1.5) near.push(index);
      else far.push(index);
    });
    return { near: near, far: far };
  }

  root.AmberExtract = {
    collect: collect,
    viewportFirst: viewportFirst,
    decideInsertMode: decideInsertMode,
    SKIP_TAGS: SKIP_TAGS
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
