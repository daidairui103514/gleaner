/**
 * OpenAI 兼容接口（BYOK）
 * 适用于 DeepSeek / 通义千问 / Kimi / 智谱 / 硅基流动 / OpenRouter / 本地 Ollama 等。
 */

const LENGTH_HINT = {
  1: '非常简短，只翻译核心含义',
  2: '简洁自然',
  3: '信达雅，保留完整信息'
};

function endpointOf(baseUrl) {
  let base = (baseUrl || 'https://api.deepseek.com/v1').trim().replace(/\s+/g, '');
  base = base.replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(base)) return base;
  if (/\/v\d+$/.test(base)) return base + '/chat/completions';
  if (/\/v\d+\/chat\/completions$/.test(base)) return base;
  return base + '/v1/chat/completions';
}

function buildSystemPrompt(ctx) {
  const targetName = ctx.targetName || ctx.to;
  const styleHint = LENGTH_HINT[ctx.config.promptLevel] || LENGTH_HINT[2];

  const lines = [
    '你是专业的网页翻译引擎，把用户给出的 JSON 字符串数组中的每一段文本翻译成' + targetName + '。',
    '',
    '硬性要求：',
    '1. 逐条翻译，输出 JSON 数组，数组长度和顺序必须与输入完全一致。',
    '2. 只输出 JSON 数组本身，不要解释、不要加 markdown 代码块、不要加任何前后缀。',
    '3. 保留原文中的数字、单位、代码、变量名、链接、@提及、#话题、emoji 和各类占位符。',
    '4. 已经是' + targetName + '的条目原样返回，不要二次翻译。',
    '5. 译文风格：' + styleHint + '，符合目标语言的表达习惯，不要逐字硬译。',
    '6. 段落中的换行用 \\n 表示，并在译文中保留。'
  ];

  if (ctx.pageTitle && ctx.useContext !== false) {
    lines.push('', '当前网页标题（仅供理解语境，不要翻译它本身）：' + ctx.pageTitle);
  }
  if (ctx.terms && ctx.terms.length) {
    lines.push('', '必须遵守的术语对照（出现时强制使用右侧译法）：');
    ctx.terms.slice(0, 60).forEach(function (term) {
      lines.push('- ' + term.from + ' → ' + term.to);
    });
  }

  return lines.join('\n');
}

function parseArray(raw, expected) {
  let text = String(raw || '').trim();
  text = text.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();

  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return null;

  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(parsed)) return null;
    const out = parsed.map(function (item) {
      if (typeof item === 'string') return item;
      if (item == null) return '';
      return String(item);
    });
    if (out.length !== expected) return null;
    return out;
  } catch (e) {
    return null;
  }
}

async function chat(payload, cfg) {
  const headers = { 'content-type': 'application/json' };
  if (cfg.apiKey) headers.authorization = 'Bearer ' + cfg.apiKey;

  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, Math.max(5000, Number(cfg.timeout) || 60000));

  let res;
  try {
    res = await fetch(endpointOf(cfg.baseUrl), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
      credentials: 'omit'
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = (body && body.error && (body.error.message || body.error.code)) || '';
    } catch (e) {
      /* 忽略解析失败 */
    }
    throw new Error('接口返回 HTTP ' + res.status + (detail ? '：' + detail : ''));
  }

  const data = await res.json();
  const choice = data && data.choices && data.choices[0];
  const content = choice && choice.message && choice.message.content;
  if (typeof content !== 'string') throw new Error('接口未返回有效的翻译内容');
  return content;
}

export default {
  id: 'openai',
  name: '大模型（OpenAI 兼容）',
  desc: '填入 Base URL 与 API Key，支持 DeepSeek、通义、Kimi、硅基流动、Ollama 等。',
  needKey: true,
  needBase: true,
  maxItems: 20,
  maxChars: 4000,

  async translateBatch(texts, ctx) {
    const cfg = ctx.config || {};
    if (!cfg.baseUrl) throw new Error('还没有配置接口地址，请到设置里填写');
    if (ctx.requireKey !== false && !cfg.apiKey && !/localhost|127\.0\.0\.1/.test(cfg.baseUrl)) {
      throw new Error('还没有配置 API Key，请到设置里填写');
    }

    const payload = {
      model: cfg.model || 'deepseek-chat',
      temperature: typeof cfg.temperature === 'number' ? cfg.temperature : 0.2,
      messages: [
        { role: 'system', content: buildSystemPrompt(ctx) },
        { role: 'user', content: JSON.stringify(texts) }
      ]
    };

    let content = await chat(payload, cfg);
    let parsed = parseArray(content, texts.length);
    if (parsed) return parsed;

    // 模型没按格式返回时，退化为逐条翻译
    const out = [];
    for (let i = 0; i < texts.length; i++) {
      const single = {
        model: payload.model,
        temperature: payload.temperature,
        messages: [
          {
            role: 'system',
            content:
              '把用户给出的文本翻译成' +
              (ctx.targetName || ctx.to) +
              '。只输出译文本身，不要任何解释、引号或前后缀。保留数字、代码、链接与换行。'
          },
          { role: 'user', content: texts[i] }
        ]
      };
      const one = await chat(single, cfg);
      out.push(String(one || '').trim());
    }
    return out;
  }
};
