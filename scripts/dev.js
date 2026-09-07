/** Runs rgs + web + edge together with prefixed logs. */
import { spawn } from 'node:child_process';

const services = [
  { name: 'rgs', file: 'services/rgs/index.js', color: '\x1b[36m' },
  { name: 'web', file: 'services/web/server.js', color: '\x1b[35m' },
  // Edge starts last: it warms contexts by loading the game from web.
  { name: 'edge', file: 'services/edge/index.js', color: '\x1b[33m', delay: 900 },
];

const kids = [];
for (const s of services) {
  setTimeout(() => {
    const p = spawn(process.execPath, [s.file], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    kids.push(p);
    const pipe = (stream, isErr) => {
      let buf = '';
      stream.on('data', (d) => {
        buf += d.toString();
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const l of lines) {
          if (l.trim()) process.stdout.write(`${s.color}${l}\x1b[0m\n`);
        }
      });
    };
    pipe(p.stdout);
    pipe(p.stderr, true);
    p.on('exit', (code) => console.log(`${s.color}[${s.name}] exited ${code}\x1b[0m`));
  }, s.delay || 0);
}

const bye = () => { for (const k of kids) k.kill(); process.exit(0); };
process.on('SIGINT', bye);
process.on('SIGTERM', bye);

setTimeout(() => {
  console.log('\n\x1b[32m  Ember demo rig → http://localhost:4000\x1b[0m\n');
}, 2500);
