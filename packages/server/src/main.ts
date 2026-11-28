import { DailyLogFile } from './logfile.js';
import { startServer } from './server.js';

// A LaunchAgent a GMS_LOG_DIR változóval adja meg a naplómappát (~/Library/Logs/GMS);
// enélkül (kézi indításkor) a napló a standard kimenetre megy.
const logDir = process.env.GMS_LOG_DIR;
const logFile = logDir ? new DailyLogFile(logDir) : null;

try {
  const app = await startServer(undefined, {
    logger: logFile ? { level: 'info', stream: logFile } : true,
  });
  const shutdown = () => {
    void app.close().then(() => {
      logFile?.close();
      process.exit(0);
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (err) {
  // Foglalt port vagy hibás beállítás: naplóba írunk és kilépünk, a launchd újrapróbálja.
  const message = `A GMS szerver nem indult el: ${(err as Error).message}`;
  logFile?.write(`${JSON.stringify({ level: 50, time: Date.now(), msg: message })}\n`);
  console.error(message);
  process.exit(1);
}
