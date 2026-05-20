#!/usr/bin/env node

const path = require('path');
const { execSync } = require('child_process');
const chokidar = require('chokidar');
const { WebSocketServer } = require('ws');

const ROOT = path.join(__dirname, '..');
const PORT = 9090;

const WATCH_GLOBS = [
  'lib/**/*.js',
  'content/content.js',
  'popup/**/*',
  'background/**/*.js',
  'manifest.json',
  'profile.yaml',
  'profile.form.yaml',
  'icons/**',
];

const clients = new Set();
let reloadTimer = null;

function rebuildBundle() {
  execSync('node scripts/build-bundle.js', { cwd: ROOT, stdio: 'inherit' });
}

function scheduleReload(changedPath) {
  if (reloadTimer) clearTimeout(reloadTimer);

  reloadTimer = setTimeout(() => {
    const relative = path.relative(ROOT, changedPath);
    const time = new Date().toLocaleTimeString();

    if (relative.startsWith(`lib${path.sep}`) || relative === `content${path.sep}content.js`) {
      console.log(`  [${time}] ${relative} -> rebuild bundle`);
      rebuildBundle();
    } else {
      console.log(`  [${time}] ${relative} -> reload`);
    }

    for (const client of clients) {
      if (client.readyState === 1) {
        client.send('reload');
      }
    }

    if (clients.size === 0) {
      console.log('  (no extension connected — reload Chrome extension manually once)');
    }
  }, 150);
}

rebuildBundle();

const wss = new WebSocketServer({ port: PORT });

wss.on('listening', () => {
  console.log('');
  console.log('  Vietnam e-Visa Autofill — dev watch');
  console.log('  -----------------------------------');
  console.log(`  WebSocket: ws://127.0.0.1:${PORT}`);
  console.log('  Load unpacked: ' + ROOT);
  console.log('');
  console.log('  Watching for changes... (Ctrl+C to stop)');
  console.log('');
});

wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`  Extension connected (${clients.size} client${clients.size === 1 ? '' : 's'})`);

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`  Extension disconnected (${clients.size} remaining)`);
  });
});

const watcher = chokidar.watch(
  WATCH_GLOBS.map((glob) => path.join(ROOT, glob)),
  {
    ignoreInitial: true,
    ignored: [
      path.join(ROOT, 'node_modules/**'),
      path.join(ROOT, 'scripts/**'),
      path.join(ROOT, '.git/**'),
    ],
  }
);

watcher.on('all', (event, filePath) => {
  scheduleReload(filePath);
});

watcher.on('error', (err) => {
  console.error('Watch error:', err);
});

process.on('SIGINT', () => {
  console.log('\n  Stopping dev watch...');
  watcher.close();
  wss.close();
  process.exit(0);
});
