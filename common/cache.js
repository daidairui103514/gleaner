/* 翻译结果缓存（IndexedDB），按「引擎 + 语言对 + 原文哈希」存取 */

const DB_NAME = 'amber-translate';
const DB_VERSION = 1;
const STORE = 'translations';

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(function (resolve, reject) {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function () {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'k' });
        store.createIndex('t', 't');
      }
    };
    req.onsuccess = function () {
      resolve(req.result);
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
  return dbPromise;
}

function tx(mode, fn) {
  return openDB().then(function (db) {
    return new Promise(function (resolve, reject) {
      const transaction = db.transaction(STORE, mode);
      const store = transaction.objectStore(STORE);
      let result;
      try {
        result = fn(store);
      } catch (e) {
        reject(e);
        return;
      }
      transaction.oncomplete = function () {
        resolve(result && result.__req ? result.__req.result : result);
      };
      transaction.onerror = function () {
        reject(transaction.error);
      };
      transaction.onabort = function () {
        reject(transaction.error);
      };
    });
  });
}

export function cacheKey(engine, from, to, text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return engine + '|' + from + '|' + to + '|' + text.length + '|' + h.toString(36);
}

export async function getMany(keys) {
  if (!keys.length) return {};
  const db = await openDB();
  const out = {};
  const chunkSize = 200;
  for (let i = 0; i < keys.length; i += chunkSize) {
    const slice = keys.slice(i, i + chunkSize);
    await new Promise(function (resolve, reject) {
      const transaction = db.transaction(STORE, 'readonly');
      const store = transaction.objectStore(STORE);
      slice.forEach(function (key) {
        const req = store.get(key);
        req.onsuccess = function () {
          if (req.result && typeof req.result.v === 'string') out[key] = req.result.v;
        };
      });
      transaction.oncomplete = resolve;
      transaction.onerror = function () {
        reject(transaction.error);
      };
    });
  }
  return out;
}

export async function setMany(entries) {
  if (!entries.length) return;
  const db = await openDB();
  const now = Date.now();
  const chunkSize = 200;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const slice = entries.slice(i, i + chunkSize);
    await new Promise(function (resolve, reject) {
      const transaction = db.transaction(STORE, 'readwrite');
      const store = transaction.objectStore(STORE);
      slice.forEach(function (entry) {
        store.put({ k: entry.k, v: entry.v, t: now, e: entry.e, f: entry.f, to: entry.to });
      });
      transaction.oncomplete = resolve;
      transaction.onerror = function () {
        reject(transaction.error);
      };
    });
  }
}

export async function clearAll() {
  await tx('readwrite', function (store) {
    return store.clear();
  });
  return true;
}

export async function prune(maxAgeDays) {
  const maxAge = (maxAgeDays || 30) * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - maxAge;
  const db = await openDB();
  let removed = 0;
  await new Promise(function (resolve, reject) {
    const transaction = db.transaction(STORE, 'readwrite');
    const index = transaction.objectStore(STORE).index('t');
    const req = index.openCursor(IDBKeyRange.upperBound(cutoff));
    req.onsuccess = function () {
      const cursor = req.result;
      if (cursor) {
        cursor.delete();
        removed++;
        cursor.continue();
      }
    };
    transaction.oncomplete = resolve;
    transaction.onerror = function () {
      reject(transaction.error);
    };
  });
  return removed;
}

export async function stats() {
  const db = await openDB();
  return new Promise(function (resolve, reject) {
    const transaction = db.transaction(STORE, 'readonly');
    const req = transaction.objectStore(STORE).count();
    req.onsuccess = function () {
      resolve({ count: req.result });
    };
    req.onerror = function () {
      reject(req.error);
    };
  });
}
