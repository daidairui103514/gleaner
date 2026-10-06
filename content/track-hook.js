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
  let cached = null;

  function post(payload) {
    try {
      window.postMessage(Object.assign({ source: TAG }, payload), '*');
    } catch (e) {
    }
  }

  let lastStatus = '';
  function status(text) {
    if (text === lastStatus) return;
    lastStatus = text;
    post({ status: text });
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }


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
    }
    return rows;
  }

  function dropRollingPrefix(rows) {
    const out = [];
    rows.forEach(function (row) {
      const prev = out[out.length - 1];
      if (prev && row.text) {
        if (row.text === prev.text) {
          if (row.start - prev.end < 1.5) return;
        } else if (row.text.indexOf(prev.text) === 0) {
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

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    if (!e.data || e.data.source !== REQUEST) return;
    if (cached) post(cached);
  });


  function kindOf(url) {
    const u = String(url || '');
    if (u.indexOf('timedtext') !== -1) return 'youtube-timedtext';
    if (/youtubei\/v1\/player/.test(u)) return 'youtube';
    if (/\/x\/player\/(wbi\/)?v2/.test(u)) return 'bilibili';
    return '';
  }

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
      }
      return originalOpen.apply(this, arguments);
    };

    proto.send = function () {
      try {
        const kind = kindOf(this.__amberUrl);
        if (kind) {
          this.addEventListener('load', function () {
            if (kind === 'youtube-timedtext') {
              try {
                adoptRawBody(this.responseText, this.responseURL || this.__amberUrl);
              } catch (e) {
              }
              return;
            }
            try {
              dispatch(kind, JSON.parse(this.responseText), this.__amberUrl);
            } catch (e) {
            }
          });
        }
      } catch (e) {
      }
      return originalSend.apply(this, arguments);
    };

    proto.__amberWrapped = true;
  }


  wrapFetch();
  wrapXhr();

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

  setTimeout(function () {
    tryYouTube();
  }, 1500);
})();
