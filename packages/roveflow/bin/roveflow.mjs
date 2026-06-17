#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const dir = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(dir, "..", "src", "cli.ts");

// Resolve tsx's CLI no matter where npm installed it (nested or hoisted, any version).
const tsxPkgPath = require.resolve("tsx/package.json");
const tsxPkg = require(tsxPkgPath);
const binRel = typeof tsxPkg.bin === "string" ? tsxPkg.bin : tsxPkg.bin.tsx;
const tsxBin = path.join(path.dirname(tsxPkgPath), binRel);

const r = spawnSync(process.execPath, [tsxBin, cli, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
