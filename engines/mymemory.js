
const ENDPOINT = 'https://api.mymemory.translated.net/get';
const LIMIT = 480; // 接口对单段长度有限制

function mmLang(code) {
  if (!code || code === 'auto') return 'en';
  const map = {
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW',
    he: 'he',
    'sr-Cyrl': 'sr',
    nb: 'no'
  };
  return map[code] || code.split('-')[0];
}

export default {
  id: 'mymemory',
  name: 'MyMemory（备用免费通道）',
  desc: '免密钥，但单段长度有限、质量不如前两者，语言覆盖也较少。',
  needKey: false,
  maxItems: 1,
  maxChars: LIMIT,

  async translateBatch(texts, ctx) {
    const out = [];
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (text.length > LIMIT) {
        out.push('');
        continue;
      }
      const params = new URLSearchParams({
        q: text,
        langpair: mmLang(ctx.from) + '|' + mmLang(ctx.to)
      });
      const res = await fetch(ENDPOINT + '?' + params.toString(), { credentials: 'omit' });
      if (!res.ok) throw new Error('MyMemory 请求失败（HTTP ' + res.status + '）');
      const data = await res.json();
      const value = data && data.responseData && data.responseData.translatedText;
      out.push(typeof value === 'string' ? value : '');
    }
    return out;
  }
};
