import { lookup as dnsLookup } from 'node:dns';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import type { LookupAddress, LookupOptions } from 'node:dns';
import type { LookupFunction } from 'node:net';

import { assertSafeUrlShape, isPublicAddress, UnsafeUrlError } from './guard';

/**
 * A deliberately small HTTPS client for fetching officer-supplied listing URLs.
 *
 * `fetch()` is not used here, and the reason is the security model rather than taste:
 * global fetch gives no hook to pin the resolved address, so between validating a
 * hostname and fetching it the name could resolve differently (DNS rebinding). Node's
 * `https.request` accepts a custom `lookup`, which lets the same address that passed
 * validation be the address actually connected to.
 *
 * Everything else here exists to make an untrusted remote server unable to harm this
 * process: a byte ceiling enforced while streaming (not from `Content-Length`, which a
 * hostile server can lie about), a wall-clock deadline, a redirect budget with every
 * hop re-validated, and no request body or cookies ever sent.
 */

/** Identifies the tool honestly. A seller checking their logs should see who called. */
const USER_AGENT =
  'LegalMetrologyComplianceChecker/1.0 (+Department of Consumer Affairs; compliance verification)';

const MAX_REDIRECTS = 4;

export interface FetchLimits {
  maxBytes: number;
  timeoutMs: number;
}

export interface FetchedResource {
  /** The URL finally served, after any redirects. */
  url: string;
  status: number;
  contentType: string | null;
  body: Buffer;
  truncated: boolean;
}

/**
 * A `lookup` implementation that only ever yields addresses which passed the guard.
 *
 * This closes the rebinding window: the socket cannot be pointed at an address this
 * function did not approve, because this function is the only source of addresses.
 */
const pinnedLookup: LookupFunction = (
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void => {
  dnsLookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) {
      callback(error, '', undefined);
      return;
    }

    const safe = addresses.filter((entry) => isPublicAddress(entry.address));

    if (safe.length === 0) {
      callback(
        new UnsafeUrlError(
          `${hostname} resolves to an address on a private or reserved network, so it will not be fetched.`,
        ) as NodeJS.ErrnoException,
        '',
        undefined,
      );
      return;
    }

    // `all` is honoured when the caller asked for it, which net.connect does when it
    // wants to try several addresses; otherwise the first approved address is used.
    if (options?.all === true) {
      callback(null, safe);
      return;
    }
    callback(null, safe[0].address, safe[0].family);
  });
};

function requestOnce(
  url: URL,
  limits: FetchLimits,
  accept: string,
  deadline: number,
): Promise<{ resource: FetchedResource } | { redirectTo: string }> {
  return new Promise((resolve, reject) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      reject(new UnsafeUrlError('The page took too long to respond.'));
      return;
    }

    const options: RequestOptions = {
      method: 'GET',
      // A hostile server cannot make us follow a redirect it did not send, but it can
      // stall; both the socket and the overall deadline are bounded.
      timeout: Math.min(remaining, 10_000),
      lookup: pinnedLookup,
      headers: {
        accept,
        'accept-language': 'en-IN,en;q=0.9',
        'user-agent': USER_AGENT,
        // No cookies, no referer: this request must carry no ambient authority.
      },
    };

    const req = httpsRequest(url, options, (res) => {
      const status = res.statusCode ?? 0;

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume(); // discard the body; we only wanted the header
        resolve({ redirectTo: new URL(res.headers.location, url).toString() });
        return;
      }

      const chunks: Buffer[] = [];
      let received = 0;
      let truncated = false;

      res.on('data', (chunk: Buffer) => {
        // The ceiling is applied to bytes actually received. Trusting Content-Length
        // would let a server declare 1 KB and stream indefinitely.
        if (received >= limits.maxBytes) return;
        const room = limits.maxBytes - received;
        if (chunk.length > room) {
          chunks.push(chunk.subarray(0, room));
          received += room;
          truncated = true;
          res.destroy();
          return;
        }
        chunks.push(chunk);
        received += chunk.length;
      });

      res.on('end', () =>
        resolve({
          resource: {
            url: url.toString(),
            status,
            contentType: res.headers['content-type'] ?? null,
            body: Buffer.concat(chunks),
            truncated,
          },
        }),
      );

      // A destroy triggered by the size cap is a success, not a failure: what was
      // read is still usable, and for an HTML page the head is the useful part.
      res.on('close', () => {
        if (truncated) {
          resolve({
            resource: {
              url: url.toString(),
              status,
              contentType: res.headers['content-type'] ?? null,
              body: Buffer.concat(chunks),
              truncated,
            },
          });
        }
      });

      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new UnsafeUrlError('The page took too long to respond.'));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetches a URL, following redirects, with every hop re-validated.
 *
 * A public URL that redirects to `https://127.0.0.1` is the standard way to walk past
 * a check applied only to the address the user typed, so `assertSafeUrlShape` runs
 * again on each `Location` and the pinned lookup runs again on each connection.
 */
export async function fetchPublicResource(
  rawUrl: string,
  limits: FetchLimits,
  accept: string,
): Promise<FetchedResource> {
  const deadline = Date.now() + limits.timeoutMs;
  let current = assertSafeUrlShape(rawUrl);
  const seen = new Set<string>([current.toString()]);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const result = await requestOnce(current, limits, accept, deadline);

    if ('resource' in result) {
      if (result.resource.status !== 200) {
        throw new UnsafeUrlError(
          `The page responded with HTTP ${result.resource.status}. Check the address, or capture the listing as a photograph instead.`,
        );
      }
      return result.resource;
    }

    if (seen.has(result.redirectTo)) {
      throw new UnsafeUrlError('That address redirects in a loop.');
    }
    seen.add(result.redirectTo);
    current = assertSafeUrlShape(result.redirectTo);
  }

  throw new UnsafeUrlError('That address redirects too many times.');
}
