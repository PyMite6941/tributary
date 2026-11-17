import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The production bundle gets a strict CSP. Not in dev: Vite's HMR preamble is an inline script.
// img-src allows http(s) because the email reader opts in per message; the reader iframe
// narrows it again with its own CSP when remote images are blocked.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: http:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' about:",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

const cspPlugin = {
  name: 'inject-csp',
  apply: 'build',
  transformIndexHtml: (html) =>
    html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
};

export default defineConfig({
  root: 'src',
  base: './', // loaded from file:// in the packaged app
  plugins: [react(), cspPlugin],
  build: { outDir: '../dist', emptyOutDir: true },
  server: { port: 5199, strictPort: true },
});
