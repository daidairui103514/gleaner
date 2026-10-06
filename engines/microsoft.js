
const ENDPOINT = 'https://api.cognitive.microsofttranslator.com/translate';
const MAX_ITEMS = 25;
const MAX_CHARS = 4500;

export default {
  id: 'microsoft',
  name: '微软翻译（官方 API）',
  desc: 'Azure 翻译，免费层每月 200 万字符。需要在设置里填 Key 和区域。',
  needKey: true,
  maxItems: MAX_ITEMS,
  maxChars: MAX_CHARS,

  async translateBatch(texts, ctx) {
    const cfg = ctx.config || {};
    if (!cfg.apiKey) throw new Error('还没有填微软翻译的 Key，请到设置里填写');

    const params = new URLSearchParams({ 'api-version': '3.0', to: ctx.to });
    if (ctx.from && ctx.from !== 'auto') params.set('from', ctx.from);

    const headers = {
      'content-type': 'application/json',
      'Ocp-Apim-Subscription-Key': cfg.apiKey
    };
    if (cfg.region) headers['Ocp-Apim-Subscription-Region'] = cfg.region;

    const out = [];
    for (let i = 0; i < texts.length; i += MAX_ITEMS) {
      const slice = texts.slice(i, i + MAX_ITEMS);
      const res = await fetch(ENDPOINT + '?' + params.toString(), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(
          slice.map(function (text) {
            return { Text: text };
          })
        ),
        credentials: 'omit'
      });

      if (res.status === 401) throw new Error('微软翻译 Key 无效或区域不正确');
      if (res.status === 429) throw new Error('微软翻译超出配额或频率限制');
      if (!res.ok) throw new Error('微软翻译请求失败（HTTP ' + res.status + '）');

      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('微软翻译返回了意外的数据格式');
      data.forEach(function (item) {
        out.push((item && item.translations && item.translations[0] && item.translations[0].text) || '');
      });
    }
    return out;
  }
};
