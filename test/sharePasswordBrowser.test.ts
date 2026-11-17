import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { saveDeck } from '../src/main/deckStore.js';
import { startCollabServer, type RunningCollabServer } from '../src/server/collabServer.js';
import { emptyDeck } from '../src/shared/deck.js';
import {
  Cdp,
  electronBinary,
  eventually,
  findTarget,
  launchBrowser,
  stopBrowser,
  type RunningBrowser,
} from './support/browserSession.js';
import { collabClientDir } from './support/collabClient.js';

/**
 * The visitor password in a real browser: the printed link opens the editor
 * (the page reloads without the password in its address, and the cookie it
 * left carries the live-editing WebSocket, so the deck arrives), while a
 * browser without it gets the password challenge and no editor. Loopback's
 * pass is off so the browser stands in for a visitor from another machine.
 */
const DECK_ID = 'talk';
const PASSWORD = 'browser-visit-77';

let workDir = '';
let server: RunningCollabServer | null = null;
let browser: RunningBrowser | null = null;
let page: Cdp | null = null;

afterEach(async () => {
  page?.close();
  page = null;
  await stopBrowser(browser?.process ?? null);
  browser = null;
  await server?.close();
  server = null;
  if (workDir) await rm(workDir, { recursive: true, force: true });
  workDir = '';
});

async function serve(): Promise<{ base: string; profileDir: string }> {
  workDir = await mkdtemp(join(tmpdir(), 'share-password-browser-'));
  const decksRoot = join(workDir, 'decks');
  const profileDir = join(workDir, 'electron-profile');
  await mkdir(join(decksRoot, DECK_ID), { recursive: true });
  await mkdir(profileDir, { recursive: true });
  await saveDeck(join(decksRoot, DECK_ID), emptyDeck('Shared talk'));
  server = await startCollabServer({
    rootDir: decksRoot,
    clientDir: await collabClientDir(),
    host: '127.0.0.1',
    port: 0,
    sharePassword: { password: PASSWORD, trustLoopback: false },
  });
  return { base: `http://127.0.0.1:${server.port}`, profileDir };
}

describe.skipIf(!electronBinary)('collab server visitor password', () => {
  it('opens the editor from the printed link and keeps the password out of the address bar', { timeout: 120_000 }, async () => {
    const { base, profileDir } = await serve();
    browser = await launchBrowser(`${base}/?k=${PASSWORD}&deck=${DECK_ID}&name=Visitor`, profileDir);
    const target = await findTarget(browser.debugPort, (c) => c.url.includes(`deck=${DECK_ID}`), browser.log);
    page = await Cdp.connect(target.webSocketDebuggerUrl!);
    // The rail's slide number is drawn from the deck the WebSocket delivered.
    await eventually(async () => page!.evaluate<boolean>(`Boolean(document.querySelector('.rail-num'))`),
      'the deck never arrived over the WebSocket');
    const address = await page.evaluate<string>('location.href');
    expect(address).toContain(`deck=${DECK_ID}`);
    expect(address).not.toContain(PASSWORD);
  });

  it('gives a browser without the password the challenge and no editor', { timeout: 120_000 }, async () => {
    const { base, profileDir } = await serve();
    browser = await launchBrowser(`${base}/?deck=${DECK_ID}&name=Stranger`, profileDir);
    const target = await findTarget(browser.debugPort, (c) => c.url.includes(`deck=${DECK_ID}`), browser.log);
    page = await Cdp.connect(target.webSocketDebuggerUrl!);
    await eventually(async () => page!.evaluate<string>('document.readyState'), 'page never loaded',
      (state) => state === 'complete');
    expect(await page.evaluate<boolean>(`Boolean(document.querySelector('.brand-button, .rail-num'))`)).toBe(false);
    expect(await page.evaluate<string>('document.body?.innerText ?? ""')).toContain('needs its password');
  });
});
