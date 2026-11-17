import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * A password on a collab server that is reachable from outside the machine
 * (`npm run collab`, scripts/collab-server.mts): a fresh random one each time
 * the server starts, printed with a link that carries it.
 *
 * A visitor gets in three ways, and the first two leave a cookie so the rest
 * of the session (presenting, the live-editing WebSocket, media) follows:
 *   - the link, `?k=<password>`, which is then dropped from the address bar;
 *   - the browser's own password prompt (any user name, this password);
 *   - the cookie from either.
 * Connections from the machine itself skip the check: the owner's ssh tunnel
 * and the desktop app arrive on loopback.
 *
 * The cookie holds an HMAC of the password, never the password, and a new
 * password on the next start invalidates every cookie handed out before.
 */
export const SHARE_PASSWORD_QUERY = 'k';
export const SHARE_PASSWORD_COOKIE = 'deckwerk_share';
const COOKIE_MAX_AGE_S = 30 * 24 * 60 * 60;

export interface SharePasswordOptions {
  password: string;
  /** Let loopback connections in without the password (default true). */
  trustLoopback?: boolean;
}

export interface SharePasswordGate {
  /**
   * Whether an HTTP request may go on to the server. When it may not, or when
   * the gate answers itself (the redirect that drops `?k=`), the response has
   * been sent.
   */
  admitHttp(request: IncomingMessage, response: ServerResponse): boolean;
  /** Whether a WebSocket upgrade may go on. */
  admitUpgrade(request: IncomingMessage): boolean;
}

/** A password for one run of the server: 16 URL-safe characters. */
export function generateSharePassword(): string {
  return randomBytes(12).toString('base64url');
}

/** The links people open, one per address the server listens on beyond loopback. */
export function sharePasswordLinks(urls: string[], password: string): string[] {
  return urls
    .filter((url) => !isLoopbackHost(new URL(url).hostname))
    .map((url) => {
      const link = new URL(url);
      link.searchParams.set(SHARE_PASSWORD_QUERY, password);
      return link.toString();
    });
}

export function createSharePasswordGate(options: SharePasswordOptions): SharePasswordGate {
  const { password } = options;
  if (!password) throw new Error('share password must not be empty');
  const trustLoopback = options.trustLoopback ?? true;
  const token = createHmac('sha256', password).update('deckwerk-share-cookie').digest('base64url');
  const cookie = `${SHARE_PASSWORD_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE_S}`;

  const hasCookie = (request: IncomingMessage): boolean =>
    readCookies(request.headers.cookie).some(([name, value]) => name === SHARE_PASSWORD_COOKIE && same(value, token));
  const hasBasic = (request: IncomingMessage): boolean => {
    const header = request.headers.authorization ?? '';
    const match = /^Basic\s+(\S+)$/i.exec(header);
    if (!match) return false;
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    return colon >= 0 && same(decoded.slice(colon + 1), password);
  };
  const urlOf = (request: IncomingMessage): URL => new URL(request.url ?? '/', 'http://localhost');
  const hasQuery = (url: URL): boolean => same(url.searchParams.get(SHARE_PASSWORD_QUERY) ?? '', password);
  const local = (request: IncomingMessage): boolean =>
    trustLoopback && isLoopbackAddress(request.socket.remoteAddress ?? '');

  return {
    admitHttp(request, response) {
      if (local(request) || hasCookie(request)) return true;
      const url = urlOf(request);
      if (hasQuery(url)) {
        response.setHeader('set-cookie', cookie);
        if (request.method === 'GET' && (request.headers.accept ?? '').includes('text/html')) {
          // A page opened from the link: hand over the cookie and reload
          // without the password, so it neither stays in the address bar nor
          // travels on in a link copied from it.
          url.searchParams.delete(SHARE_PASSWORD_QUERY);
          response.writeHead(303, { location: `${url.pathname}${url.search}`, 'cache-control': 'no-store' });
          response.end();
          return false;
        }
        return true;
      }
      if (hasBasic(request)) {
        response.setHeader('set-cookie', cookie);
        return true;
      }
      response.writeHead(401, {
        'www-authenticate': 'Basic realm="DeckWerk", charset="UTF-8"',
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      });
      response.end('This DeckWerk server needs its password: open the link it printed, or enter the password.\n');
      return false;
    },
    admitUpgrade(request) {
      return local(request) || hasCookie(request) || hasQuery(urlOf(request)) || hasBasic(request);
    },
  };
}

function same(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function readCookies(header: string | undefined): Array<[string, string]> {
  if (!header) return [];
  return header.split(';').flatMap((part) => {
    const eq = part.indexOf('=');
    return eq < 0 ? [] : [[part.slice(0, eq).trim(), part.slice(eq + 1).trim()] as [string, string]];
  });
}

function isLoopbackAddress(address: string): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1';
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}
