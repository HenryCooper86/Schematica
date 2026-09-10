import { request } from 'node:http';

const port = process.env.PORT || '3000';
const host = process.env.PUBLIC_ORIGIN ? new URL(process.env.PUBLIC_ORIGIN).host : `localhost:${port}`;
const req = request({ hostname: '127.0.0.1', port, path: '/healthz', headers: { host }, timeout: 4000 }, (res) => {
  res.resume();
  process.exitCode = res.statusCode === 200 ? 0 : 1;
});
req.on('timeout', () => req.destroy());
req.on('error', () => { process.exitCode = 1; });
req.end();
