// LOCAL DEVELOPMENT ONLY — there is no production build step.
// JS files are served raw from GitHub Pages.
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: {
    port: 3000,
    open: '/dev/',
  },
});
