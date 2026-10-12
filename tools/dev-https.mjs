// Starts the dev server over https (see vite.config.js). Works the same on Windows, Mac and Linux.
import { spawn } from 'node:child_process';

process.env.RACE_HTTPS = '1';
spawn('npx', ['vite'], { stdio: 'inherit', shell: true }).on('exit', (code) => process.exit(code ?? 0));
