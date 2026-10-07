// Production start (`npm start`). Render's free plan has no shell and no pre-deploy step,
// so pending Prisma migrations are applied here, right before the API starts. A failed
// migration is logged and the API still starts: a schema problem never takes the whole
// backend down. `--no` stops npx from downloading a different Prisma version.
import { execSync } from 'node:child_process';

try {
  execSync('npx --no prisma migrate deploy', { stdio: 'inherit' });
} catch {
  console.error('[start] prisma migrate deploy failed; starting the API anyway. See the log above.');
}

await import('../dist/server.js');
