import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const child = spawn(process.execPath, [fileURLToPath(new URL('../tests/e2e/smoke.mjs', import.meta.url))], {
  stdio: 'inherit', env: { ...process.env, BENCHMARK_ONLY: '1', BENCHMARK_OUTPUT: process.argv[2] || 'docs/benchmark-latest.json' },
});
child.on('exit', code => { process.exitCode = code || 0; });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
