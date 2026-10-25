// Shared vocabulary for the agents: personas, languages, number formatting and names.

export type Persona = 'casual' | 'home' | 'away' | 'analyst'; // home = Northbridge fan, away = Harbour fan
export type Lang = 'en' | 'zh' | 'ms' | 'ta' | 'hi' | 'es' | 'pt';

export const LANGS: { id: Lang; label: string; native: string }[] = [
  { id: 'en', label: 'English', native: 'EN' },
  { id: 'zh', label: 'Chinese', native: '中文' },
  { id: 'ms', label: 'Malay', native: 'BM' },
  { id: 'ta', label: 'Tamil', native: 'தமிழ்' },
  { id: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { id: 'es', label: 'Spanish', native: 'ES' },
  { id: 'pt', label: 'Portuguese', native: 'PT' }
];

/** A number as the reader expects it: decimal comma in Spanish and Portuguese. */
export function num(v: number, digits = 0, lang: Lang = 'en'): string {
  const s = v.toFixed(digits);
  return lang === 'es' || lang === 'pt' ? s.replace('.', ',') : s;
}

export const int = (v: number) => Math.round(v);
export const signed = (v: number) => (v > 0 ? `+${Math.round(v)}` : v < 0 ? `−${Math.abs(Math.round(v))}` : '0');
export const thousands = (v: number) => v.toLocaleString('en-GB');

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
export const word = (n: number) => WORDS[n] ?? String(n);

/** How a pre-match style favourite label reads at a given win chance. */
export function favour(p: number, lang: Lang = 'en'): string {
  const band = p >= 70 ? 0 : p >= 55 ? 1 : p >= 40 ? 2 : p >= 25 ? 3 : 4;
  const T: Partial<Record<Lang, string[]>> = {
    en: ['clear favourites', 'favourites', 'roughly a coin flip', 'outsiders', 'long shots'],
    zh: ['明显的热门', '热门', '五五开', '冷门', '大冷门'],
    ms: ['pilihan jelas untuk menang', 'pilihan untuk menang', 'peluang hampir 50-50', 'bukan pilihan', 'peluang tipis']
  };
  return (T[lang] ?? T.en!)[band];
}

// Player and club names in other scripts, for the cast of the demo match.
const NAMES: Record<string, Partial<Record<Lang, string>>> = {
  Nettleshaw: { zh: '内特尔肖', ta: 'நெட்டில்ஷா', hi: 'नेटलशॉ' },
  Quillfeather: { zh: '奎尔费瑟', ta: 'குயில்ஃபெதர்', hi: 'क्विलफ़ेदर' },
  Gorseby: { zh: '戈尔斯比', ta: 'கோர்ஸ்பி', hi: 'गोर्सबी' },
  Sorrelwick: { zh: '索雷尔维克', ta: 'சோரல்விக்', hi: 'सॉरेलविक' },
  Bobbinford: { zh: '博宾福德', ta: 'பாபின்ஃபோர்ட்', hi: 'बॉबिनफ़ोर्ड' },
  Tallowby: { zh: '塔洛比', ta: 'டாலோபி', hi: 'टैलोबी' },
  Pennywhistle: { zh: '彭尼惠斯尔', ta: 'பென்னிவிசில்', hi: 'पेनीव्हिसल' },
  Marrowshaw: { zh: '马罗肖', ta: 'மாரோஷா', hi: 'मैरोशॉ' },
  Northbridge: { zh: '北桥', ta: 'நார்த்பிரிட்ஜ்', hi: 'नॉर्थब्रिज' },
  Harbour: { zh: '港口竞技', ta: 'ஹார்பர்', hi: 'हार्बर' }
};

export const nameIn = (name: string, lang: Lang) => NAMES[name]?.[lang] ?? name;
