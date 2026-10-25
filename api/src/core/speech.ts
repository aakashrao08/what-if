// Azure AI Speech: the site's voice and ears. The key stays on the server.
//   speak(text, lang)  -> MP3, read by a neural voice in the reader's language (cached per line)
//   hear(wav, lang)    -> the words, from a short recording (16 kHz mono PCM WAV)

import type { Lang } from '../../../src/agents/format';
import { LruCache, cacheKey } from './guard';

export interface SpeechConfig { key: string; region: string }

export function speechConfig(env: Record<string, string | undefined> = process.env): SpeechConfig | null {
  const key = env.SPEECH_KEY?.trim(), region = env.SPEECH_REGION?.trim();
  return key && region && /^[a-z0-9]+$/.test(region) ? { key, region } : null;
}

/** One voice per language, chosen to sound like a broadcaster rather than an assistant. */
export const VOICES: Record<Lang, { voice: string; locale: string }> = {
  en: { voice: 'en-GB-RyanNeural', locale: 'en-GB' },
  zh: { voice: 'zh-CN-YunxiNeural', locale: 'zh-CN' },
  ms: { voice: 'ms-MY-OsmanNeural', locale: 'ms-MY' },
  ta: { voice: 'ta-IN-ValluvarNeural', locale: 'ta-IN' },
  hi: { voice: 'hi-IN-MadhurNeural', locale: 'hi-IN' },
  es: { voice: 'es-ES-AlvaroNeural', locale: 'es-ES' },
  pt: { voice: 'pt-BR-AntonioNeural', locale: 'pt-BR' }
};

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function ssml(text: string, lang: Lang, rate = '+4%'): string {
  const v = VOICES[lang];
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${v.locale}"><voice name="${v.voice}"><prosody rate="${rate}">${xml(text)}</prosody></voice></speak>`;
}

type Fetch = typeof fetch;
const clips = new LruCache<Uint8Array>(400);

export async function speak(cfg: SpeechConfig, text: string, lang: Lang, f: Fetch = fetch): Promise<Uint8Array> {
  const key = cacheKey('tts', lang, text);
  const hit = clips.get(key);
  if (hit) return hit;
  const res = await f(`https://${cfg.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': cfg.key, 'Content-Type': 'application/ssml+xml', 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3', 'User-Agent': 'whatif' },
    body: ssml(text, lang)
  });
  if (!res.ok) throw new Error(`speech ${res.status}`);
  const audio = new Uint8Array(await res.arrayBuffer());
  clips.set(key, audio);
  return audio;
}

export async function hear(cfg: SpeechConfig, wav: Uint8Array, lang: Lang, f: Fetch = fetch): Promise<string> {
  const res = await f(`https://${cfg.region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${VOICES[lang].locale}&format=simple&profanity=masked`, {
    method: 'POST',
    headers: { 'Ocp-Apim-Subscription-Key': cfg.key, 'Content-Type': 'audio/wav; codecs=audio/pcm; samplerate=16000', Accept: 'application/json' },
    body: wav
  });
  if (!res.ok) throw new Error(`speech ${res.status}`);
  const r = (await res.json()) as { RecognitionStatus?: string; DisplayText?: string };
  return r.RecognitionStatus === 'Success' ? (r.DisplayText ?? '').trim() : '';
}

/** What the browser may ask to have read: one paragraph of the site's own text, in a supported language. */
export function readSpeak(body: unknown, langs: readonly string[]): { text: string; lang: Lang } | { error: string } {
  const b = body as { text?: unknown; lang?: unknown } | null;
  if (!b || typeof b.text !== 'string' || !b.text.trim()) return { error: 'Send some text.' };
  if (b.text.length > 1600) return { error: 'Too long to read in one go.' };
  if (typeof b.lang !== 'string' || !langs.includes(b.lang)) return { error: 'Unknown language.' };
  return { text: b.text.trim(), lang: b.lang as Lang };
}

/** A recording is a 16 kHz mono 16-bit WAV of at most 15 seconds. */
export function checkWav(buf: Uint8Array): string | null {
  if (buf.length < 44 || buf.length > 44 + 16000 * 2 * 15) return 'Recordings must be under 15 seconds.';
  const tag = (o: number) => String.fromCharCode(...buf.slice(o, o + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return 'Send a WAV recording.';
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 16000 || view.getUint16(34, true) !== 16) return 'Send 16 kHz mono 16-bit audio.';
  return null;
}
