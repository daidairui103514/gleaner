
export const DEFAULT_SETTINGS = {
  engine: 'bing',
  sourceLang: 'auto',
  targetLang: 'zh-Hans',
  displayMode: 'bilingual',
  theme: 'dark',
  accent: 'amber',

  auto: {
    byLang: false,
    langs: ['en', 'ja', 'ko', 'fr', 'de', 'ru'],
    always: [],
    never: []
  },

  style: {
    fontSize: 0,
    lineHeight: 1.6,
    colorMode: 'amber',
    color: '#FAC775',
    amberDark: '#FAC775',
    amberLight: '#9A5B06',
    opacity: 100,
    fontFamily: 'inherit',
    borderStyle: 'line',
    borderColor: '#BA7517',
    background: 'transparent',
    marginTop: 6,
    marginBottom: 14,
    paddingLeft: 10,
    maxWidth: 1600
  },

  engines: {
    bing: {},
    microsoft: {
      apiKey: '',
      region: ''
    },
    google: {},
    openai: {
      profiles: [
        {
          id: 'default',
          name: 'DeepSeek',
          baseUrl: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
          apiKey: '',
          temperature: 0.2,
          timeout: 60000
        }
      ],
      activeId: 'default'
    },
    builtin: {},
    mymemory: {}
  },

  fab: {
    enabled: true,
    right: 24,
    bottom: 24,
    opacity: 90
  },

  hover: { enabled: true, key: 'Control' },
  select: { enabled: true, mode: 'instant' },
  input: { enabled: true, trigger: 3, key: 'Space' },

  terms: [],
  promptLevel: 2,
  useContext: true,

  cache: { enabled: true, maxAgeDays: 30 },

  subtitle: {
    enabled: true,
    fontSize: 100,
    /* bilingual | translation | source */
    display: 'bilingual',
    blur: false,
    background: 'translucent',
    offset: 7,
    mode: 'auto'
  },
  pdf: { enabled: true },
  ocr: { enabled: true, overlay: true },

  concurrency: 6
};

export function mergeSettings(base, patch) {
  if (!patch || typeof patch !== 'object') return base;
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value && typeof value === 'object' && !Array.isArray(value) && base && typeof base[key] === 'object' && !Array.isArray(base[key])) {
      out[key] = mergeSettings(base[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export async function loadSettings() {
  const stored = await chrome.storage.local.get('settings');
  return migrate(mergeSettings(DEFAULT_SETTINGS, stored.settings || {}));
}

export function migrate(settings) {
  const engines = settings.engines || (settings.engines = {});
  const openai = engines.openai || (engines.openai = {});

  if (!Array.isArray(openai.profiles)) {
    openai.profiles = [
      {
        id: 'default',
        name: openai.model ? '大模型 · ' + openai.model : '默认大模型',
        baseUrl: openai.baseUrl || 'https://api.deepseek.com/v1',
        model: openai.model || 'deepseek-chat',
        apiKey: openai.apiKey || '',
        temperature: typeof openai.temperature === 'number' ? openai.temperature : 0.2,
        timeout: openai.timeout || 60000
      }
    ];
    openai.activeId = 'default';
  }

  openai.profiles.forEach(function (profile, index) {
    if (!profile.id) profile.id = 'p' + index + '_' + Date.now().toString(36);
    if (!profile.name) profile.name = '大模型 ' + (index + 1);
    if (!profile.baseUrl) profile.baseUrl = 'https://api.deepseek.com/v1';
    if (!profile.model) profile.model = 'deepseek-chat';
  });

  if (!openai.activeId && openai.profiles.length) openai.activeId = openai.profiles[0].id;

  /* 字号和宽度以前是百分比，现在改成像素，老数值要迁过来，否则会变成 100px 这种离谱的值 */
  const style = settings.style || (settings.style = {});
  if (typeof style.fontSize === 'number' && style.fontSize > 40) {
    style.fontSize = 0;
  }
  if (typeof style.maxWidth === 'number' && style.maxWidth > 0 && style.maxWidth <= 100) {
    style.maxWidth = 1600;
  }

  return settings;
}

export function newProfileId() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export async function saveSettings(patch) {
  const current = await loadSettings();
  const next = mergeSettings(current, patch);
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function loadSiteConfigs() {
  const stored = await chrome.storage.local.get('siteConfigs');
  return stored.siteConfigs || {};
}

export async function getSiteConfig(domain) {
  const all = await loadSiteConfigs();
  return all[domain] ? mergeSettings(DEFAULT_SETTINGS, all[domain]) : null;
}

export async function saveSiteConfig(domain, patch) {
  const all = await loadSiteConfigs();
  all[domain] = mergeSettings(mergeSettings(DEFAULT_SETTINGS, all[domain] || {}), patch);
  await chrome.storage.local.set({ siteConfigs: all });
  return all[domain];
}

export async function removeSiteConfig(domain) {
  const all = await loadSiteConfigs();
  delete all[domain];
  await chrome.storage.local.set({ siteConfigs: all });
}
