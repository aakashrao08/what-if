// The Verifier: a football expert with a calculator.
// 1. Every number in a draft must trace back to the facts the engine produced.
// 2. A rulebook catches claims the numbers don't support (superlatives, certainty, red cards...).
// It runs on every piece of text, whether a template or a live model wrote it.

import type { Lang } from './format';

export type Facts = Record<string, number | string | boolean | undefined>;

export interface Issue { kind: 'number' | 'claim'; detail: string }
export interface Verdict { ok: boolean; checked: number; issues: Issue[] }

/** Numbers that read naturally without being data: "1 in 14", "three-pass", "90 minutes". */
const ALWAYS_OK = new Set([1, 2, 3, 90, 100]);

function extractNumbers(text: string, lang: Lang): number[] {
  // drop thousands separators first ("10,000" / "10.000"), then read decimals in the reader's convention
  const decimalComma = lang === 'es' || lang === 'pt';
  // thousands groups written with a space ("10 000", common in Spanish and Portuguese) become one number
  const spaced = text.replace(/\b\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?![\d.,])/g, (m) => m.replace(/[ \u00a0\u202f]/g, ''));
  const cleaned = spaced.replace(/\d{1,3}(?:[.,]\d{3})+(?!\d)/g, (m) => {
    const parts = m.split(/[.,]/);
    const looksDecimal = parts.length === 2 && ((decimalComma && m.includes(',')) || (!decimalComma && m.includes('.')));
    return looksDecimal ? m : m.replace(/[.,]/g, '');
  });
  // in es/pt a comma is the decimal mark, but writers (and models) often keep a point: with one or two
  // digits after it, either can only be a decimal (thousands groups were folded away above)
  const re = decimalComma ? /\d+(?:[.,]\d{1,2}(?!\d))?/g : /\d+(?:\.\d+)?/g;
  return (cleaned.match(re) ?? []).map((s) => Number(s.replace(',', '.')));
}

function factNumbers(facts: Facts): number[] {
  const out: number[] = [];
  for (const v of Object.values(facts)) {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(Math.abs(v));
    if (typeof v === 'string') for (const n of extractNumbers(v, 'en')) out.push(n);
  }
  return out;
}

function matches(n: number, pool: number[]): boolean {
  return pool.some((f) => Math.abs(f - n) < 1e-6 || Math.abs(Math.round(f) - n) < 1e-6 || Math.abs(Math.round(f * 10) / 10 - n) < 1e-6 || Math.abs(Math.round(f * 100) / 100 - n) < 1e-6);
}

const NEGATED = /\b(not|n[’']t|too (few|small|early|soon)|cannot|can[’']t|no way|isn[’']t)\b[^.]{0,40}$/i;

interface Rule { id: string; pattern: RegExp; allowed: (f: Facts) => boolean; message: string }

const RULES: Rule[] = [
  {
    id: 'superlative', pattern: /\b(the best|the worst|the greatest|best in the league|最好|最佳)\b/gi,
    allowed: (f) => f.clearlyBest === true,
    message: 'calls someone the best, but the sample can’t separate them from the rest'
  },
  {
    id: 'certainty', pattern: /\b(certain|certainly|definitely|guaranteed|always|sure thing|no doubt)\b/gi,
    allowed: (f) => f.certain === true,
    message: 'sounds certain about something the simulations put below 95%'
  },
  {
    id: 'red-card', pattern: /\b(should have been (a )?red|clear red|straight red)\b/gi,
    allowed: (f) => typeof f.redCard === 'number' && f.redCard >= 50,
    message: 'says it should have been a red card, but the red-card test is under 50%'
  },
  {
    id: 'decided', pattern: /\b(cost them the (match|game)|the reason they lost|won them the (match|game))\b/gi,
    allowed: (f) => f.decisive === true,
    message: 'says one moment decided the match without a big enough effect to back it'
  },
  {
    // only facts that carry ranges set rangesOverlap; where it is true the two chances can't be told apart
    id: 'comparison', pattern: /\b(more likely|less likely|likelier|better chance|better shot|worse chance|worse shot)\b/gi,
    allowed: (f) => f.rangesOverlap !== true,
    message: 'compares two chances whose 95% ranges overlap, so the simulations can’t tell them apart'
  }
];

/** Every number in a piece of English text, as facts: a translation of it may contain only these. */
export function factsFromText(text: string): Facts {
  return Object.fromEntries(extractNumbers(text, 'en').map((n, i) => [`n${i}`, n]));
}

export function verify(text: string, facts: Facts, lang: Lang = 'en'): Verdict {
  const issues: Issue[] = [];
  const pool = factNumbers(facts);
  const nums = extractNumbers(text, lang);
  for (const n of nums) {
    if (ALWAYS_OK.has(n) || matches(n, pool)) continue;
    issues.push({ kind: 'number', detail: `${n} isn’t in the simulation output` });
  }
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = rule.pattern.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 40), m.index);
      if (NEGATED.test(before)) continue;
      if (!rule.allowed(facts)) issues.push({ kind: 'claim', detail: `“${m[0]}” ${rule.message}` });
    }
  }
  // football sense: probabilities live between 0 and 100
  for (const pm of text.matchAll(/(\d+(?:[.,]\d+)?)\s?%/g)) {
    if (Number(pm[1].replace(',', '.')) > 100) issues.push({ kind: 'number', detail: `${pm[1]}% is not a probability` });
  }
  return { ok: issues.length === 0, checked: nums.length, issues };
}
