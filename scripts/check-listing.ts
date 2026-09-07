/**
 * Guard and parser checks for the e-commerce listing capture.
 *
 * Kept in the repository rather than thrown away, because the address classifier is a
 * security boundary: an earlier version of it silently failed to match every CIDR whose
 * first octet was 128 or above — including 169.254.0.0/16, where cloud instance metadata
 * lives — and only this table of cases caught it. Deliberately offline and deterministic
 * so it can be run on any machine at any time.
 *
 *   npx tsx scripts/check-listing.ts
 */
import { assertSafeUrlShape, isPublicAddress, UnsafeUrlError } from '@/lib/listing/guard';
import { parseListing } from '@/lib/listing/parse';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(50)} ${String(actual)}`);
}

function expectAddress(address: string, expected: boolean) {
  const actual = isPublicAddress(address);
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${address.padEnd(34)} public=${String(actual).padEnd(5)} expected=${expected}`,
  );
}

function expectUrl(url: string, shouldPass: boolean) {
  let passed = true;
  let message = '';
  try {
    assertSafeUrlShape(url);
  } catch (error) {
    passed = false;
    message = error instanceof UnsafeUrlError ? error.message : String(error);
  }
  const ok = passed === shouldPass;
  if (!ok) failures += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'}  ${url.padEnd(48)} accepted=${String(passed).padEnd(5)}` +
      `${message ? ` (${message.slice(0, 52)})` : ''}`,
  );
}

// ---------------------------------------------------------------------------
console.log('--- IPv4 classification ----------------------------------------');
expectAddress('8.8.8.8', true);
expectAddress('1.1.1.1', true);
expectAddress('142.250.195.78', true);
expectAddress('127.0.0.1', false);
expectAddress('127.4.5.6', false);
expectAddress('10.0.0.1', false);
expectAddress('10.255.255.255', false);
expectAddress('172.16.0.1', false);
expectAddress('172.31.255.255', false);
expectAddress('172.32.0.1', true); // just outside 172.16/12
expectAddress('172.15.255.255', true); // just below 172.16/12
expectAddress('192.168.1.1', false);
expectAddress('169.254.169.254', false); // cloud instance metadata
expectAddress('0.0.0.0', false);
expectAddress('100.64.0.1', false); // carrier-grade NAT
expectAddress('100.128.0.1', true); // just outside 100.64/10
expectAddress('192.0.2.1', false);
expectAddress('198.18.0.1', false);
expectAddress('198.51.100.1', false);
expectAddress('203.0.113.1', false);
expectAddress('224.0.0.1', false);
expectAddress('255.255.255.255', false);

console.log('\n--- IPv6 classification ----------------------------------------');
expectAddress('2001:4860:4860::8888', true);
expectAddress('::1', false);
expectAddress('::', false);
expectAddress('fc00::1', false);
expectAddress('fd12:3456::1', false);
expectAddress('fe80::1', false);
expectAddress('ff02::1', false);
expectAddress('2001:db8::1', false);
expectAddress('::ffff:127.0.0.1', false); // IPv4-mapped loopback
expectAddress('::ffff:192.168.0.1', false); // IPv4-mapped private
expectAddress('::ffff:8.8.8.8', true); // IPv4-mapped public
expectAddress('64:ff9b::127.0.0.1', false); // NAT64 loopback
expectAddress('0:0:0:0:0:ffff:169.254.169.254', false); // long-form mapped metadata
expectAddress('not-an-address', false);

