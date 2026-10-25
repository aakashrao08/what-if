// What the browser and the agent backend (api/) send each other. Both sides import this file,
// so a change here is a change to the API.

import type { ExperimentSpec } from '../engine/jobs';
import type { Lever } from '../engine/league';
import type { UniverseStoryVoices } from './narrator';

export type AgentName = 'Router' | 'Dr Football' | 'Data Scientist' | 'Analyst' | 'Narrator' | 'Verifier' | 'Scout';
export interface AgentStep { agent: AgentName; status: 'working' | 'done' | 'flagged' | 'failed'; detail: string; ms: number }

/** One thing an agent did on the server: a model call, a tool call, a check or a note. */
export interface TraceEvent {
  agent: AgentName;
  kind: 'model' | 'tool' | 'check' | 'note';
  name: string; // tool name, 'draft 2', 'numbers', 'football sense'...
  detail: string;
  ms: number;
  tokens?: number;
}

export interface Usage { calls: number; promptTokens: number; completionTokens: number }

interface Base { steps: AgentStep[]; trace: TraceEvent[]; usage: Usage; model: string; cached?: boolean }

export interface SettleRequest { question: string }
export type SettleReply =
  | (Base & { ok: true; spec: ExperimentSpec; summary: string; line: string | null; script: string | null; drafts: number; flags: string[] })
  | (Base & { ok: false; reply: string });

export interface MultiverseRequest { question: string }
export type MultiverseReply =
  | (Base & { ok: true; sentence: string; levers: Lever[]; story: UniverseStoryVoices | null; drafts: number; flags: string[] })
  | (Base & { ok: false; reply: string });

export interface TakesRequest { question: string; club?: string } // club: the visitor's own, used when the question names none
export type TakesReply =
  | (Base & { ok: true; goal: { club: string; race: 'title' | 'top4' | 'survive' }; story: { head: string; sub: string } | null; drafts: number; flags: string[] })
  | (Base & { ok: false; reply: string });

export interface ScoutRequest { lang: string; fan: boolean; club: string; alerts: { key: string; type: string; facts: Record<string, number | string | boolean>; template: string }[] }
export type ScoutReply =
  | (Base & { ok: true; texts: Record<string, string>; drafts: number; flags: string[] })
  | (Base & { ok: false; reply: string });

export interface RecapRequest { fixtureId: string; persona: string; lang: string }
export type RecapReply =
  | (Base & { ok: true; headline: string | null; paragraphs: string[] | null; drafts: number; flags: string[] })
  | (Base & { ok: false; reply: string });

export interface TranslateRequest { lang: string; items: { key: string; text: string }[] }
export type TranslateReply =
  | (Base & { ok: true; texts: Record<string, string> })
  | (Base & { ok: false; reply: string });

export interface AskRequest { question: string }
export type AskReply =
  | (Base & { ok: true; route: { to: 'settle' | 'multiverse' | 'takes' | 'league' | 'squad'; q?: string; club?: string; why: string } })
  | (Base & { ok: false; reply: string });
