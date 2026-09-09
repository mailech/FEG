/**
 * Public tunnel.  node Solution/scripts/tunnel.mjs
 *
 * Puts the app and the relay on public HTTPS URLs so the demo works from any
 * phone on any network — mobile data, a hotel wifi, a judge's own device.
 *
 * Two tunnels are needed, not one. The app and the relay are separate servers on
 * separate ports, and a page served over HTTPS cannot call an HTTP relay: the
 * browser blocks it as mixed content. So both ends go through Cloudflare and the
 * app is handed the relay's address on the query string.
 *
 * Quick tunnels need no Cloudflare account and no login. They are ephemeral —
 * new URLs every run — which is right for a demo and wrong for anything else.
 *
 * Prereq: the app on :8081 (npm run web) and the relay on :8787 (npm run relay).
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { createRequire } from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, '../server/bin/cloudflared.exe');
const APP_PORT = Number(process.env.APP_PORT) || 8081;
const RELAY_PORT = Number(process.env.RELAY_PORT) || 8787;

if (!existsSync(BIN)) {
  console.error(`cloudflared not found at ${BIN}`);
  console.error('Download it once:');
  console.error('  curl -L -o Solution/server/bin/cloudflared.exe \\');
  console.error('    https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe');
  process.exit(1);
}

const alive = (port) =>
  new Promise((res) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1500 }, (r) => {
      r.destroy();
      res(true);
    });
    req.on('error', () => res(false));
    req.on('timeout', () => { req.destroy(); res(false); });
  });

/** Start one quick tunnel and resolve with its public URL. */
function tunnel(port, label) {
  return new Promise((resolve, reject) => {
    const p = spawn(BIN, ['tunnel', '--url', `http://localhost:${port}`], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let done = false;
    const scan = (buf) => {
      const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m && !done) {
        done = true;
        console.log(`  ${label.padEnd(6)} :${port}  ->  ${m[0]}`);
        resolve({ url: m[0], proc: p });
      }
    };
    p.stdout.on('data', scan);
    p.stderr.on('data', scan);
    p.on('exit', (code) => {
      if (!done) reject(new Error(`${label} tunnel exited (${code}) before giving a URL`));
    });
    setTimeout(() => {
      if (!done) reject(new Error(`${label} tunnel timed out after 45s`));
    }, 45000);
  });
}

const appUp = await alive(APP_PORT);
const relayUp = await alive(RELAY_PORT);

if (!appUp) {
  console.error(`Nothing on :${APP_PORT}. Start the app first:  cd Solution/app && npm run web`);
  process.exit(1);
}
if (!relayUp) {
  console.log(`Note: nothing on :${RELAY_PORT}. The live feed will read "relay offline".`);
  console.log('      Start it with:  cd Solution/app && npm run relay\n');
}

console.log('opening tunnels (no account needed, URLs change each run)\n');

const app = await tunnel(APP_PORT, 'app');
const relay = relayUp ? await tunnel(RELAY_PORT, 'relay') : null;

const q = relay ? `?relay=${encodeURIComponent(relay.url)}` : '';

// A 130-character URL retyped off a wrapped terminal line is the actual failure
// mode here, not the tunnel. Scan it instead.
const productUrl = `${app.url}/${q}`;
try {
  const require = createRequire(join(HERE, '../app/package.json'));
  const qrcode = require('qrcode-terminal');
  console.log('\n  scan this with the phone camera (product page):\n');
  qrcode.generate(productUrl, { small: true });
} catch {
  console.log('\n  (run: npm i -D qrcode-terminal   in Solution/app for a scannable code)');
}

console.log(`
  ready — open these on any device, any network

  product      ${app.url}/${q}
  pipeline     ${app.url}/pipeline${q}
  diagnostics  ${app.url}/mind${q}
  operator     ${app.url}/ops${q}
`);

if (relay) {
  console.log(`  The ?relay= part is only needed once per device — it is remembered
  afterwards, so plain ${app.url}/ops works from then on.
`);
}

console.log('  Ctrl+C to close the tunnels.\n');

const stop = () => {
  app.proc.kill();
  relay?.proc.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
