/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The agent prompts in api/prompts are Markdown; tests import them as text, as esbuild does in the API bundle
const markdownAsText = { name: 'markdown-as-text', transform: (code: string, id: string) => (id.endsWith('.md') ? `export default ${JSON.stringify(code)};` : undefined) };

// base './' keeps the build portable: Azure Static Web Apps, a sub-path, or a static preview host.
export default defineConfig({
  base: './',
  plugins: [react(), markdownAsText],
  worker: { format: 'es' },
  // live mode in dev: the agent API runs under Azure Functions Core Tools on its default port
  server: { proxy: { '/api': 'http://localhost:7071' } },
  test: {
    include: ['src/**/*.test.ts', 'forge/**/*.test.ts', 'api/src/**/*.test.ts']
  }
});
