#!/usr/bin/env node
// Capture a still of a slide's live web element into the deck, for its poster.
//
//   fork/live-poster.mjs <deck> <slide number> [name]
//
// Start the element's server first. The still lands in <deck>/assets/web/ and
// the path to put in the element's data-poster is printed. Speaker View, PDF
// export and the "Waiting for" note show it.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const checkout = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [deckArg, slide, name = 'live'] = process.argv.slice(2);
if (!deckArg || !/^\d+$/.test(slide ?? '')) {
  console.error('usage: fork/live-poster.mjs <deck> <slide number> [name]');
  process.exit(2);
}
const deck = resolve(deckArg);
const port = 5900 + Math.floor(Math.random() * 500);

const preview = spawn(join(checkout, 'bin', 'slide-agent'), ['preview', deck, '--port', String(port)],
  { stdio: ['ignore', 'pipe', 'inherit'] });
const url = await new Promise((done, fail) => {
  let buffered = '';
  preview.stdout.on('data', (chunk) => {
    buffered += chunk;
    const match = /"url":\s*"([^"]+)"/.exec(buffered);
    if (match) done(match[1]);
  });
  preview.on('exit', (code) => fail(new Error(`preview exited (${code}) before serving`)));
});

const assets = join(deck, 'assets', 'web');
mkdirSync(assets, { recursive: true });
const draft = join(assets, `${name}.poster.tmp.png`);
try {
  execFileSync(join(checkout, 'node_modules', 'electron', 'dist', 'electron'),
    [join(checkout, 'fork', 'live-poster-capture.cjs'), `${url}#${slide}`, draft], { stdio: 'inherit' });
} catch {
  preview.kill();
  process.exit(1);
}
preview.kill();

// Content-hashed like the deck's other web assets.
const hash = createHash('sha256').update(readFileSync(draft)).digest('hex').slice(0, 8);
const poster = `assets/web/${name}.${hash}.poster.png`;
renameSync(draft, join(deck, poster));
console.log(poster);
