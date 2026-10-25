// System prompts live as Markdown in api/prompts/ so they're easy to read and review. The bundler
// (esbuild, `--loader:.md=text`) and the test runner (a small Vite plugin) both inline them as text.

import datascientist from '../../prompts/datascientist.md';
import drfootball from '../../prompts/drfootball.md';
import goal from '../../prompts/goal.md';
import narrator from '../../prompts/narrator.md';
import router from '../../prompts/router.md';
import scout from '../../prompts/scout.md';
import translator from '../../prompts/translator.md';
import verifier from '../../prompts/verifier.md';

export const PROMPTS = { datascientist, drfootball, goal, narrator, router, scout, translator, verifier };
