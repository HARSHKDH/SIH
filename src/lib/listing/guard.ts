import { isIPv4, isIPv6 } from 'node:net';

/**
 * Server-side request forgery guard for officer-supplied listing URLs.
 *
 * This is the only place in the application where a URL chosen by a user causes the
 * server to make an outbound request, which makes it the one place where SSRF is
 * possible. The threat is concrete: an officer (or anyone who obtains an officer
 * session) submitting `http://169.254.169.254/latest/meta-data/iam/...` would otherwise
 * have the server fetch cloud instance credentials and hand them back inside a scan
 * record.
 *
 * The defence has three parts, and all three are necessary:
 *
 *   1. **Scheme and shape** — HTTPS only, no embedded credentials, no non-standard
 *      port. A plaintext fetch of an enforcement subject is also simply wrong.
 *   2. **Address filtering** — every address the hostname resolves to must be a
 *      public unicast address. Checking the hostname string is useless; `localtest.me`
 *      and countless other names resolve to 127.0.0.1 by design.
 *   3. **Pinning** — the validated address is the one actually connected to, via a
 *      custom `lookup` handed to the TLS socket. Validating and then letting the HTTP
 *      client resolve the name again would leave a DNS-rebinding window in which the
 *      second answer differs from the first.
 *
 * Redirects are re-validated hop by hop for the same reason: a public URL that 302s to
 * `http://127.0.0.1:6379` would defeat a check applied only to the URL the officer typed.
 */

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeUrlError';
  }
}

// ---------------------------------------------------------------------------
// Address classification
// ---------------------------------------------------------------------------

const ipv4ToInt = (address: string): number => {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10));
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
};

/**
 * Note the `>>> 0` on the network address as well as the mask.
 *
 * JavaScript's bitwise operators coerce to *signed* int32, so `0xac100000 & 0xfff00000`
 * evaluates to a negative number. Comparing that against an unsigned address would make
 * every range whose first octet is 128 or above silently unmatchable — which is most of
 * them, including 169.254.0.0/16 where cloud instance metadata lives.
 */
const cidr = (base: string, bits: number): [number, number] => {
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return [(ipv4ToInt(base) & mask) >>> 0, mask];
};

/**
 * Everything that is not globally routable public unicast space.
 *
 * Loopback, RFC 1918 and link-local are the obvious ones. The rest matter too:
 * 100.64/10 is carrier NAT and routes to other customers' equipment, 192.0.0/24 holds
 * protocol assignments, and the benchmarking and documentation ranges are frequently
 * bound to internal test rigs.
 */
const BLOCKED_IPV4: ReadonlyArray<readonly [number, number]> = [
  cidr('0.0.0.0', 8), // "this network" / unspecified
  cidr('10.0.0.0', 8), // RFC 1918 private
  cidr('100.64.0.0', 10), // RFC 6598 carrier-grade NAT
  cidr('127.0.0.0', 8), // loopback
  cidr('169.254.0.0', 16), // link-local — cloud instance metadata lives here
  cidr('172.16.0.0', 12), // RFC 1918 private
  cidr('192.0.0.0', 24), // IETF protocol assignments
  cidr('192.0.2.0', 24), // TEST-NET-1
  cidr('192.168.0.0', 16), // RFC 1918 private
  cidr('198.18.0.0', 15), // benchmarking
  cidr('198.51.100.0', 24), // TEST-NET-2
  cidr('203.0.113.0', 24), // TEST-NET-3
  cidr('224.0.0.0', 4), // multicast
  cidr('240.0.0.0', 4), // reserved, includes broadcast
];

