/**
 * E2E tesztszerver: ideiglenes adatmappa, import a szintetikus fixture-ből, majd indítás.
 * A lefordított kódot használja, ezért előtte `npm run build` kell.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runImportCli } from '../packages/server/dist/cli/import-cli.js';
import { loadConfig } from '../packages/server/dist/config.js';
import { startServer } from '../packages/server/dist/server.js';

const port = process.argv[2] ?? '4799';
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gms-e2e-'));
const fixture = new URL('../fixtures/sample-master.xlsx', import.meta.url).pathname;

const code = await runImportCli(['--file', fixture, '--data-dir', dataDir], {
  out: () => {},
  err: (l) => console.error(l),
  env: {},
});
if (code !== 0) process.exit(code);

const app = await startServer(loadConfig({ dataDir, env: { GMS_PORT: port } }), {
  logger: false,
});
const stop = () => {
  void app.close().then(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
    process.exit(0);
  });
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
