import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev:https` serves over https with a throwaway certificate. Tablets only allow tilt
// steering on https pages, so use it to try tilt over Wi-Fi (the browser will warn once; continue).
const https = process.env.RACE_HTTPS === '1';

export default defineConfig({
  plugins: https ? [basicSsl()] : [],
  base: './', // relative paths so the build works from any folder or subpath
  server: { host: true }, // reachable from the tablet on your LAN
  preview: { host: true },
  build: { chunkSizeWarningLimit: 2500 },
});