/** Expands any valid IPv6 text form to its sixteen bytes. */
function ipv6Bytes(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0]; // drop any zone index

  // An IPv4-mapped or IPv4-compatible tail ("::ffff:192.168.0.1") is rewritten into
  // hextets so the whole address can be handled uniformly.
  const tail = text.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const quad = tail[1].split('.').map((part) => Number.parseInt(part, 10));
    if (quad.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((quad[0] << 8) | quad[1]).toString(16);
    const lo = ((quad[2] << 8) | quad[3]).toString(16);
    text = `${text.slice(0, tail.index ?? 0)}${hi}:${lo}`;
  }

  const [head, rest, extra] = text.split('::');
  if (extra !== undefined) return null; // more than one "::" is not a valid address

  const parse = (group: string): number[] | null => {
    if (!group) return [];
    const out: number[] = [];
    for (const hextet of group.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(hextet)) return null;
      out.push(Number.parseInt(hextet, 16));
    }
    return out;
  };

  const left = parse(head);
  const right = rest === undefined ? [] : parse(rest);
  if (left === null || right === null) return null;
  if (left.length + right.length > 8) return null;

  const hextets =
    rest === undefined
      ? left
      : [...left, ...Array<number>(8 - left.length - right.length).fill(0), ...right];

  if (hextets.length !== 8 || hextets.some((h) => h < 0)) return null;
  return hextets.flatMap((hextet) => [(hextet >> 8) & 0xff, hextet & 0xff]);
}

function isPublicIPv6(address: string): boolean {
  const bytes = ipv6Bytes(address);
  if (!bytes) return false;

  const allZero = bytes.every((byte) => byte === 0);
  if (allZero) return false; // ::
  if (bytes.slice(0, 15).every((byte) => byte === 0) && bytes[15] === 1) return false; // ::1

  if ((bytes[0] & 0xfe) === 0xfc) return false; // fc00::/7 unique local
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return false; // fe80::/10 link-local
  if (bytes[0] === 0xff) return false; // ff00::/8 multicast
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) {
    return false; // 2001:db8::/32 documentation
  }

  // IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96) carry an IPv4 address in the
  // last four bytes; that address decides, not the IPv6 wrapper.
  const embedsIPv4 =
    (bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff) ||
    (bytes[0] === 0x00 &&
      bytes[1] === 0x64 &&
      bytes[2] === 0xff &&
      bytes[3] === 0x9b &&
      bytes.slice(4, 12).every((b) => b === 0));

  if (embedsIPv4) {
    return isPublicIPv4(bytes.slice(12).join('.'));
  }

  return true;
}

function isPublicIPv4(address: string): boolean {
  if (!isIPv4(address)) return false;
  const value = ipv4ToInt(address);
  return !BLOCKED_IPV4.some(([network, mask]) => (value & mask) >>> 0 === network);
}

/** True only for a globally routable public unicast address. */
export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) return isPublicIPv4(address);
  if (isIPv6(address)) return isPublicIPv6(address);
  return false;
}

// ---------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------

/**
 * Validates the shape of a URL before any DNS work happens.
 *
 * HTTPS-only is a deliberate constraint rather than an oversight. The page being
 * captured becomes evidence in an enforcement record, and over plaintext there is no
 * assurance that what was captured is what the seller published.
 */
export function assertSafeUrlShape(input: string): URL {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new UnsafeUrlError('That is not a valid web address. Paste the full listing URL.');
  }

  if (url.protocol !== 'https:') {
    throw new UnsafeUrlError(
      'Only https:// addresses can be captured, so the page can be attributed to the seller with confidence.',
    );
  }
  if (url.username || url.password) {
    throw new UnsafeUrlError('Remove the username and password from the address.');
  }
  if (url.port && url.port !== '443') {
    throw new UnsafeUrlError('Only the standard HTTPS port is allowed.');
  }
  if (!url.hostname || url.hostname.length > 253) {
    throw new UnsafeUrlError('That address has no usable hostname.');
  }

  /*
   * An address written as a literal IP is checked here and not left to the pinned
   * lookup, because Node's socket layer skips DNS resolution altogether when the host
   * is already an IP — so the `lookup` hook never runs and never gets the chance to
   * refuse it. Without this branch, https://169.254.169.254/ would reach the connect
   * stage, which on a cloud instance is exactly where it must not get to.
   */
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (isIPv4(literal) || isIPv6(literal)) {
    if (!isPublicAddress(literal)) {
      throw new UnsafeUrlError(
        'That address points at a private or reserved network and will not be fetched.',
      );
    }
    return url;
  }

  // A bare hostname with no dot is either a local machine name or a search term.
  if (!url.hostname.includes('.')) {
    throw new UnsafeUrlError('Enter a full public address, for example https://example.com/product/123.');
  }

  return url;
}
