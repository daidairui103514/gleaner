/* 页面世界（MAIN world）的字幕轨嗅探器。
   必须在 document_start 注入，早于站点脚本，才包得住 fetch / XHR。

   它负责「拿到整条带时间戳的字幕」，然后 postMessage 给隔离环境。
   这样字幕模块就能按时间轴预翻译，而不是等字幕出现才开始翻 —— 零延迟的关键。

   为什么非得在这一层：
   - YouTube 的 captionTracks 藏在 ytInitialPlayerResponse / youtubei/v1/player 响应里
   - B 站的 /x/player/v2 要带登录 Cookie，只有页面内发起的请求才有
   隔离环境既拿不到页面全局变量，也复刻不了带 Cookie 的请求。 */
(function () {
  'use strict';

  const TAG = 'amber-subtitle-track';
  const REQUEST = 'amber-subtitle-request';
  let lastKey = '';
  let busy = false;
  /* 已经拿到的结果留一份：接收端可能比这个脚本晚加载，
     那时它发个请求过来，我们直接重发，不用重新抓一遍 */
  let cached = null;

  function post(payload) {
    try {
      window.postMessage(Object.assign({ source: TAG }, payload), '*');
    } catch (e) {
      /* 忽略 */
    }
  }

  /* 出问题时能一眼看出卡在哪一步 */
  let lastStatus = '';
  function status(text) {
    if (text === lastStatus) return;
    lastStatus = text;
    post({ status: text });
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  /* ---------------------------------------------------- 轨道 → 时间轴 */

  /** YouTube json3：{ events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] } */
  function parseYouTube(data) {
    const events = Array.isArray(data && data.events) ? data.events : [];
    const rows = [];
    events.forEach(function (ev) {
      if (!ev || ev.tStartMs == null) return;
      if (!ev.segs || !ev.segs.length) return;
      const value = ev.segs
        .map(function (s) {
          return s.utf8 || '';
        })
        .join('')
        .replace(/\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!value) return;
      const start = ev.tStartMs / 1000;
      rows.push({
        start: start,
        end: start + (ev.dDurationMs || 0) / 1000,
        text: value
      });
    });
    return rows;
  }

  /** B 站：{ body: [{ from, to, content }] }，from/to 单位是秒 */
  function parseBilibili(data) {
    const body = Array.isArray(data && data.body) ? data.body : [];
    return body
      .map(function (item) {
        return {
          start: Number(item.from) || 0,
          end: Number(item.to) || 0,
          text: text(item.content)
        };
      })
      .filter(function (row) {
        return row.text;
      });
  }

  /** YouTube 的 XML 字幕格式（srv1 / srv3）：<text start="0" dur="2.5">内容</text> */
  function parseYouTubeXml(xml) {
    const rows = [];
    try {
      const doc = new DOMParser().parseFromString(xml, 'text/xml');
      const nodes = doc.querySelectorAll('text');
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const start = parseFloat(node.getAttribute('start') || '0');
        const dur = parseFloat(node.getAttribute('dur') || '0');
        const value = (node.textContent || '')
          .replace(/\n+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (!value) continue;
        rows.push({ start: start, end: start + dur, text: value });
      }
    } catch (e) {
      /* 忽略 */
    }
    return rows;
  }

  /**
   * 自动字幕（ASR）是「滚动累积」的：每一条都把前面几条的内容带在身上。
   * 直接拼起来就会出现「我买了这家店，我买了这家店，而且…」这种重复。
   * 这里把每条前面重复的部分去掉，只留新增的。
   */
  function dropRollingPrefix(rows) {
    const out = [];
    rows.forEach(function (row) {
      const prev = out[out.length - 1];
      if (prev && row.text) {
        if (row.text === prev.text) {
          /* 完全相同：滚动字幕的时间是紧挨着的，隔得远说明是真的说了两遍 */
          if (row.start - prev.end < 1.5) return;
        } else if (row.text.indexOf(prev.text) === 0) {
          /* 可能连着累积了好几层，一直剥到不是重复开头为止 */
          let extra = row.text.slice(prev.text.length).trim();
          while (extra && extra.indexOf(prev.text) === 0) {
            const next = extra.slice(prev.text.length).trim();
            if (next === extra) break;
            extra = next;
          }
          if (!extra) return;
          row.text = extra;
        }
      }
      out.push(row);
    });
    return out;
  }

  /** 把零碎的字幕合并成完整句子，避免一句被拆成好几段来回闪 */
  function mergeRows(rows) {
    const out = [];
    rows.forEach(function (row) {
      const prev = out[out.length - 1];
      if (
        prev &&
        row.start - prev.end < 0.35 &&
        !/[.!?。！？:：]$/.test(prev.text) &&
        prev.text.length < 90
      ) {
        prev.text = (prev.text + ' ' + row.text).replace(/\s+/g, ' ').trim();
        prev.end = row.end;
        return;
      }
      out.push({ start: row.start, end: row.end, text: row.text });
    });
    return out;
  }

  /* ------------------------------------------------------ YouTube 取轨 */

  function youtubeResponse() {
    if (window.ytInitialPlayerResponse) return window.ytInitialPlayerResponse;
    const player = document.getElementById('movie_player');
    if (player && typeof player.getPlayerResponse === 'function') {
      try {
        return player.getPlayerResponse();
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  function youtubeTracks(response) {
    try {
      const list = response.captions.playerCaptionsTracklistRenderer.captionTracks || [];
      return list.map(function (t) {
        return {
          url: t.baseUrl,
          lang: t.languageCode || '',
          name: (t.name && (t.name.simpleText || (t.name.runs && t.name.runs[0] && t.name.runs[0].text))) || '',
          auto: t.kind === 'asr'
        };
      });
    } catch (e) {
      return [];
    }
  }

  /* ----------------------------------------------------- Bilibili 取轨 */

  function bilibiliTracks(data) {
    let list = [];
    try {
      list = data.data.subtitle.subtitles || [];
    } catch (e) {
      list = [];
    }
    return list
      .map(function (item) {
        let url = item.subtitle_url || '';
        if (url.indexOf('//') === 0) url = 'https:' + url;
        return {
          url: url,
          lang: item.lan || '',
          name: item.lan_doc || '',
          auto: /^ai-/.test(item.lan || '')
        };
      })
      .filter(function (t) {
        return t.url;
      });
  }

  /* -------------------------------------------------------- 拉取与派发 */

  /** 拿到内容后按实际格式解析 —— 不假设它一定是 json3 */
  function parseAny(site, raw) {
    const text = String(raw || '').trim();
    if (!text) return [];

    if (site === 'bilibili') {
      return mergeRows(parseBilibili(JSON.parse(text)));
    }

    const head = text.charAt(0);
    let rows = [];
    if (head === '{') rows = parseYouTube(JSON.parse(text));
    else if (head === '<') rows = parseYouTubeXml(text);
    if (!rows.length) return [];

    /* 无条件剥离重复前缀：正常字幕的第一条不会是下一条的开头，
       所以对它们没有副作用；而滚动累积的字幕正需要这一步。 */
    rows = dropRollingPrefix(rows);
    return mergeRows(rows);
  }

  async function requestText(url) {
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.text();
  }

  async function fetchTimeline(site, track) {
    if (site === 'youtube') {
      /* 先试 json3；拿回来是空的就退回原始地址（可能是 srv3/XML） */
      const jsonUrl =
        track.url + (track.url.indexOf('?') === -1 ? '?' : '&') + 'fmt=json3';

      let raw = '';
      try {
        raw = await requestText(jsonUrl);
      } catch (e) {
        raw = '';
      }

      if (!raw.trim()) {
        raw = await requestText(track.url);
      }
      if (!raw.trim()) throw new Error('响应为空（可能是地址过期）');

      const rows = parseAny('youtube', raw);
      if (!rows.length) throw new Error('解析后没有字幕内容');
      return rows;
    }

    const raw = await requestText(track.url);
    const rows = parseAny('bilibili', raw);
    if (!rows.length) throw new Error('解析后没有字幕内容');
    return rows;
  }

  async function handleTracks(site, tracks) {
    if (busy || !tracks || !tracks.length) return;

    /* 优先人工字幕，其次自动生成 */
    const manual = tracks.find(function (t) {
      return !t.auto;
    });
    const track = manual || tracks[0];

    const key = site + '|' + track.url;
    if (key === lastKey) return;

    busy = true;
    status('找到 ' + tracks.length + ' 条轨道，正在拉取 ' + (track.lang || '?'));
    try {
      const rows = await fetchTimeline(site, track);
      if (!rows.length) throw new Error('字幕内容为空');

      lastKey = key;
      cached = {
        site: site,
        lang: track.lang,
        name: track.name,
        rows: rows,
        languages: tracks.map(function (t) {
          return { lang: t.lang, name: t.name };
        })
      };
      status('已就绪 ' + rows.length + ' 条（' + (track.lang || '?') + '）');
      post(cached);

      /* 接收端是 document_idle 才注入的，可能还没起来。
         隔几秒再补发两次，确保它一定收得到。 */
      [1200, 4000].forEach(function (delay) {
        setTimeout(function () {
          if (cached) post(cached);
        }, delay);
      });
    } catch (err) {
      status('拉取失败：' + String((err && err.message) || err));
      post({ site: site, error: String((err && err.message) || err) });
    } finally {
      busy = false;
    }
  }

  /* 接收端加载完会来问一次，有缓存就直接给它 */
  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    if (!e.data || e.data.source !== REQUEST) return;
    if (cached) post(cached);
  });

  /* ------------------------------------------------------------ 拦截 */

  function kindOf(url) {
    const u = String(url || '');
    /* 和简约翻译一致的宽松匹配 */
    if (u.indexOf('timedtext') !== -1) return 'youtube-timedtext';
    if (/youtubei\/v1\/player/.test(u)) return 'youtube';
    if (/\/x\/player\/(wbi\/)?v2/.test(u)) return 'bilibili';
    return '';
  }

  /** 从 timedtext 请求里直接拿现成的字幕地址（截掉原有 fmt，重新指定 json3） */
  function trackFromTimedtext(rawUrl) {
    try {
      const u = new URL(rawUrl, location.origin);
      const v = u.searchParams.get('v') || '';
      const lang = u.searchParams.get('lang') || '';
      const kind = u.searchParams.get('kind') || '';
      const name = u.searchParams.get('name') || '';
      if (!v || !lang) return null;

      u.searchParams.set('fmt', 'json3');
      return [
        {
          url: u.toString(),
          lang: lang,
          name: name || lang,
          auto: kind === 'asr'
        }
      ];
    } catch (e) {
      return null;
    }
  }

  let timedtextDone = false;

  function langFromUrl(rawUrl) {
    try {
      return new URL(rawUrl, location.origin).searchParams.get('lang') || '';
    } catch (e) {
      return '';
    }
  }

  /**
   * 直接拿播放器请求回来的响应体建时间轴。
   * timedtext 的地址带时效签名，自己再 fetch 一遍会拿到空内容 ——
   * 所以拦截到响应就地解析，不重新请求。
   */
  function adoptRawBody(raw, url) {
    if (timedtextDone) return;
    const text = String(raw || '').trim();
    if (!text) return;

    let kind = '';
    let lang = '';
    try {
      const u = new URL(url, location.origin);
      kind = u.searchParams.get('kind') || '';
      lang = u.searchParams.get('lang') || '';
    } catch (e) {
      /* 忽略 */
    }

    let rows;
    try {
      rows = parseAny('youtube', text);
    } catch (e) {
      rows = [];
    }
    if (!rows.length) return;

    timedtextDone = true;
    cached = { site: 'youtube', lang: lang, name: '', rows: rows, languages: [] };
    status('已就绪 ' + rows.length + ' 条（' + (lang || '?') + (kind === 'asr' ? ' · 自动' : '') + '）');
    post(cached);

    [1500, 4000].forEach(function (delay) {
      setTimeout(function () {
        if (cached) post(cached);
      }, delay);
    });
  }

  function dispatch(kind, data, url) {
    if (kind === 'youtube') {
      handleTracks('youtube', youtubeTracks(data));
    } else if (kind === 'youtube-timedtext') {
      /* data 是拦截到的响应文本本身 */
      adoptRawBody(data, url);
    } else if (kind === 'bilibili') {
      handleTracks('bilibili', bilibiliTracks(data));
    }
  }

  function wrapFetch() {
    const original = window.fetch;
    if (!original || original.__amberWrapped) return;

    const wrapped = function () {
      const args = arguments;
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      const kind = kindOf(url);
      const promise = original.apply(this, args);
      if (!kind) return promise;

      return promise.then(function (res) {
        /* timedtext：把响应体复制一份直接解析，不重新请求。
           要用 clone()，否则会把页面自己要读的流消费掉。 */
        if (kind === 'youtube-timedtext') {
          try {
            res
              .clone()
              .text()
              .then(function (txt) {
                adoptRawBody(txt, url);
              })
              .catch(function () {});
          } catch (e) {
            /* 忽略 */
          }
          return res;
        }
        try {
          res
            .clone()
            .json()
            .then(function (data) {
              dispatch(kind, data, url);
            })
            .catch(function () {});
        } catch (e) {
          /* 忽略 */
        }
        return res;
      });
    };

    wrapped.__amberWrapped = true;
    window.fetch = wrapped;
  }

  function wrapXhr() {
    const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
    if (!proto || proto.__amberWrapped) return;

    const originalOpen = proto.open;
    const originalSend = proto.send;

    proto.open = function (method, url) {
      try {
        this.__amberUrl = url;
      } catch (e) {
        /* 忽略 */
      }
      return originalOpen.apply(this, arguments);
    };

    proto.send = function () {
      try {
        const kind = kindOf(this.__amberUrl);
        if (kind) {
          this.addEventListener('load', function () {
            /* 响应体就在手边，直接用，别重新请求 */
            if (kind === 'youtube-timedtext') {
              try {
                adoptRawBody(this.responseText, this.responseURL || this.__amberUrl);
              } catch (e) {
                /* 忽略 */
              }
              return;
            }
            try {
              dispatch(kind, JSON.parse(this.responseText), this.__amberUrl);
            } catch (e) {
              /* 忽略 */
            }
          });
        }
      } catch (e) {
        /* 忽略 */
      }
      return originalSend.apply(this, arguments);
    };

    proto.__amberWrapped = true;
  }

  /* ------------------------------------------------------------ 启动 */

  wrapFetch();
  wrapXhr();

  /* YouTube 首次进入直接读全局变量；SPA 换视频靠下面的监听 */
  function tryYouTube() {
    const response = youtubeResponse();
    if (!response) return false;
    const tracks = youtubeTracks(response);
    if (!tracks.length) return false;
    handleTracks('youtube', tracks);
    return true;
  }

  let tries = 0;
  const timer = setInterval(function () {
    tries++;
    if (tryYouTube() || tries > 60) clearInterval(timer);
  }, 1000);

  /* YouTube 是 SPA：点右侧推荐视频时页面不会重新加载，
     必须自己把状态清掉，否则会一直用上一个视频的字幕 */
  function resetForNewVideo() {
    timedtextDone = false;
    lastKey = '';
    cached = null;
    post({ reset: true });
    status('检测到换视频，重新抓取…');
  }

  ['yt-navigate-start', 'yt-navigate-finish', 'yt-page-data-updated'].forEach(function (name) {
    window.addEventListener(name, function () {
      resetForNewVideo();
      setTimeout(tryYouTube, 1200);
    });
  });

  /* B 站换 P / 换视频也会重新请求 player/v2，上面已经拦到；这里补一次首屏 */
  setTimeout(function () {
    tryYouTube();
  }, 1500);
})();
