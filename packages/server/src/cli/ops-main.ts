#!/usr/bin/env node
import { runOpsCli } from './ops.js';

process.exitCode = await runOpsCli(process.argv.slice(2), {
  out: (l) => console.log(l),
  err: (l) => console.error(l),
});
