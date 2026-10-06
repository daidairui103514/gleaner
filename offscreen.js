/* 离屏文档：在后台跑本地 OCR，不占用页面线程 */

const LANG_DIR = 'lib/tesseract/lang';

const workers = new Map();

function langPathFor(lang) {
  return chrome.runtime.getURL(LANG_DIR);
}

function localLangExists(lang) {
  return lang === 'eng';
}

async function getWorker(lang) {
  const key = lang;
  if (workers.has(key)) return workers.get(key);

  const promise = (async function () {
    if (typeof Tesseract === 'undefined') {
      throw new Error('OCR 组件没有加载成功');
    }

    const options = {
      workerPath: chrome.runtime.getURL('lib/tesseract/worker.min.js'),
      corePath: chrome.runtime.getURL('lib/tesseract/core'),
      workerBlobURL: false,
      logger: function () {},
      errorHandler: function () {}
    };

    if (localLangExists(lang)) {
      options.langPath = langPathFor(lang);
    } else {
      options.langPath = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/' + lang + '/4.0.0_best_int';
    }

    const worker = await Tesseract.createWorker(lang, 1, options);
    return worker;
  })();

  workers.set(key, promise);
  promise.catch(function () {
    workers.delete(key);
  });
  return promise;
}

/**
 * 识别前的图像预处理。
 * Tesseract 对小字、低对比度的图识别很差，先放大 + 转灰度 + 拉伸对比度，
 * 印刷体能明显变好；失败就退回原图，不影响流程。
 */
async function preprocess(blob) {
  try {
    const bitmap = await createImageBitmap(blob);
    const scale = bitmap.width < 1200 ? 2 : 1;
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, width, height);

    const imageData = ctx.getImageData(0, 0, width, height);
    const px = imageData.data;
    const gray = new Uint8ClampedArray(width * height);

    let min = 255;
    let max = 0;
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const g = (px[i] * 299 + px[i + 1] * 587 + px[i + 2] * 114) / 1000;
      gray[j] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }

    const span = Math.max(1, max - min);
    for (let i = 0, j = 0; i < px.length; i += 4, j++) {
      const v = ((gray[j] - min) / span) * 255;
      px[i] = px[i + 1] = px[i + 2] = v;
      px[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);

    return await canvas.convertToBlob({ type: 'image/png' });
  } catch (e) {
    return blob;
  }
}

async function ocrImage(url, lang) {
  const language = lang || 'eng';

  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) throw new Error('图片下载失败（HTTP ' + response.status + '）');
  const blob = await response.blob();
  if (!blob.size) throw new Error('图片内容为空');

  const prepared = await preprocess(blob);

  const worker = await getWorker(language);
  const result = await worker.recognize(prepared);
  const data = (result && result.data) || {};
  const text = data.text || '';

  return {
    text: text.replace(/\n{3,}/g, '\n\n').trim(),
    confidence: typeof data.confidence === 'number' ? Math.round(data.confidence) : null
  };
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== 'amber:ocr-run') return false;

  ocrImage(message.url, message.lang)
    .then(function (out) {
      sendResponse({ ok: true, data: out });
    })
    .catch(function (err) {
      sendResponse({ ok: false, error: (err && err.message) || String(err) });
    });

  return true;
});