console.log('\n--- URL shape --------------------------------------------------');
expectUrl('https://www.example.com/product/123', true);
expectUrl('https://example.co.in/p/abc?x=1#frag', true);
expectUrl('http://www.example.com/product/123', false); // not https
expectUrl('ftp://example.com/x', false);
expectUrl('file:///etc/passwd', false);
expectUrl('https://user:pass@example.com/x', false);
expectUrl('https://example.com:8080/x', false);
expectUrl('https://example.com:443/x', true);
expectUrl('https://localhost/x', false); // no dot
expectUrl('https://metadata/x', false); // no dot
expectUrl('not a url at all', false);
// IP literals must be refused here: Node skips the `lookup` hook when the host is
// already an IP, so the pinned-resolution defence never runs for them.
expectUrl('https://169.254.169.254/latest/meta-data/', false);
expectUrl('https://127.0.0.1/x', false);
expectUrl('https://10.1.2.3/x', false);
expectUrl('https://[::1]/x', false);
expectUrl('https://[fd00::1]/x', false);
expectUrl('https://8.8.8.8/x', true);
expectUrl('https://[2001:4860:4860::8888]/x', true);

// ---------------------------------------------------------------------------
console.log('\n--- Listing parser ---------------------------------------------');

const SAMPLE = `<!doctype html><html><head>
  <title>Turmeric Powder 500 g | ShopCo</title>
  <meta property="og:title" content="Sundar Foods Turmeric Powder 500 g" />
  <meta property="og:image" content="https://cdn.example.com/img/turmeric.jpg" />
  <script type="application/ld+json">
    {"@type":"Product","name":"Sundar Foods Turmeric Powder",
     "url":"https://shop.example.com/p/turmeric-500g",
     "image":[{"@type":"ImageObject","contentUrl":"https://cdn.example.com/ld/turmeric-1.jpg"}]}
  </script>
  <script>var tracking = "should-not-appear";</script>
  <style>.x{color:crimson}</style>
  </head><body>
  <h1>Sundar Foods Turmeric Powder</h1>
  <table><tr><th>Net Quantity</th><td>500 g</td></tr>
  <tr><th>MRP</th><td>&#8377;120 (inclusive of all taxes)</td></tr>
  <tr><th>Manufactured By</th><td>Sundar Foods Pvt Ltd, Plot 14, MIDC, Pune 411019</td></tr>
  <tr><th>Country of Origin</th><td>India</td></tr>
  <tr><th>Customer Care</th><td>care@sundarfoods.example / 1800-123-4567</td></tr></table>
  <div>Free delivery by tomorrow. 4.3 stars from 2,109 ratings.</div>
  <img src="/img/logo.png">
  <img srcset="/img/pack-small.jpg 400w, /img/pack-large.jpg 1200w" src="/img/pack.jpg">
  </body></html>`;

const parsed = parseListing(SAMPLE, 'https://shop.example.com/p/turmeric-500g');
const text = parsed.declarationText;

check('JSON-LD product name preferred as title', parsed.title, 'Sundar Foods Turmeric Powder');
check('script contents excluded', text.includes('should-not-appear'), false);
check('style contents excluded', text.includes('crimson'), false);
check('numeric entity decoded to rupee sign', text.includes('\u20b9120'), true);
check('og:image ranked first', parsed.imageUrls[0], 'https://cdn.example.com/img/turmeric.jpg');
check(
  'ImageObject contentUrl collected',
  parsed.imageUrls.includes('https://cdn.example.com/ld/turmeric-1.jpg'),
  true,
);
// A bare `url` on a Product is the page itself; collecting it produced a candidate
// pointing at HTML that then failed an image sniff for no reason.
check(
  'product page url NOT treated as an image',
  parsed.imageUrls.includes('https://shop.example.com/p/turmeric-500g'),
  false,
);
check(
  'largest srcset candidate resolved',
  parsed.imageUrls.includes('https://shop.example.com/img/pack-large.jpg'),
  true,
);
check('table cells not run together', text.includes('Net Quantity\n500 g'), true);
check('net quantity highlighted', parsed.highlights.some((l) => /net quantity/i.test(l)), true);
check('mrp highlighted', parsed.highlights.some((l) => /inclusive of all taxes/i.test(l)), true);
check(
  'manufacturer address highlighted',
  parsed.highlights.some((l) => /MIDC, Pune 411019/.test(l)),
  true,
);
check(
  'delivery blurb not highlighted',
  parsed.highlights.some((l) => /Free delivery/i.test(l)),
  false,
);

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
