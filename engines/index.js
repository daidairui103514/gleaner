/* 引擎注册表：统一对外提供 id -> 引擎实现 的映射 */

import bing from './bing.js';
import microsoft from './microsoft.js';
import google from './google.js';
import openai from './openai.js';
import builtin from './builtin.js';
import mymemory from './mymemory.js';

export const ENGINES = {
  bing: bing,
  microsoft: microsoft,
  google: google,
  openai: openai,
  builtin: builtin,
  mymemory: mymemory
};

/** 展示顺序：免配置的在前，需要配置的在后 */
export const ENGINE_LIST = [bing, microsoft, google, openai, mymemory, builtin];

export function getEngine(id) {
  return ENGINES[id] || bing;
}

export default ENGINES;
