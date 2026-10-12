import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // relative paths so the build works from any folder or subpath
  server: { host: true }, // reachable from the tablet on your LAN
  preview: { host: true },
  build: { chunkSizeWarningLimit: 1500 },
});
