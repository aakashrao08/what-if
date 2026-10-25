// Translation across the site. t(text) answers in three ways, in order:
//   1. the dictionary (src/i18n/dict.ts): the interface's own words, instant and offline
//   2. verified live translations already fetched (kept in this browser for next time)
//   3. the English, while the line is queued for the Narrator (live mode). Queued lines go out in
//      batches; every translation must carry exactly the numbers of its English source, checked by the
//      Verifier on the server and again here, before it replaces the English on screen.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { usePrefs } from './prefs';
import { DICT } from '../i18n/dict';
import { askAgents, LIVE } from '../agents/live';
import { factsFromText, verify } from '../agents/verifier';
import type { TranslateReply } from '../agents/contract';
import type { Lang } from '../agents/format';
import { hashSeed } from '../engine/rng';

interface I18n { lang: Lang; t: (text: string, vars?: Record<string, string>) => string }
const Ctx = createContext<I18n>({ lang: 'en', t: (s, v) => fill(s, v) });

/** What a line looks like on screen, and the language it is actually in (English until its translation arrives). */
export function useShown() {
  const { lang, t } = useContext(Ctx);
  return (text: string, already?: Lang): { text: string; lang: Lang } => {
    if (already === lang) return { text, lang };
    const out = t(text);
    return { text: out, lang: out === text ? (already ?? 'en') : lang };
  };
}

const fill = (s: string, vars?: Record<string, string>) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '') : s);
const storeKey = (lang: Lang) => `whatif.tr.v1.${lang}`;
const keyOf = (text: string) => `t${hashSeed(text).toString(36)}`;

function loadCache(lang: Lang): Map<string, string> {
  try { return new Map(Object.entries(JSON.parse(localStorage.getItem(storeKey(lang)) ?? '{}'))); } catch { return new Map(); }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const { prefs } = usePrefs();
  const lang = prefs.lang;
  const [version, setVersion] = useState(0);
  const cache = useRef<Map<string, string>>(new Map());
  const queued = useRef<Set<string>>(new Set());
  const tried = useRef<Set<string>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    cache.current = loadCache(lang);
    queued.current.clear(); tried.current.clear();
    document.documentElement.lang = lang;
    setVersion((v) => v + 1);
  }, [lang]);

  const flush = useCallback(async () => {
    timer.current = null;
    const batch = [...queued.current];
    queued.current.clear();
    // small batches side by side, so a long page fills in quickly (scripts like Tamil and Hindi run long)
    const chunks: string[][] = [];
    for (let i = 0; i < batch.length; i += 12) chunks.push(batch.slice(i, i + 12));
    const send = async (chunk: string[]) => {
      const reply = await askAgents<TranslateReply>('translate', { lang, items: chunk.map((text) => ({ key: keyOf(text), text })) }, 45000);
      if (!reply?.ok) return;
      let added = 0;
      for (const text of chunk) {
        const tr = reply.texts[keyOf(text)];
        // the browser checks it again: same numbers as the English, nothing else
        if (tr && !/https?:\/\/|www\.|<\/?[a-z]/i.test(tr) && verify(tr, factsFromText(text), lang).ok) { cache.current.set(text, tr); added++; }
      }
      if (added) {
        try { localStorage.setItem(storeKey(lang), JSON.stringify(Object.fromEntries(cache.current))); } catch { /* storage full or blocked */ }
        setVersion((v) => v + 1);
      }
    };
    for (let i = 0; i < chunks.length; i += 4) await Promise.all(chunks.slice(i, i + 4).map(send));
  }, [lang]);

  const t = useCallback((text: string, vars?: Record<string, string>) => {
    if (lang === 'en' || !text) return fill(text, vars);
    const dict = DICT[lang]?.get(text);
    if (dict) return fill(dict, vars);
    const filled = fill(text, vars);
    const hit = cache.current.get(filled);
    if (hit) return hit;
    if (LIVE && !tried.current.has(filled) && /[A-Za-z]{2}/.test(filled)) {
      tried.current.add(filled);
      queued.current.add(filled);
      if (!timer.current) timer.current = setTimeout(() => void flush(), 250);
    }
    return filled;
  }, [lang, flush, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const value = useMemo(() => ({ lang, t }), [lang, t]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);
export const useT = () => useContext(Ctx).t;
