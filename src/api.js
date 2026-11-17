import { demoApi } from './demo.js';

// Inside Electron the preload script provides window.tributary; in a plain browser we fall back to demo data.
// `?demo=1` forces demo data even inside Electron (TRIBUTARY_DEMO=1), for screenshots.
export const params = new URLSearchParams(location.search);
export const api = params.has('demo') || !window.tributary ? demoApi : window.tributary;
