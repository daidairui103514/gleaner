"""由微软官方语言表生成 common/languages.js。"""
import json
import os
import sys

sys.stdout.reconfigure(encoding="utf-8")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "lib", "_langs_raw.json")
OUT = os.path.join(ROOT, "common", "languages.js")

ZH = {
    "af": "南非荷兰语", "am": "阿姆哈拉语", "ar": "阿拉伯语", "as": "阿萨姆语", "az": "阿塞拜疆语",
    "ba": "巴什基尔语", "be": "白俄罗斯语", "bg": "保加利亚语", "bho": "博杰普尔语", "bn": "孟加拉语",
    "bo": "藏语", "brx": "博多语", "bs": "波斯尼亚语", "ca": "加泰罗尼亚语", "cs": "捷克语",
    "cy": "威尔士语", "da": "丹麦语", "de": "德语", "doi": "多格拉语", "dsb": "下索布语",
    "dv": "迪维希语", "el": "希腊语", "en": "英语", "es": "西班牙语", "es-MX": "西班牙语（墨西哥）",
    "et": "爱沙尼亚语", "eu": "巴斯克语", "fa": "波斯语", "fi": "芬兰语", "fil": "菲律宾语",
    "fj": "斐济语", "fo": "法罗语", "fr": "法语", "fr-CA": "法语（加拿大）", "ga": "爱尔兰语",
    "gl": "加利西亚语", "gom": "孔卡尼语", "gu": "古吉拉特语", "ha": "豪萨语", "he": "希伯来语",
    "hi": "印地语", "hne": "恰蒂斯加尔语", "hr": "克罗地亚语", "hsb": "上索布语", "ht": "海地克里奥尔语",
    "hu": "匈牙利语", "hy": "亚美尼亚语", "id": "印尼语", "ig": "伊博语", "ikt": "因纽特语（西部加拿大）",
    "is": "冰岛语", "it": "意大利语", "iu": "因纽特语", "iu-Latn": "因纽特语（拉丁）", "ja": "日语",
    "ka": "格鲁吉亚语", "kk": "哈萨克语", "km": "高棉语", "kmr": "北库尔德语", "kn": "卡纳达语",
    "ko": "韩语", "ks": "克什米尔语", "ku": "库尔德语（中部）", "ky": "吉尔吉斯语", "lb": "卢森堡语",
    "ln": "林加拉语", "lo": "老挝语", "lt": "立陶宛语", "lug": "卢干达语", "lv": "拉脱维亚语",
    "lzh": "文言文", "mai": "迈蒂利语", "mg": "马尔加什语", "mi": "毛利语", "mk": "马其顿语",
    "ml": "马拉雅拉姆语", "mn-Cyrl": "蒙古语（西里尔）", "mn-Mong": "蒙古语（传统）", "mni": "曼尼普尔语",
    "mr": "马拉地语", "ms": "马来语", "mt": "马耳他语", "mww": "白苗语", "my": "缅甸语",
    "nb": "挪威语", "ne": "尼泊尔语", "nl": "荷兰语", "nso": "北索托语", "nya": "齐切瓦语",
    "or": "奥里亚语", "otq": "克雷塔罗奥托米语", "pa": "旁遮普语", "pl": "波兰语", "prs": "达里语",
    "ps": "普什图语", "pt": "葡萄牙语", "pt-PT": "葡萄牙语（葡萄牙）", "ro": "罗马尼亚语", "ru": "俄语",
    "run": "基隆迪语", "rw": "卢旺达语", "sd": "信德语", "si": "僧伽罗语", "sk": "斯洛伐克语",
    "sl": "斯洛文尼亚语", "sm": "萨摩亚语", "sn": "绍纳语", "so": "索马里语", "sq": "阿尔巴尼亚语",
    "sr-Cyrl": "塞尔维亚语（西里尔）", "sr-Latn": "塞尔维亚语（拉丁）", "st": "塞索托语", "sv": "瑞典语",
    "sw": "斯瓦希里语", "ta": "泰米尔语", "te": "泰卢固语", "th": "泰语", "ti": "提格里尼亚语",
    "tk": "土库曼语", "tlh-Latn": "克林贡语（拉丁）", "tlh-Piqd": "克林贡语（克林贡文）", "tn": "茨瓦纳语",
    "to": "汤加语", "tr": "土耳其语", "tt": "鞑靼语", "ty": "塔希提语", "ug": "维吾尔语",
    "uk": "乌克兰语", "ur": "乌尔都语", "uz": "乌兹别克语", "vi": "越南语", "xh": "科萨语",
    "yo": "约鲁巴语", "yua": "尤卡坦玛雅语", "yue": "粤语", "zh-Hans": "中文（简体）",
    "zh-Hant": "中文（繁体）", "zu": "祖鲁语",
}

