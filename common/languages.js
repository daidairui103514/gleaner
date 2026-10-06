/* 由 lib/gen_langs.py 生成，请勿手工编辑。数据源：微软翻译官方语言表 */
(function (root) {
  'use strict';

  var SOURCE_AUTO = { code: 'auto', zh: '自动检测', en: 'Auto detect', native: '自动检测' };

  var RAW = [
  { code: "zh-Hans", zh: "中文（简体）", en: "Chinese Simplified", native: "中文 (简体)" },
  { code: "en", zh: "英语", en: "English", native: "English" },
  { code: "ja", zh: "日语", en: "Japanese", native: "日本語" },
  { code: "ko", zh: "韩语", en: "Korean", native: "한국어" },
  { code: "fr", zh: "法语", en: "French", native: "Français" },
  { code: "de", zh: "德语", en: "German", native: "Deutsch" },
  { code: "es", zh: "西班牙语", en: "Spanish", native: "Español" },
  { code: "ru", zh: "俄语", en: "Russian", native: "Русский" },
  { code: "pt", zh: "葡萄牙语", en: "Portuguese (Brazil)", native: "Português (Brasil)" },
  { code: "it", zh: "意大利语", en: "Italian", native: "Italiano" },
  { code: "ar", zh: "阿拉伯语", en: "Arabic", native: "العربية" },
  { code: "zh-Hant", zh: "中文（繁体）", en: "Chinese Traditional", native: "繁體中文 (繁體)" },
  { code: "af", zh: "南非荷兰语", en: "Afrikaans", native: "Afrikaans" },
  { code: "sq", zh: "阿尔巴尼亚语", en: "Albanian", native: "Shqip" },
  { code: "am", zh: "阿姆哈拉语", en: "Amharic", native: "አማርኛ" },
  { code: "hy", zh: "亚美尼亚语", en: "Armenian", native: "Հայերեն" },
  { code: "as", zh: "阿萨姆语", en: "Assamese", native: "অসমীয়া" },
  { code: "az", zh: "阿塞拜疆语", en: "Azerbaijani", native: "Azərbaycan" },
  { code: "bn", zh: "孟加拉语", en: "Bangla", native: "বাংলা" },
  { code: "ba", zh: "巴什基尔语", en: "Bashkir", native: "Bashkir" },
  { code: "eu", zh: "巴斯克语", en: "Basque", native: "Euskara" },
  { code: "be", zh: "白俄罗斯语", en: "Belarusian", native: "беларуская" },
  { code: "bho", zh: "博杰普尔语", en: "Bhojpuri", native: "भोजपुरी" },
  { code: "brx", zh: "博多语", en: "Bodo", native: "बड़ो" },
  { code: "bs", zh: "波斯尼亚语", en: "Bosnian", native: "Bosanski" },
  { code: "bg", zh: "保加利亚语", en: "Bulgarian", native: "Български" },
  { code: "yue", zh: "粤语", en: "Cantonese (Traditional)", native: "粵語 (繁體)" },
  { code: "ca", zh: "加泰罗尼亚语", en: "Catalan", native: "Català" },
  { code: "hne", zh: "恰蒂斯加尔语", en: "Chhattisgarhi", native: "छत्तीसगढ़ी" },
  { code: "lzh", zh: "文言文", en: "Chinese (Literary)", native: "中文 (文言文)" },
  { code: "hr", zh: "克罗地亚语", en: "Croatian", native: "Hrvatski" },
  { code: "cs", zh: "捷克语", en: "Czech", native: "Čeština" },
  { code: "da", zh: "丹麦语", en: "Danish", native: "Dansk" },
  { code: "prs", zh: "达里语", en: "Dari", native: "دری" },
  { code: "dv", zh: "迪维希语", en: "Divehi", native: "ދިވެހިބަސް" },
  { code: "doi", zh: "多格拉语", en: "Dogri", native: "डोगरी" },
  { code: "nl", zh: "荷兰语", en: "Dutch", native: "Nederlands" },
  { code: "et", zh: "爱沙尼亚语", en: "Estonian", native: "Eesti" },
  { code: "fo", zh: "法罗语", en: "Faroese", native: "Føroyskt" },
  { code: "fj", zh: "斐济语", en: "Fijian", native: "Na Vosa Vakaviti" },
  { code: "fil", zh: "菲律宾语", en: "Filipino", native: "Filipino" },
  { code: "fi", zh: "芬兰语", en: "Finnish", native: "Suomi" },
  { code: "fr-CA", zh: "法语（加拿大）", en: "French (Canada)", native: "Français (Canada)" },
  { code: "gl", zh: "加利西亚语", en: "Galician", native: "Galego" },
  { code: "lug", zh: "卢干达语", en: "Ganda", native: "Ganda" },
  { code: "ka", zh: "格鲁吉亚语", en: "Georgian", native: "ქართული" },
  { code: "el", zh: "希腊语", en: "Greek", native: "Ελληνικά" },
  { code: "gu", zh: "古吉拉特语", en: "Gujarati", native: "ગુજરાતી" },
  { code: "ht", zh: "海地克里奥尔语", en: "Haitian Creole", native: "Haitian Creole" },
  { code: "ha", zh: "豪萨语", en: "Hausa", native: "Hausa" },
  { code: "he", zh: "希伯来语", en: "Hebrew", native: "עברית" },
  { code: "hi", zh: "印地语", en: "Hindi", native: "हिन्दी" },
  { code: "mww", zh: "白苗语", en: "Hmong Daw", native: "Hmong Daw" },
  { code: "hu", zh: "匈牙利语", en: "Hungarian", native: "Magyar" },
  { code: "is", zh: "冰岛语", en: "Icelandic", native: "Íslenska" },
  { code: "ig", zh: "伊博语", en: "Igbo", native: "Ásụ̀sụ́ Ìgbò" },
  { code: "id", zh: "印尼语", en: "Indonesian", native: "Indonesia" },
  { code: "ikt", zh: "因纽特语（西部加拿大）", en: "Inuinnaqtun", native: "Inuinnaqtun" },
  { code: "iu", zh: "因纽特语", en: "Inuktitut", native: "ᐃᓄᒃᑎᑐᑦ" },
  { code: "iu-Latn", zh: "因纽特语（拉丁）", en: "Inuktitut (Latin)", native: "Inuktitut (Latin)" },
  { code: "ga", zh: "爱尔兰语", en: "Irish", native: "Gaeilge" },
  { code: "kn", zh: "卡纳达语", en: "Kannada", native: "ಕನ್ನಡ" },
  { code: "ks", zh: "克什米尔语", en: "Kashmiri", native: "کٲشُر" },
  { code: "kk", zh: "哈萨克语", en: "Kazakh", native: "Қазақ Тілі" },
  { code: "km", zh: "高棉语", en: "Khmer", native: "ខ្មែរ" },
  { code: "rw", zh: "卢旺达语", en: "Kinyarwanda", native: "Kinyarwanda" },
  { code: "tlh-Latn", zh: "克林贡语（拉丁）", en: "Klingon (Latin)", native: "Klingon (Latin)" },
  { code: "tlh-Piqd", zh: "克林贡语（克林贡文）", en: "Klingon (pIqaD)", native: "Klingon (pIqaD)" },
  { code: "gom", zh: "孔卡尼语", en: "Konkani", native: "कोंकणी" },
  { code: "ku", zh: "库尔德语（中部）", en: "Kurdish (Central)", native: "Kurdî (Navîn)" },
  { code: "kmr", zh: "北库尔德语", en: "Kurdish (Northern)", native: "Kurdî (Bakur)" },
  { code: "ky", zh: "吉尔吉斯语", en: "Kyrgyz", native: "Кыргызча" },
  { code: "lo", zh: "老挝语", en: "Lao", native: "ລາວ" },
  { code: "lv", zh: "拉脱维亚语", en: "Latvian", native: "Latviešu" },
  { code: "ln", zh: "林加拉语", en: "Lingala", native: "Lingála" },
  { code: "lt", zh: "立陶宛语", en: "Lithuanian", native: "Lietuvių" },
  { code: "dsb", zh: "下索布语", en: "Lower Sorbian", native: "Dolnoserbšćina" },
  { code: "lb", zh: "卢森堡语", en: "Luxembourgish", native: "Lëtzebuergesch" },
  { code: "mk", zh: "马其顿语", en: "Macedonian", native: "Македонски" },
  { code: "mai", zh: "迈蒂利语", en: "Maithili", native: "मैथिली" },
  { code: "mg", zh: "马尔加什语", en: "Malagasy", native: "Malagasy" },
  { code: "ms", zh: "马来语", en: "Malay", native: "Melayu" },
  { code: "ml", zh: "马拉雅拉姆语", en: "Malayalam", native: "മലയാളം" },
  { code: "mt", zh: "马耳他语", en: "Maltese", native: "Malti" },
  { code: "mni", zh: "曼尼普尔语", en: "Manipuri", native: "ꯃꯩꯇꯩꯂꯣꯟ" },
  { code: "mr", zh: "马拉地语", en: "Marathi", native: "मराठी" },
  { code: "mn-Cyrl", zh: "蒙古语（西里尔）", en: "Mongolian (Cyrillic)", native: "Монгол" },
  { code: "mn-Mong", zh: "蒙古语（传统）", en: "Mongolian (Traditional)", native: "ᠮᠣᠩᠭᠣᠯ ᠬᠡᠯᠡ" },
  { code: "my", zh: "缅甸语", en: "Myanmar (Burmese)", native: "မြန်မာ" },
  { code: "mi", zh: "毛利语", en: "Māori", native: "Te Reo Māori" },
  { code: "ne", zh: "尼泊尔语", en: "Nepali", native: "नेपाली" },
  { code: "nb", zh: "挪威语", en: "Norwegian", native: "Norsk Bokmål" },
  { code: "nya", zh: "齐切瓦语", en: "Nyanja", native: "Nyanja" },
  { code: "or", zh: "奥里亚语", en: "Odia", native: "ଓଡ଼ିଆ" },
  { code: "ps", zh: "普什图语", en: "Pashto", native: "پښتو" },
  { code: "fa", zh: "波斯语", en: "Persian", native: "فارسی" },
  { code: "pl", zh: "波兰语", en: "Polish", native: "Polski" },
  { code: "pt-PT", zh: "葡萄牙语（葡萄牙）", en: "Portuguese (Portugal)", native: "Português (Portugal)" },
  { code: "pa", zh: "旁遮普语", en: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "otq", zh: "克雷塔罗奥托米语", en: "Querétaro Otomi", native: "Hñähñu" },
  { code: "ro", zh: "罗马尼亚语", en: "Romanian", native: "Română" },
  { code: "run", zh: "基隆迪语", en: "Rundi", native: "Rundi" },
  { code: "sm", zh: "萨摩亚语", en: "Samoan", native: "Gagana Sāmoa" },
  { code: "sr-Cyrl", zh: "塞尔维亚语（西里尔）", en: "Serbian (Cyrillic)", native: "Српски (ћирилица)" },
  { code: "sr-Latn", zh: "塞尔维亚语（拉丁）", en: "Serbian (Latin)", native: "Srpski (latinica)" },
  { code: "st", zh: "塞索托语", en: "Sesotho", native: "Sesotho" },
  { code: "nso", zh: "北索托语", en: "Sesotho sa Leboa", native: "Sesotho sa Leboa" },
  { code: "tn", zh: "茨瓦纳语", en: "Setswana", native: "Setswana" },
  { code: "sn", zh: "绍纳语", en: "Shona", native: "chiShona" },
  { code: "sd", zh: "信德语", en: "Sindhi", native: "سنڌي" },
  { code: "si", zh: "僧伽罗语", en: "Sinhala", native: "සිංහල" },
  { code: "sk", zh: "斯洛伐克语", en: "Slovak", native: "Slovenčina" },
  { code: "sl", zh: "斯洛文尼亚语", en: "Slovenian", native: "Slovenščina" },
  { code: "so", zh: "索马里语", en: "Somali", native: "Soomaali" },
  { code: "es-MX", zh: "西班牙语（墨西哥）", en: "Spanish (Mexico)", native: "Español (México)" },
  { code: "sw", zh: "斯瓦希里语", en: "Swahili", native: "Kiswahili" },
  { code: "sv", zh: "瑞典语", en: "Swedish", native: "Svenska" },
  { code: "ty", zh: "塔希提语", en: "Tahitian", native: "Reo Tahiti" },
  { code: "ta", zh: "泰米尔语", en: "Tamil", native: "தமிழ்" },
  { code: "tt", zh: "鞑靼语", en: "Tatar", native: "Татар" },
  { code: "te", zh: "泰卢固语", en: "Telugu", native: "తెలుగు" },
  { code: "th", zh: "泰语", en: "Thai", native: "ไทย" },
  { code: "bo", zh: "藏语", en: "Tibetan", native: "བོད་སྐད་" },
  { code: "ti", zh: "提格里尼亚语", en: "Tigrinya", native: "ትግር" },
  { code: "to", zh: "汤加语", en: "Tongan", native: "Lea Fakatonga" },
  { code: "tr", zh: "土耳其语", en: "Turkish", native: "Türkçe" },
  { code: "tk", zh: "土库曼语", en: "Turkmen", native: "Türkmen Dili" },
  { code: "uk", zh: "乌克兰语", en: "Ukrainian", native: "Українська" },
  { code: "hsb", zh: "上索布语", en: "Upper Sorbian", native: "Hornjoserbšćina" },
  { code: "ur", zh: "乌尔都语", en: "Urdu", native: "اردو" },
  { code: "ug", zh: "维吾尔语", en: "Uyghur", native: "ئۇيغۇرچە" },
  { code: "uz", zh: "乌兹别克语", en: "Uzbek (Latin)", native: "O‘Zbek" },
  { code: "vi", zh: "越南语", en: "Vietnamese", native: "Tiếng Việt" },
  { code: "cy", zh: "威尔士语", en: "Welsh", native: "Cymraeg" },
  { code: "xh", zh: "科萨语", en: "Xhosa", native: "isiXhosa" },
  { code: "yo", zh: "约鲁巴语", en: "Yoruba", native: "Èdè Yorùbá" },
  { code: "yua", zh: "尤卡坦玛雅语", en: "Yucatec Maya", native: "Yucatec Maya" },
  { code: "zu", zh: "祖鲁语", en: "Zulu", native: "Isi-Zulu" }
  ];

  var POPULAR_CODES = ["zh-Hans", "en", "ja", "ko", "fr", "de", "es", "ru", "pt", "it", "ar", "zh-Hant"];

  var LIST = RAW.map(function (item) {
    item.popular = POPULAR_CODES.indexOf(item.code) !== -1;
    item.label = item.zh + ' · ' + item.code;
    return item;
  });

  var MAP = {};
  LIST.forEach(function (item) { MAP[item.code.toLowerCase()] = item; });
  MAP.auto = SOURCE_AUTO;

  function normalize(code) {
    if (!code) return null;
    var key = String(code).toLowerCase();
    if (MAP[key]) return MAP[key];
    var base = key.split('-')[0];
    if (MAP[base]) return MAP[base];
    if (base === 'zh') return MAP['zh-hans'];
    if (base === 'iw') return MAP['he'];
    if (base === 'in') return MAP['id'];
    return null;
  }

  function label(code) {
    var item = normalize(code);
    return item ? item.zh : code;
  }

  root.AmberLangs = {
    list: LIST,
    map: MAP,
    auto: SOURCE_AUTO,
    popular: POPULAR_CODES,
    normalize: normalize,
    label: label,
    /** 源语言下拉：自动检测在最前 */
    sourceOptions: function () { return [SOURCE_AUTO].concat(LIST); },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
