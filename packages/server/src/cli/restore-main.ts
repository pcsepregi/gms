#!/usr/bin/env node
import { runRestoreCli } from './restore.js';

const code = await runRestoreCli(process.argv.slice(2), {
  out: (l) => console.log(l),
  err: (l) => console.error(l),
});
process.exitCode = code;