POPULAR = ["zh-Hans", "en", "ja", "ko", "fr", "de", "es", "ru", "pt", "it", "ar", "zh-Hant"]


def js_str(value):
    return json.dumps(value, ensure_ascii=False)


def main():
    data = json.load(open(RAW, encoding="utf-8"))["translation"]
    missing = [c for c in data if c not in ZH]
    if missing:
        print("警告：缺少中文名 ->", missing)

    popular = [c for c in POPULAR if c in data]
    rest = sorted(
        [c for c in data if c not in popular],
        key=lambda c: data[c]["name"].lower(),
    )

    items = []
    for code in popular + rest:
        info = data[code]
        items.append(
            "  { code: %s, zh: %s, en: %s, native: %s }"
            % (
                js_str(code),
                js_str(ZH.get(code, info["name"])),
                js_str(info["name"]),
                js_str(info.get("nativeName", info["name"])),
            )
        )

    lines = [
        "/* 由 lib/gen_langs.py 生成，请勿手工编辑。数据源：微软翻译官方语言表 */",
        "(function (root) {",
        "  'use strict';",
        "",
        "  var SOURCE_AUTO = { code: 'auto', zh: '自动检测', en: 'Auto detect', native: '自动检测' };",
        "",
        "  var RAW = [",
        ",\n".join(items),
        "  ];",
        "",
        "  var POPULAR_CODES = %s;" % js_str(popular),
        "",
        "  var LIST = RAW.map(function (item) {",
        "    item.popular = POPULAR_CODES.indexOf(item.code) !== -1;",
        "    item.label = item.zh + ' · ' + item.code;",
        "    return item;",
        "  });",
        "",
        "  var MAP = {};",
        "  LIST.forEach(function (item) { MAP[item.code.toLowerCase()] = item; });",
        "  MAP.auto = SOURCE_AUTO;",
        "",
        "  function normalize(code) {",
        "    if (!code) return null;",
        "    var key = String(code).toLowerCase();",
        "    if (MAP[key]) return MAP[key];",
        "    var base = key.split('-')[0];",
        "    if (MAP[base]) return MAP[base];",
        "    if (base === 'zh') return MAP['zh-hans'];",
        "    if (base === 'iw') return MAP['he'];",
        "    if (base === 'in') return MAP['id'];",
        "    return null;",
        "  }",
        "",
        "  function label(code) {",
        "    var item = normalize(code);",
        "    return item ? item.zh : code;",
        "  }",
        "",
        "  root.AmberLangs = {",
        "    list: LIST,",
        "    map: MAP,",
        "    auto: SOURCE_AUTO,",
        "    popular: POPULAR_CODES,",
        "    normalize: normalize,",
        "    label: label,",
        "    /** 源语言下拉：自动检测在最前 */",
        "    sourceOptions: function () { return [SOURCE_AUTO].concat(LIST); },",
        "  };",
        "})(typeof globalThis !== 'undefined' ? globalThis : this);",
        "",
    ]

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(lines))
    print("生成 %s，共 %d 种语言（常用置顶 %d 种）" % (OUT, len(items), len(popular)))


if __name__ == "__main__":
    main()
