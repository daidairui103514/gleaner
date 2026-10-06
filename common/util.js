(function (root) {
  'use strict';

  var CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/;
  var LATIN_WORD = /[A-Za-z\u00c0-\u024f]/;

  function domainOf(url) {
    try {
      var u = new URL(url);
      if (u.protocol === 'file:') return 'file';
      return u.hostname.replace(/^www\./, '');
    } catch (e) {
      return '';
    }
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        fn.apply(self, args);
      }, wait);
    };
  }

  function throttle(fn, wait) {
    var last = 0;
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      var now = Date.now();
      var remain = wait - (now - last);
      if (remain <= 0) {
        last = now;
        fn.apply(self, args);
      } else if (!timer) {
        timer = setTimeout(function () {
          timer = null;
          last = Date.now();
          fn.apply(self, args);
        }, remain);
      }
    };
  }

  function hash(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return h.toString(36);
  }

  function hasCJK(text) {
    return CJK.test(text);
  }

  function hasLatin(text) {
    return LATIN_WORD.test(text);
  }

  function isTranslatableText(text) {
    var t = text.trim();
    if (!t || t.length < 2) return false;
    if (!/[A-Za-z\u00c0-\u024f\u0400-\u04ff\u3040-\u30ff\u4e00-\u9fff\u0600-\u06ff\u0e00-\u0e7f\u0900-\u097f\uac00-\ud7af]/.test(t)) {
      return false;
    }
    if (/^https?:\/\/\S+$/i.test(t)) return false;
    if (/^[\w.+-]+@[\w-]+\.[\w.]+$/.test(t)) return false;
    if (/^[#@][\w-]+$/.test(t)) return false;
    if (/^[\d\s.,:%+\-/()]+$/.test(t)) return false;
    if (/^[{[(<].*[}\])>]$/.test(t) && !/[A-Za-z]{3,}\s[A-Za-z]{3,}/.test(t)) return false;
    return true;
  }

  function splitSentences(text, maxLen) {
    maxLen = maxLen || 1200;
    if (text.length <= maxLen) return [text];

    var segments = text.match(/[^.!?。！？；;\n]+[.!?。！？；;]?[\s]*/g) || [text];
    var out = [];
    var buf = '';
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      if (seg.length > maxLen) {
        if (buf) {
          out.push(buf);
          buf = '';
        }
        for (var j = 0; j < seg.length; j += maxLen) {
          out.push(seg.slice(j, j + maxLen));
        }
        continue;
      }
      if ((buf + seg).length > maxLen) {
        out.push(buf);
        buf = seg;
      } else {
        buf += seg;
      }
    }
    if (buf) out.push(buf);
    return out.filter(function (s) {
      return s.trim().length > 0;
    });
  }

  function makeBatches(items, maxCount, maxChars) {
    maxCount = maxCount || 20;
    maxChars = maxChars || 4000;
    var batches = [];
    var cur = [];
    var size = 0;
    for (var i = 0; i < items.length; i++) {
      var len = (items[i].text || '').length;
      if (cur.length && (cur.length >= maxCount || size + len > maxChars)) {
        batches.push(cur);
        cur = [];
        size = 0;
      }
      cur.push(items[i]);
      size += len;
    }
    if (cur.length) batches.push(cur);
    return batches;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function pool(tasks, limit) {
    var results = new Array(tasks.length);
    var index = 0;
    var running = 0;
    return new Promise(function (resolve, reject) {
      var failed = 0;
      var firstError = null;
      function next() {
        if (index >= tasks.length) {
          if (running === 0) resolve(results);
          return;
        }
        var i = index++;
        running++;
        Promise.resolve()
          .then(tasks[i])
          .then(function (value) {
            results[i] = value;
          })
          .catch(function (err) {
            failed++;
            if (!firstError) firstError = err;
          })
          .then(function () {
            running--;
            if (index >= tasks.length && running === 0) {
              if (failed === tasks.length && firstError) reject(firstError);
              else resolve(results);
            } else {
              next();
            }
          });
      }
      if (!tasks.length) {
        resolve(results);
        return;
      }
      var start = Math.min(limit || 4, tasks.length);
      for (var k = 0; k < start; k++) next();
    });
  }

  root.AmberUtil = {
    domainOf: domainOf,
    debounce: debounce,
    throttle: throttle,
    hash: hash,
    hasCJK: hasCJK,
    hasLatin: hasLatin,
    isTranslatableText: isTranslatableText,
    splitSentences: splitSentences,
    makeBatches: makeBatches,
    sleep: sleep,
    escapeHtml: escapeHtml,
    clamp: clamp,
    pool: pool
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
