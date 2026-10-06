
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

export const ENGINE_LIST = [bing, microsoft, google, openai, mymemory, builtin];

export function getEngine(id) {
  return ENGINES[id] || bing;
}

export default ENGINES;
