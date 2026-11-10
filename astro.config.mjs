// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Static output only: no adapter, no server functions.
// `format: 'file'` emits /mulch-calculator.html, which Cloudflare Workers
// Static Assets serves at /mulch-calculator (no trailing slash).
export default defineConfig({
  site: 'https://prunest.com',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },
  vite: { plugins: [tailwindcss()] },
});
