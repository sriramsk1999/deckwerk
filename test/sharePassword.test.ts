/**
 * The visitor password on a collab server (src/server/sharePassword.ts),
 * through a real server: every HTTP request and the live-editing WebSocket
 * are turned away without it; the printed link, the browser's password
 * prompt and the cookie either leaves all let a visitor in; the link drops
 * the password from the address bar; a cookie from an earlier run's password
 * does not open the next one; and loopback (the owner's ssh tunnel) needs
 * none unless told otherwise.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';
import { emptyDeck } from '../src/shared/deck.js';
import { saveDeck } from '../src/main/deckStore.js';
import { startCollabServer, type RunningCollabServer } from '../src/server/collabServer.js';
import {
  generateSharePassword,
  SHARE_PASSWORD_COOKIE,
  sharePasswordLinks,
} from '../src/server/sharePassword.js';

const PASSWORD = 'correct-horse-42';

let rootDir = '';
let server: RunningCollabServer | null = null;
let base = '';

async function start(trustLoopback: boolean, password = PASSWORD): Promise<void> {
  server = await startCollabServer({
    rootDir,
    port: 0,
    host: '127.0.0.1',
    // The tests arrive on loopback, so most of them switch its pass off to
    // stand in for a visitor from another machine.
    sharePassword: { password, trustLoopback },
  });
  base = `http://127.0.0.1:${server.port}`;
}

/** The cookie a response hands over, as a Cookie request header. */
function cookieFrom(response: Response): string {
  const header = response.headers.get('set-cookie') ?? '';
  expect(header).toContain(`${SHARE_PASSWORD_COOKIE}=`);
  expect(header).toContain('HttpOnly');
  expect(header).not.toContain(PASSWORD);
  return header.split(';')[0];
}

function basic(user: string, password: string): string {
  return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

/** Whether a WebSocket to the deck opens (true) or is refused (the status code). */
function openSocket(headers: Record<string, string> = {}, query = ''): Promise<true | number> {
  return new Promise((done, reject) => {
    // Only the handshake matters here, so no room is opened (and written to)
    // behind the test's back: the deck id names nothing.
    const socket = new WebSocket(`ws://127.0.0.1:${server!.port}/ws?deck=no-such-deck${query}`, { headers });
    socket.on('open', () => {
      socket.terminate();
      done(true);
    });
    socket.on('unexpected-response', (_request, response) => {
      socket.terminate();
      done(response.statusCode ?? 0);
    });
    socket.on('error', reject);
  });
}

beforeEach(async () => {
  rootDir = await mkdtemp(join(tmpdir(), 'share-password-'));
  const deckDir = join(rootDir, 'talk');
  await mkdir(deckDir, { recursive: true });
  await saveDeck(deckDir, emptyDeck('Talk'));
});

afterEach(async () => {
  await server?.close();
  server = null;
  await rm(rootDir, { recursive: true, force: true });
});

describe('collab server visitor password', () => {
  it('turns away requests and the WebSocket without the password', async () => {
    await start(false);
    const bare = await fetch(`${base}/api/decks`);
    expect(bare.status).toBe(401);
    expect(bare.headers.get('www-authenticate')).toMatch(/^Basic realm="DeckWerk"/);
    expect((await fetch(`${base}/api/decks?k=wrong-password-0`)).status).toBe(401);
    expect((await fetch(`${base}/api/decks`, { headers: { authorization: basic('anyone', 'nope') } })).status).toBe(401);
    expect((await fetch(`${base}/api/decks`, { headers: { cookie: `${SHARE_PASSWORD_COOKIE}=forged` } })).status).toBe(401);
    expect((await fetch(`${base}/assets/anything.png`)).status).toBe(401);
    expect(await openSocket()).toBe(401);
  });

  it('lets in the printed link, then the cookie it leaves, WebSocket included', async () => {
    await start(false);
    const keyed = await fetch(`${base}/api/decks?k=${PASSWORD}`);
    expect(keyed.status).toBe(200);
    const cookie = cookieFrom(keyed);
    const later = await fetch(`${base}/api/decks`, { headers: { cookie } });
    expect(later.status).toBe(200);
    expect(await later.json()).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'talk' })]));
    expect(await openSocket({ cookie })).toBe(true);
  });

  it('drops the password from the address bar of a page opened from the link', async () => {
    await start(false);
    const page = await fetch(`${base}/?k=${PASSWORD}&deck=talk&name=Advisor`, {
      headers: { accept: 'text/html,application/xhtml+xml' },
      redirect: 'manual',
    });
    expect(page.status).toBe(303);
    expect(page.headers.get('location')).toBe('/?deck=talk&name=Advisor');
    expect((await fetch(`${base}/api/decks`, { headers: { cookie: cookieFrom(page) } })).status).toBe(200);
  });

  it("lets in the browser's password prompt, whatever the user name, and leaves the cookie", async () => {
    await start(false);
    const prompted = await fetch(`${base}/api/decks`, { headers: { authorization: basic('whoever', PASSWORD) } });
    expect(prompted.status).toBe(200);
    expect(await openSocket({ cookie: cookieFrom(prompted) })).toBe(true);
    expect(await openSocket({ authorization: basic('whoever', PASSWORD) })).toBe(true);
  });

  it("does not take a cookie from an earlier run's password", async () => {
    await start(false);
    const cookie = cookieFrom(await fetch(`${base}/api/decks?k=${PASSWORD}`));
    await server!.close();
    await start(false, 'the-next-runs-password');
    expect((await fetch(`${base}/api/decks`, { headers: { cookie } })).status).toBe(401);
    expect(await openSocket({ cookie })).toBe(401);
  });

  it('asks nothing of a connection from the machine itself', async () => {
    await start(true);
    expect((await fetch(`${base}/api/decks`)).status).toBe(200);
    expect(await openSocket()).toBe(true);
  });
});

describe('visitor password and links', () => {
  it('is long, URL-safe and different every start', () => {
    const passwords = new Set(Array.from({ length: 50 }, generateSharePassword));
    expect(passwords.size).toBe(50);
    for (const password of passwords) expect(password).toMatch(/^[A-Za-z0-9_-]{16}$/);
  });

  it('prints a link for each address beyond loopback', () => {
    expect(sharePasswordLinks(
      ['http://localhost:5800/', 'http://127.0.0.1:5800/', 'http://128.2.176.88:5800/', 'http://[::1]:5800/'],
      'abc_DEF-123',
    )).toEqual(['http://128.2.176.88:5800/?k=abc_DEF-123']);
  });
});
