const { spawn } = require('child_process');
const fs = require('fs');

const LOG = '/home/z/my-project/standalone-restart.log';
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG, line);
}

let count = 0;
function start() {
  count++;
  log(`Starting standalone server (attempt ${count})...`);
  const out = fs.openSync(LOG, 'a');
  const err = fs.openSync(LOG, 'a');
  const proc = spawn('node', ['.next/standalone/server.js'], {
    cwd: '/home/z/my-project',
    env: { ...process.env, DATABASE_URL: 'file:/home/z/my-project/db/custom.db', NODE_OPTIONS: '--max-old-space-size=1024' },
    detached: true,
    stdio: ['ignore', out, err],
  });
  proc.unref();
  log(`Standalone PID: ${proc.pid}`);
  proc.on('exit', (code, sig) => {
    log(`Standalone exited (code=${code}, sig=${sig}). Restarting in 2s...`);
    setTimeout(start, 2000);
  });
  proc.on('error', (err) => {
    log(`Standalone error: ${err.message}. Restarting in 2s...`);
    setTimeout(start, 2000);
  });
}

start();
setInterval(() => {}, 1000);
