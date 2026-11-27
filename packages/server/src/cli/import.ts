#!/usr/bin/env node
import { runImportCli } from './import-cli.js';

const code = await runImportCli(process.argv.slice(2), {
  out: (l) => console.log(l),
  err: (l) => console.error(l),
});
process.exitCode = code;
