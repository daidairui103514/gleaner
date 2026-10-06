/* 消息类型常量：content / background / popup 三方共用 */
(function (root) {
  'use strict';

  root.AmberMsg = {
    /* 内容脚本 -> 后台 */
    TRANSLATE: 'amber:translate',
    TRANSLATE_PAGE: 'amber:translate-page',
    PING: 'amber:ping',
    GET_SETTINGS: 'amber:get-settings',
    PATCH_SETTINGS: 'amber:patch-settings',
    GET_SITE_CONFIG: 'amber:get-site-config',
    SAVE_SITE_CONFIG: 'amber:save-site-config',
    CLEAR_CACHE: 'amber:clear-cache',
    CACHE_STATS: 'amber:cache-stats',
    OPEN_OPTIONS: 'amber:open-options',
    DETECT_LANG: 'amber:detect-lang',

    /* 后台 -> 内容脚本 */
    DO_TRANSLATE: 'amber:do-translate',
    DO_RESTORE: 'amber:do-restore',
    DO_SET_MODE: 'amber:do-set-mode',
    DO_TOGGLE: 'amber:do-toggle',
    DO_TOGGLE_FAB: 'amber:do-toggle-fab',
    DO_EXPORT: 'amber:do-export',
    DO_OCR: 'amber:do-ocr',
    DO_STATE_QUERY: 'amber:do-state-query',

    /* 配置变更广播 */
    SETTINGS_CHANGED: 'amber:settings-changed',

    /* 内容脚本内部广播 */
    STATE_CHANGED: 'amber:state-changed'
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
