// The browser half of Azure AI Speech: play a line read by a neural voice, and record a short spoken
// question as 16 kHz mono WAV for the server to turn into words. The key never reaches the browser.

import type { Lang } from './format';
import { toWav } from './wav';

let ready: Promise<boolean> | null = null;
/** Whether the server has speech configured (asked once per visit). */
export function speechReady(): Promise<boolean> {
  ready ??= fetch('/api/health').then((r) => (r.ok ? r.json() : null)).then((h: { speech?: boolean } | null) => !!h?.speech, () => false);
  return ready;
}

const clips = new Map<string, string>(); // `${lang}|${text}` -> object URL, for this visit
let playing: { audio: HTMLAudioElement; stop: () => void } | null = null;

/** Read a line aloud. Resolves when it finishes or is stopped; rejects if speech is unavailable. */
export async function speakLine(text: string, lang: Lang, onStart?: () => void): Promise<void> {
  stopSpeaking();
  const key = `${lang}|${text}`;
  let url = clips.get(key);
  if (!url) {
    const res = await fetch('/api/speech/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }) });
    if (!res.ok) throw new Error(`speech ${res.status}`);
    url = URL.createObjectURL(await res.blob());
    clips.set(key, url);
  }
  const audio = new Audio(url);
  return new Promise<void>((resolve, reject) => {
    const done = () => { if (playing?.audio === audio) playing = null; resolve(); };
    audio.onended = done;
    audio.onerror = () => { playing = null; reject(new Error('playback')); };
    playing = { audio, stop: () => { audio.pause(); done(); } };
    audio.play().then(() => onStart?.(), (e) => { playing = null; reject(e); });
  });
}

export function stopSpeaking() { playing?.stop(); }

const MAX_SECONDS = 12;

export interface Recording { stop: () => Promise<Uint8Array> }

/** Start recording from the microphone. stop() returns a WAV; recording also ends itself after 12 s. */
export async function startRecording(onAutoStop?: () => void): Promise<Recording> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const proc = ctx.createScriptProcessor(4096, 1, 1);
  const chunks: Float32Array[] = [];
  proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(proc);
  proc.connect(ctx.destination);
  let finished: Promise<Uint8Array> | null = null;
  const stop = () => {
    if (finished) return finished;
    clearTimeout(timer);
    proc.disconnect(); source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    finished = ctx.close().then(() => toWav(chunks, ctx.sampleRate));
    return finished;
  };
  const timer = setTimeout(() => { void stop(); onAutoStop?.(); }, MAX_SECONDS * 1000);
  return { stop };
}

/** The words in a recording, or '' if nothing was understood. */
export async function hearQuestion(wav: Uint8Array, lang: Lang): Promise<string> {
  const res = await fetch(`/api/speech/hear?lang=${lang}`, { method: 'POST', headers: { 'Content-Type': 'audio/wav' }, body: wav.slice().buffer });
  if (!res.ok) throw new Error(`speech ${res.status}`);
  return ((await res.json()) as { text?: string }).text ?? '';
}
