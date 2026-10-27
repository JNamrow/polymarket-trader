#!/usr/bin/env node
/**
 * The trading engine lives in src/engine (the frontend imports it from there,
 * which is the only tree Base44's preview sandbox serves). Backend functions
 * can only import from base44/shared, so an exact copy is kept at
 * base44/shared/engine for base44/functions/botTick.
 *
 *   node scripts/sync-engine.mjs          copy src/engine → base44/shared/engine
 *   node scripts/sync-engine.mjs --check  exit 1 if the two folders differ
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src', 'engine');
const DEST = join(root, 'base44', 'shared', 'engine');
const check = process.argv.includes('--check');

const files = readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
const destFiles = existsSync(DEST) ? readdirSync(DEST).filter(f => f.endsWith('.js')).sort() : [];

if (check) {
  const diffs = [];
  for (const f of files) {
    const a = readFileSync(join(SRC, f), 'utf8');
    const b = existsSync(join(DEST, f)) ? readFileSync(join(DEST, f), 'utf8') : null;
    if (a !== b) diffs.push(f);
  }
  for (const f of destFiles) if (!files.includes(f)) diffs.push(`${f} (only in base44/shared/engine)`);
  if (diffs.length) {
    console.error(`base44/shared/engine is out of date: ${diffs.join(', ')}\nRun: npm run engine:sync`);
    process.exit(1);
  }
  console.log(`engine mirror OK (${files.length} files)`);
} else {
  rmSync(DEST, { recursive: true, force: true });
  mkdirSync(DEST, { recursive: true });
  for (const f of files) writeFileSync(join(DEST, f), readFileSync(join(SRC, f)));
  console.log(`copied ${files.length} files → base44/shared/engine`);
}
