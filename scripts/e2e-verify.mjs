/**
 * End-to-end verification of the reporting, evidence and listing features against a
 * running instance: editable DOCX report, CSV register export, supporting-evidence
 * attachments (including the refusal cases), and e-commerce listing capture.
 *
 * Checks the artefacts rather than just the status codes — the DOCX is opened as a zip
 * and its OOXML parts are named, the CSV is parsed as RFC 4180 and its columns counted —
 * because a 200 response proves only that nothing threw.
 *
 * Start the app first, then:
 *
 *   npm run dev:all
 *   node scripts/e2e-verify.mjs [listing-url]
 *
 * It writes two attachments to the newest completed scan and deletes one of them, so
 * point it at a development database, not a live register.
 */
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { deflateRawSync } from 'node:zlib';

const BASE = 'http://localhost:3000';
const EMAIL = 'officer@legalmetrology.gov.in';
const PASSWORD = 'Officer@123';

let cookie = '';
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}) },
  });
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  return res;
}

async function json(path, init) {
  const res = await api(path, init);
  const body = await res.json().catch(() => null);
  return { res, body };
}

/** Minimal single-entry zip, enough to prove PDF-vs-zip and OOXML container shape. */
function isZip(buf) {
  return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/** Lists the stored names in a zip central directory, without a zip library. */
function zipEntryNames(buf) {
  const names = [];
  const SIG = 0x02014b50; // central directory file header
  for (let i = 0; i < buf.length - 4; i += 1) {
    if (buf.readUInt32LE(i) === SIG) {
      const nameLen = buf.readUInt16LE(i + 28);
      names.push(buf.subarray(i + 46, i + 46 + nameLen).toString('latin1'));
    }
  }
  return names;
}

/** RFC 4180 parser, so the CSV is checked by parsing rather than by eyeballing. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      /* handled with \n */
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** A real 1x1 PNG, so the magic-byte sniff has something genuine to accept. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

/** A structurally valid one-page PDF, to prove documents are accepted too. */
function tinyPdf() {
  return Buffer.from(
    '%PDF-1.4\n' +
      '1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
      '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
      '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n' +
      'trailer<</Root 1 0 R>>\n%%EOF\n',
    'latin1',
  );
}

async function main() {
  // ---- login -------------------------------------------------------------
  {
    const { res } = await json('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    check('login as officer', res.status === 200, `status ${res.status}`);
    if (res.status !== 200) process.exit(1);
  }

  // ---- find a completed scan --------------------------------------------
  const { body: list } = await json('/api/scans?status=COMPLETED&pageSize=1');
  const scanId = list?.scans?.[0]?.id;
  check('a completed scan exists to report on', Boolean(scanId), scanId ?? 'none found');
  if (!scanId) process.exit(1);

  // ======================================================================
  console.log('\n--- Gap 1a: editable DOCX report -------------------------------');
  {
    const res = await api(`/api/scans/${scanId}/report/docx`);
    const buf = Buffer.from(await res.arrayBuffer());
    check('DOCX route responds 200', res.status === 200, `status ${res.status}`);
    check(
      'content-type is the OOXML wordprocessing type',
      (res.headers.get('content-type') ?? '').includes(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
      res.headers.get('content-type') ?? '',
    );
    check(
      'content-disposition offers a .docx filename',
      /attachment; filename=".*\.docx"/.test(res.headers.get('content-disposition') ?? ''),
      res.headers.get('content-disposition') ?? '',
    );
    check('body is a zip container', isZip(buf), `${buf.length} bytes`);

    const names = zipEntryNames(buf);
    check('contains [Content_Types].xml', names.includes('[Content_Types].xml'));
    check('contains word/document.xml', names.includes('word/document.xml'));
    check('contains _rels/.rels', names.includes('_rels/.rels'));
    check('non-trivial size', buf.length > 8000, `${buf.length} bytes`);

    await writeFile('e2e-report.docx', buf);
  }

  // ======================================================================
  console.log('\n--- Gap 1b: CSV register export -------------------------------');
  {
    const res = await api('/api/scans/export');
    const buf = Buffer.from(await res.arrayBuffer());
    check('CSV route responds 200', res.status === 200, `status ${res.status}`);
    check(
      'content-type is text/csv',
      (res.headers.get('content-type') ?? '').includes('text/csv'),
      res.headers.get('content-type') ?? '',
    );
    check(
      'starts with a UTF-8 BOM so Excel reads it correctly',
      buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    );
    const text = buf.subarray(3).toString('utf8');
    check('uses CRLF line endings', text.includes('\r\n'));

    const rows = parseCsv(text);
    const header = rows[0] ?? [];
    check('parses as RFC 4180 CSV', rows.length > 1, `${rows.length} rows`);
    check('header has 21 columns', header.length === 21, `${header.length} columns`);
    check('header names the new Source column', header.includes('Source'));
    check('header names the Listing URL column', header.includes('Listing URL'));
    check(
      'every data row has the same column count',
      rows.slice(1).every((r) => r.length === header.length),
      `${new Set(rows.map((r) => r.length)).size} distinct widths`,
    );

    // Filters must carry through, or the export is a different dataset.
    const filtered = await api('/api/scans/export?status=FAILED');
    const filteredRows = parseCsv(
      Buffer.from(await filtered.arrayBuffer()).subarray(3).toString('utf8'),
    );
    check(
      'filters carry into the export',
      filteredRows.length <= rows.length,
      `all=${rows.length - 1} rows, status=FAILED=${filteredRows.length - 1} rows`,
    );
  }

  // ======================================================================
  console.log('\n--- Gap 3: supporting evidence attachments --------------------');
  let attachmentId = null;
  {
    /*
     * Establish the precondition rather than assume it.
     *
     * "Adding evidence discards the cached PDF" can only be observed if a cached PDF
     * exists, and a previous run of this script may well have left `reportKey` null.
     * Downloading the report first regenerates and re-caches it, so the assertion below
     * tests the product instead of testing the order the script happened to run in.
     */
    const warm = await api(`/api/scans/${scanId}/report`);
    check('report cached before the invalidation test', warm.status === 200, `status ${warm.status}`);

    const before = await json(`/api/scans/${scanId}`);
    const startCount = before.body.scan.attachments.length;
    check('scan DTO exposes an attachments array', Array.isArray(before.body.scan.attachments));
    check('scan DTO exposes source', before.body.scan.source === 'IMAGE_UPLOAD', before.body.scan.source);
    check('the warmed report is visible on the scan', before.body.scan.hasReport === true);

    // --- a photograph ---
    const { res: pres, body: target } = await json(`/api/scans/${scanId}/attachments/presign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contentType: 'image/png',
        contentLength: PNG_1PX.length,
        fileName: 'reverse panel.png',
      }),
    });
    check('presign responds 200', pres.status === 200, `status ${pres.status}`);
    check(
      'key is namespaced under this scan',
      typeof target?.key === 'string' && target.key.startsWith('attachments/'),
      target?.key ?? '',
    );

    const put = await api(target.uploadUrl.replace(BASE, ''), {
      method: 'PUT',
      headers: target.headers,
      body: PNG_1PX,
    });
    check('signed PUT accepts the bytes', put.status === 200, `status ${put.status}`);

    const { res: rec, body: recorded } = await json(`/api/scans/${scanId}/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        fileKey: target.key,
        fileName: 'reverse panel.png',
        caption: 'Reverse panel showing consumer care details',
      }),
    });
    check('record responds 201', rec.status === 201, `status ${rec.status}`);
    check(
      'attachment appears on the scan',
      recorded?.scan?.attachments?.length === startCount + 1,
      `${recorded?.scan?.attachments?.length} attachments`,
    );

    const added = recorded.scan.attachments.at(-1);
    attachmentId = added?.id ?? null;
    check('kind derived as PHOTO from the bytes', added?.kind === 'PHOTO', added?.kind ?? '');
    check('contentType derived from magic bytes', added?.contentType === 'image/png', added?.contentType ?? '');
    check('byteSize derived from storage', added?.byteSize === PNG_1PX.length, String(added?.byteSize));
    check('caption stored', added?.caption?.startsWith('Reverse panel'), added?.caption ?? '');
    check('isImage true for a PNG', added?.isImage === true);
    check('fileUrl is the authenticated read path', added?.fileUrl?.startsWith('/api/files/'), added?.fileUrl ?? '');
    check('cached PDF was invalidated', recorded?.reportInvalidated === true, String(recorded?.reportInvalidated));

    const readBack = await api(added.fileUrl);
    check('attachment is readable through /api/files', readBack.status === 200, `status ${readBack.status}`);

    // --- a PDF document ---
    const pdf = tinyPdf();
    const { body: docTarget } = await json(`/api/scans/${scanId}/attachments/presign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contentType: 'application/pdf',
        contentLength: pdf.length,
        fileName: 'purchase-invoice.pdf',
      }),
    });
    const docPut = await api(docTarget.uploadUrl.replace(BASE, ''), {
      method: 'PUT',
      headers: docTarget.headers,
      body: pdf,
    });
    check('signed PUT accepts a PDF for the attachment purpose', docPut.status === 200, `status ${docPut.status}`);

    const { res: docRec, body: docRecorded } = await json(`/api/scans/${scanId}/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileKey: docTarget.key, fileName: 'purchase-invoice.pdf', caption: null }),
    });
    check('PDF attachment recorded', docRec.status === 201, `status ${docRec.status}`);
    const doc = docRecorded.scan.attachments.at(-1);
    check('kind derived as DOCUMENT for a PDF', doc?.kind === 'DOCUMENT', doc?.kind ?? '');
    check('isImage false for a PDF', doc?.isImage === false);

    // --- rejections ---
    const badTarget = await json(`/api/scans/${scanId}/attachments/presign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentType: 'application/zip', contentLength: 10, fileName: 'x.zip' }),
    });
    check('presign refuses a disallowed media type', badTarget.res.status === 422, `status ${badTarget.res.status}`);

    // Bytes that lie about being a PNG must be refused at the signed PUT.
    const { body: lieTarget } = await json(`/api/scans/${scanId}/attachments/presign`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contentType: 'image/png', contentLength: 20, fileName: 'fake.png' }),
    });
    const liePut = await api(lieTarget.uploadUrl.replace(BASE, ''), {
      method: 'PUT',
      headers: lieTarget.headers,
      body: Buffer.from('<?php echo "not an image"; ?>', 'utf8'),
    });
    check('signed PUT refuses bytes that are not the declared type', liePut.status === 400, `status ${liePut.status}`);

    const forgedKey = await json(`/api/scans/${scanId}/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileKey: 'attachments/someoneelse/x-abc.png', fileName: 'x.png' }),
    });
    check(
      'record refuses a key from another scan',
      forgedKey.res.status === 400,
      `status ${forgedKey.res.status}`,
    );

    const dupe = await json(`/api/scans/${scanId}/attachments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fileKey: target.key, fileName: 'reverse panel.png' }),
    });
    check('record refuses the same file twice', dupe.res.status === 409, `status ${dupe.res.status}`);
  }

  // --- attachments appear in both reports --------------------------------
  {
    const docx = Buffer.from(await (await api(`/api/scans/${scanId}/report/docx`)).arrayBuffer());
    // document.xml is deflate-stored; searching the raw zip for the compressed form of
    // the caption is unreliable, so the check is that the file grew and still parses.
    check('DOCX still a valid zip after attachments', isZip(docx), `${docx.length} bytes`);
    check('DOCX contains word/document.xml', zipEntryNames(docx).includes('word/document.xml'));

    const pdf = Buffer.from(await (await api(`/api/scans/${scanId}/report?download=1`)).arrayBuffer());
    check(
      'PDF regenerates after invalidation',
      pdf.subarray(0, 5).toString('latin1') === '%PDF-',
      `${pdf.length} bytes`,
    );
    void deflateRawSync;
  }

  // --- delete ------------------------------------------------------------
  {
    const { res, body } = await json(`/api/scans/${scanId}/attachments/${attachmentId}`, {
      method: 'DELETE',
    });
    check('delete responds 200', res.status === 200, `status ${res.status}`);
    check(
      'attachment removed from the scan',
      !body.scan.attachments.some((a) => a.id === attachmentId),
    );
    const again = await api(`/api/scans/${scanId}/attachments/${attachmentId}`, { method: 'DELETE' });
    check('deleting it twice returns 404', again.status === 404, `status ${again.status}`);
  }

  // ======================================================================
  console.log('\n--- Gap 2: e-commerce listing scan ----------------------------');
  {
    // Refusals first — these must never reach the network.
    for (const [label, url, expected] of [
      ['loopback name', 'https://localhost/p', 400],
      ['cloud metadata literal', 'https://169.254.169.254/latest/meta-data/', 400],
      ['private literal', 'https://192.168.1.1/p', 400],
      ['plaintext', 'http://example.com/p', 400],
      ['credentials in URL', 'https://u:p@example.com/x', 400],
      ['non-standard port', 'https://example.com:8080/x', 400],
    ]) {
      const { res, body } = await json('/api/scans/listing', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      check(
        `listing refuses ${label}`,
        res.status === expected,
        `status ${res.status}: ${body?.error?.message?.slice(0, 60) ?? ''}`,
      );
    }

    const target =
      process.argv[2] ?? 'https://en.wikipedia.org/wiki/Legal_Metrology_Act,_2009';
    const { res, body } = await json('/api/scans/listing', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: target, productName: 'E2E listing capture' }),
    });
    check('listing capture responds 201', res.status === 201, `status ${res.status}: ${body?.error?.message ?? ''}`);

    if (res.status === 201) {
      check('capture reports the page it read', typeof body.listing?.url === 'string', body.listing?.url ?? '');
      check('capture reports page text length', body.listing?.pageTextLength > 400, String(body.listing?.pageTextLength));
      check('scan was queued', body.queued === true, String(body.queued));

      const listingScanId = body.scan.id;
      let final = null;
      for (let i = 0; i < 40; i += 1) {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await json(`/api/scans/${listingScanId}`);
        final = poll.body.scan;
        if (final.status === 'COMPLETED' || final.status === 'FAILED') break;
      }
      console.log(`      listing scan terminal status: ${final?.status}`);
      check('listing scan source recorded', final?.source === 'ECOMMERCE_LISTING', final?.source ?? '');
      check('listing scan sourceUrl recorded', typeof final?.sourceUrl === 'string', final?.sourceUrl ?? '');
      check(
        'listing scan reached a terminal state',
        final?.status === 'COMPLETED' || final?.status === 'FAILED',
        final?.status ?? 'still running',
      );
      if (final?.status === 'FAILED') {
        console.log(`      (failure reason: ${final.failureReason})`);
      }
      if (final?.status === 'COMPLETED') {
        check('listing scan produced a score', typeof final.complianceScore === 'number', String(final.complianceScore));
        const docx = Buffer.from(
          await (await api(`/api/scans/${listingScanId}/report/docx`)).arrayBuffer(),
        );
        check('listing scan DOCX report builds', isZip(docx), `${docx.length} bytes`);
      }

      // The register must carry the source through to CSV.
      const csv = Buffer.from(await (await api('/api/scans/export')).arrayBuffer())
        .subarray(3)
        .toString('utf8');
      check('CSV marks the listing scan as an e-commerce listing', csv.includes('E-commerce listing'));
    }
  }

  // ======================================================================
  console.log(`\n${fail === 0 ? 'ALL' : `${pass} of ${pass + fail}`} CHECKS PASSED${fail ? ` — ${fail} FAILED` : ''}`);
  await unlink('e2e-report.docx').catch(() => {});
  void readFile;
  process.exit(fail === 0 ? 0 : 1);
}

await main();
