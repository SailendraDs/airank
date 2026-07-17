console.log('=== Starting server wrapper ===');
console.log('Node version:', process.version);
console.log('Platform:', process.platform);
console.log('CWD:', process.cwd());

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
  console.error('Stack:', err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

console.log('Spawning tsx...');
const { spawn } = require('child_process');

const proc = spawn('npx', ['tsx', 'server/index.ts'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FORCE_COLOR: '0' }
});

proc.on('error', (err) => {
  console.error('Process error:', err);
});

proc.on('exit', (code, signal) => {
  console.log(`Process exited with code ${code} and signal ${signal}`);
});

console.log('Tsx spawned, PID:', proc.pid);
