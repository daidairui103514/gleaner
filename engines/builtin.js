/**
 * 浏览器内置翻译（完全离线）
 * 需要 Chrome 138+ / Edge 148+，且存在地区与硬件限制，仅作兜底。
 */

const BASE = {
  'zh-Hans': 'zh',
  'zh-Hant': 'zh-Hant',
  'mn-Cyrl': 'mn',
  'sr-Cyrl': 'sr',
  'sr-Latn': 'sr-Latn',
  'iu-Latn': 'iu',
  'tlh-Latn': 'tlh',
  'tlh-Piqd': 'tlh'
};

function toBuiltinCode(code) {
  if (!code) return null;
  return BASE[code] || String(code).split('-')[0];
}

function api() {
  return typeof self !== 'undefined' ? self : globalThis;
}

export default {
  id: 'builtin',
  name: '浏览器内置翻译（离线）',
  desc: '完全离线不上传。需要较新的 Chrome/Edge，且受地区与硬件限制。',
  needKey: false,
  maxItems: 8,
  maxChars: 2000,

  async available() {
    return typeof api().Translator !== 'undefined';
  },

  async translateBatch(texts, ctx) {
    const scope = api();
    if (typeof scope.Translator === 'undefined') {
      throw new Error('当前浏览器不支持内置翻译（需要 Chrome 138+ 或 Edge 148+）');
    }

    let source = toBuiltinCode(ctx.from);
    if (!source || ctx.from === 'auto') {
      if (typeof scope.LanguageDetector === 'undefined') {
        throw new Error('内置翻译需要先检测语言，但当前浏览器不支持语言检测');
      }
      const detector = await scope.LanguageDetector.create();
      const results = await detector.detect(texts.slice(0, 3).join(' '));
      const best = results && results[0];
      source = toBuiltinCode(best && best.detectedLanguage);
      if (!source) throw new Error('无法识别源语言，请手动指定后再试');
    }

    const target = toBuiltinCode(ctx.to);
    const status = await scope.Translator.availability({
      sourceLanguage: source,
      targetLanguage: target
    });
    if (status === 'unavailable') {
      throw new Error('内置模型不支持 ' + source + ' → ' + target + ' 这个语言对');
    }

    const translator = await scope.Translator.create({
      sourceLanguage: source,
      targetLanguage: target
    });

    const out = [];
    for (let i = 0; i < texts.length; i++) {
      out.push(await translator.translate(texts[i]));
    }
    return out;
  }
};
