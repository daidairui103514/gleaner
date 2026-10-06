/**
 * 谷歌翻译（免密钥通道）
 * 注意：国内直连通常不可用，需要浏览器走代理。
 */
const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

/** 谷歌的语言代码与微软略有差异 */
function toGoogleCode(code) {
  if (!code) return 'auto';
  const map = {
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW',
    he: 'iw',
    'sr-Cyrl': 'sr',
    'mn-Cyrl': 'mn'
  };
  return map[code] || code;
}

async function translateOne(text, from, to, retry) {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: toGoogleCode(from),
    tl: toGoogleCode(to),
    dt: 't',
    q: text
  });

  const res = await fetch(ENDPOINT + '?' + params.toString(), { credentials: 'omit' });
  if (!res.ok) throw new Error('谷歌翻译请求失败（HTTP ' + res.status + '）');

  const data = await res.json();
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    if (retry !== false) return translateOne(text, from, to, false);
    throw new Error('谷歌翻译返回了意外的数据格式');
  }
  return data[0]
    .map(function (seg) {
      return seg && seg[0] ? seg[0] : '';
    })
    .join('');
}

export default {
  id: 'google',
  name: '谷歌翻译',
  desc: '免密钥，质量稳定。国内需要浏览器走代理才能用。',
  needKey: false,
  maxItems: 1,
  maxChars: 1800,

  async translateBatch(texts, ctx) {
    const out = [];
    for (let i = 0; i < texts.length; i++) {
      out.push(await translateOne(texts[i], ctx.from, ctx.to, true));
    }
    return out;
  }
};
