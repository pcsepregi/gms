import { startServer } from './server.js';

try {
  const app = await startServer();
  const shutdown = () => {
    void app.close().then(() => process.exit(0));
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
} catch (err) {
  // Foglalt port vagy hibás beállítás: naplóba írunk és kilépünk, a launchd újrapróbálja.
  console.error(`A GMS szerver nem indult el: ${(err as Error).message}`);
  process.exit(1);
}
