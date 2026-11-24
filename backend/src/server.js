import { createApp } from './app.js';
import { getDb, runMigrations } from './config/db.js';
import { env } from './config/env.js';
import { spExpireHolds, spGenerateReminders } from './db/procedures.js';
import { logEvent } from './utils/logger.js';

const db = getDb();
const newlyApplied = runMigrations(db);
if (newlyApplied.length > 0) {
  logEvent('info', 'migrations_applied', { files: newlyApplied });
}

// Run hold-expiry & reminder sweep on startup and periodically (equivalent to MySQL ev_expire_holds)
function runScheduledMaintenance() {
  try {
    const initialExpiry = spExpireHolds(db);
    if (initialExpiry.expiredCount > 0) {
      logEvent('info', 'holds_expired', initialExpiry);
    }
    const reminders = spGenerateReminders(db);
    if (reminders.created > 0) {
      logEvent('info', 'reminders_generated', reminders);
    }
  } catch (err) {
    logEvent('error', 'scheduled_maintenance_failed', { errorMessage: err.message });
  }
}

runScheduledMaintenance();
const expiryTimer = setInterval(runScheduledMaintenance, env.holdExpiryIntervalMs);
expiryTimer.unref();

const app = createApp();
const server = app.listen(env.port, () => {
  logEvent('info', 'server_listening', {
    port: env.port,
    nodeEnv: env.nodeEnv,
    url: `http://localhost:${env.port}`,
    docsUrl: `http://localhost:${env.port}/api/docs`,
  });
});

function shutdown(signal) {
  logEvent('info', 'server_shutdown', { signal });
  clearInterval(expiryTimer);
  server.close(() => {
    try {
      db.close();
    } catch {
      // ignore close errors on exit
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
