#!/usr/bin/env node
/**
 * The trading engine lives in src/engine (the frontend imports it from there,
 * which is the only tree Base44's preview sandbox serves). Server code can
 * only import from its own tree, so exact copies are kept at:
 *   base44/shared/engine                 for base44/functions/*  (Base44, Deno)
 *   supabase/functions/demo-tick/engine, demo-whales/engine and
 *   demo-wallets/engine                  (Supabase Edge Functions, Deno; each deploy uploads one folder)
 *
 *   node scripts/sync-engine.mjs          copy src/engine → both mirrors
 *   node scripts/sync-engine.mjs --check  exit 1 if a mirror differs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'src', 'engine');
const DESTS = [
  join(root, 'base44', 'shared', 'engine'),
  join(root, 'supabase', 'functions', 'demo-tick', 'engine'),
  join(root, 'supabase', 'functions', 'demo-whales', 'engine'),
  join(root, 'supabase', 'functions', 'demo-wallets', 'engine'),
];
const check = process.argv.includes('--check');

const files = readdirSync(SRC).filter(f => f.endsWith('.js')).sort();
let failed = false;

for (const DEST of DESTS) {
  const label = DEST.replace(root + '/', '');
  if (check) {
    const diffs = [];
    for (const f of files) {
      const a = readFileSync(join(SRC, f), 'utf8');
      const b = existsSync(join(DEST, f)) ? readFileSync(join(DEST, f), 'utf8') : null;
      if (a !== b) diffs.push(f);
    }
    const destFiles = existsSync(DEST) ? readdirSync(DEST).filter(f => f.endsWith('.js')) : [];
    for (const f of destFiles) if (!files.includes(f)) diffs.push(`${f} (only in ${label})`);
    if (diffs.length) {
      console.error(`${label} is out of date: ${diffs.join(', ')}`);
      failed = true;
    }
  } else {
    rmSync(DEST, { recursive: true, force: true });
    mkdirSync(DEST, { recursive: true });
    for (const f of files) writeFileSync(join(DEST, f), readFileSync(join(SRC, f)));
    console.log(`copied ${files.length} files → ${label}`);
  }
}

if (check) {
  if (failed) {
    console.error('Run: npm run engine:sync');
    process.exit(1);
  }
  console.log(`engine mirrors OK (${files.length} files × ${DESTS.length})`);
}
