import puppeteer, { type Browser } from 'puppeteer';

import { env } from '@/lib/env';

/**
 * Chrome is expensive to start (roughly a second) and cheap to keep around, so
 * one browser is shared for the lifetime of the worker process and a fresh page
 * is opened per report. Pages are always closed in a `finally` block — a leaked
 * page holds a renderer process and will exhaust memory over a long shift.
 */
let browserPromise: Promise<Browser> | null = null;

async function launch(): Promise<Browser> {
  return puppeteer.launch({
    headless: true,
    ...(env.PUPPETEER_EXECUTABLE_PATH ? { executablePath: env.PUPPETEER_EXECUTABLE_PATH } : {}),
    args: [
      // Required when the worker runs inside a container as root.
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // /dev/shm is tiny in most containers; without this Chrome crashes on
      // larger documents.
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--font-render-hinting=none',
    ],
  });
}

export async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = launch().catch((error) => {
      // Reset so the next call retries rather than reusing a rejected promise.
      browserPromise = null;
      throw error;
    });
  }

  const browser = await browserPromise;
  if (!browser.connected) {
    browserPromise = null;
    return getBrowser();
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const pending = browserPromise;
  browserPromise = null;
  try {
    const browser = await pending;
    await browser.close();
  } catch {
    // Shutting down anyway.
  }
}

export interface PdfRenderOptions {
  html: string;
  footerTemplate?: string;
  headerTemplate?: string;
}

export async function renderHtmlToPdf({
  html,
  footerTemplate,
  headerTemplate,
}: PdfRenderOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // The template is fully self-contained (inline CSS, data-URI image), so no
    // network access is needed or wanted here.
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    await page.emulateMediaType('print');
    await page.evaluate(() => document.fonts.ready);

    const bytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: Boolean(footerTemplate || headerTemplate),
      headerTemplate: headerTemplate ?? '<span></span>',
      footerTemplate: footerTemplate ?? '<span></span>',
      margin: { top: '12mm', bottom: '16mm', left: '0mm', right: '0mm' },
      preferCSSPageSize: false,
    });

    return Buffer.from(bytes);
  } finally {
    await page.close().catch(() => {
      /* page may already be gone if Chrome crashed */
    });
  }
}

export class ReportRenderError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause ? { cause } : undefined);
    this.name = 'ReportRenderError';
  }
}
