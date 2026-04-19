#!/usr/bin/env node
import("../dist/cli.js")
  .then((m) => m.run(process.argv))
  .catch((e) => { process.stderr.write(`ub: ${e.message}\n`); process.exit(1); });
