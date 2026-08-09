const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const LOG = path.join('/home/z/my-project', 'daemon-out.log');
const PIDFILE = path.join('/home/z/my-project', 'daemon.pid');
const CHAT_PIDFILE = path.join('/home/z/my-project', 'chat-daemon.pid');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG, line);
}

function startChatService() {
  log('Starting chat-service on port 3003...');

  // Kill any existing process on port 3003
  try { execSync('fuser -k 3003/tcp 2>/dev/null'); } catch {}
  try { execSync('lsof -ti:3003 | xargs kill -9 2>/dev/null'); } catch {}

  const proc = spawn('bun', ['--hot', 'index.ts'], {
    cwd: '/home/z/my-project/mini-services/chat-service',
    env: { ...process.env, DATABASE_URL: 'file:/home/z/my-project/db/custom.db' },
    detached: true,
    stdio: ['ignore', fs.openSync(LOG, 'a'), fs.openSync(LOG, 'a')],
  });

  proc.unref();
  proc.pid && fs.writeFileSync(CHAT_PIDFILE, String(proc.pid));
  log(`Chat-service PID: ${proc.pid}`);

  proc.on('exit', (code) => {
    log(`Chat-service exited (code=${code}). Restarting in 3s...`);
    setTimeout(startChatService, 3000);
  });

  proc.on('error', (err) => {
    log(`Chat-service error: ${err.message}. Restarting in 3s...`);
    setTimeout(startChatService, 3000);
  });
}

function startServer() {
  log('Starting Next.js dev server...');

  // Kill any existing process on port 3000
  try { execSync('fuser -k 3000/tcp 2>/dev/null'); } catch {}
  try { execSync('lsof -ti:3000 | xargs kill -9 2>/dev/null'); } catch {}

  const proc = spawn('bun', ['run', 'dev'], {
    cwd: '/home/z/my-project',
    env: { ...process.env, DATABASE_URL: 'file:/home/z/my-project/db/custom.db' },
    detached: true,
    stdio: ['ignore', fs.openSync(LOG, 'a'), fs.openSync(LOG, 'a')],
  });

  proc.unref();
  proc.pid && fs.writeFileSync(PIDFILE, String(proc.pid));
  log(`Server PID: ${proc.pid}`);

  proc.on('exit', (code) => {
    log(`Server exited (code=${code}). Restarting in 3s...`);
    setTimeout(startServer, 3000);
  });

  proc.on('error', (err) => {
    log(`Server error: ${err.message}. Restarting in 3s...`);
    setTimeout(startServer, 3000);
  });
}

log('=== DAEMON START ===');
startChatService();
startServer();
log('Daemon forked. Server + chat-service running in background.');

// Exit parent immediately, let children run independently
process.exit(0);
