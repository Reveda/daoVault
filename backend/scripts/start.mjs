// Production start (`npm start`). Render's free plan has no shell and no pre-deploy step,
// so pending Prisma migrations are applied here, right before the API starts.
// A failed migration STOPS the start (exit 1): the new code would run against an old schema and
// fail on every payment (review, 2026-10-14). Render then keeps the previous version online;
// Docker restarts the container and the logs show the migration error.
// `--no` stops npx from downloading a different Prisma version.
import { execSync } from 'node:child_process';

try {
  execSync('npx --no prisma migrate deploy', { stdio: 'inherit' });
} catch {
  console.error('[start] prisma migrate deploy FAILED: the API is not started. Fix the migration (see the log above), then deploy again.');
  process.exit(1);
}

await import('../dist/server.js');
