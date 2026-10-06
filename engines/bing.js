
const HOME = 'https://cn.bing.com/translator';
const API = 'https://cn.bing.com/ttranslatev3';
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36 Edg/151.0.0.0';

let session = null;
let sessionTask = null;

function pick(html, regex) {
  const match = regex.exec(html);
  return match ? match[1] : '';
}

async function openSession() {
  const res = await fetch(HOME, {
    credentials: 'include',
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'user-agent': UA
    }
  });
  if (!res.ok) throw new Error('必应翻译初始化失败（HTTP ' + res.status + '）');

  const html = await res.text();
  const ig = pick(html, /IG:"([0-9A-Fa-f]+)"/);
  const iid = pick(html, /data-iid="([^"]+)"/);
  const helper = pick(html, /params_AbusePreventionHelper\s*=\s*\[([^\]]*)\]/);

  if (!ig || !helper) {
    throw new Error('必应翻译页面结构变了，暂时无法初始化（可以改用大模型引擎）');
  }

  const parts = helper.split(',');
  const key = (parts[0] || '').trim().replace(/^"|"$/g, '');
  const token = (parts[1] || '').trim().replace(/^"|"$/g, '');
  const ttl = Number((parts[2] || '').trim()) || 3600000;

  if (!key || !token) throw new Error('必应翻译令牌解析失败');

  return {
    ig: ig,
    iid: iid || 'translator.5023',
    key: key,
    token: token,
    expires: Date.now() + Math.min(ttl, 25 * 60 * 1000)
  };
}

async function getSession(force) {
  if (!force && session && Date.now() < session.expires) return session;
  if (sessionTask) return sessionTask;

  sessionTask = openSession()
    .then(function (value) {
      session = value;
      sessionTask = null;
      return value;
    })
    .catch(function (err) {
      sessionTask = null;
      throw err;
    });

  return sessionTask;
}

function bingLang(code) {
  if (!code || code === 'auto') return 'auto-detect';
  return code;
}

async function callApi(text, from, to, s) {
  const url = API + '?isVertical=1&IG=' + encodeURIComponent(s.ig) + '&IID=' + encodeURIComponent(s.iid);
  const body = new URLSearchParams();
  body.set('fromLang', bingLang(from));
  body.set('text', text);
  body.set('to', to);
  body.set('token', s.token);
  body.set('key', s.key);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'application/json, text/plain, */*',
      'user-agent': UA
    },
    body: body.toString(),
    credentials: 'include'
  });

  if (!res.ok) throw new Error('必应翻译请求失败（HTTP ' + res.status + '）');

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('必应翻译返回了非 JSON 内容，可能触发了风控');
  }

  if (data && !Array.isArray(data) && data.statusCode && data.statusCode !== 200) {
    const err = new Error('必应翻译返回错误码 ' + data.statusCode);
    err.code = data.statusCode;
    throw err;
  }

  const item = Array.isArray(data) ? data[0] : null;
  const value = item && item.translations && item.translations[0] && item.translations[0].text;
  if (typeof value !== 'string') throw new Error('必应翻译返回了意外的数据格式');
  return { text: value, detected: (item.detectedLanguage && item.detectedLanguage.language) || '' };
}

async function translateOne(text, from, to) {
  const s = await getSession(false);
  try {
    return await callApi(text, from, to, s);
  } catch (err) {
    if (err.code === 205 || err.code === 401 || /错误码/.test(err.message)) {
      const fresh = await getSession(true);
      return callApi(text, from, to, fresh);
    }
    throw err;
  }
}

export default {
  id: 'bing',
  name: '必应翻译',
  desc: '免注册、免密钥，国内可直连。默认引擎。',
  needKey: false,
  maxItems: 1,
  maxChars: 5000,

  async translateBatch(texts, ctx) {
    const out = [];
    const concurrency = Math.max(1, Math.min(Number(ctx.config && ctx.config.concurrency) || 4, texts.length));
    let index = 0;

    async function worker() {
      while (index < texts.length) {
        const i = index++;
        const result = await translateOne(texts[i], ctx.from, ctx.to);
        out[i] = result.text;
      }
    }

    const workers = [];
    for (let i = 0; i < concurrency; i++) workers.push(worker());
    await Promise.all(workers);

    return texts.map(function (_, i) {
      return out[i] || '';
    });
  }
};
