/**
 * Generates the static image assets committed to `public/`:
 *
 *   - PWA icons (192, 512, maskable 512)
 *   - Six mock package labels used by the seed script
 *
 * Puppeteer is already a dependency for PDF rendering, so it doubles as the image
 * pipeline here — no `sharp`, no ImageMagick, no binary assets pasted into the repo
 * that nobody can regenerate. Run with:
 *
 *   npx tsx scripts/generate-assets.ts
 *
 * Each mock label is drawn to match the declarations the corresponding extraction
 * archetype reports, so the seeded demo is internally consistent: the label that the
 * app says is missing an MRP genuinely has no MRP printed on it.
 */
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import puppeteer, { type Browser } from 'puppeteer';

import { palette } from '../src/lib/design/tokens';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');
const ICONS_DIR = path.join(PUBLIC_DIR, 'icons');
const SAMPLES_DIR = path.join(PUBLIC_DIR, 'samples');

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function iconHtml(size: number, maskable: boolean): string {
  // Maskable icons are cropped to a circle by the platform, so the mark is scaled
  // down to sit inside the 80% safe zone.
  const inset = maskable ? size * 0.14 : 0;
  const mark = size - inset * 2;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
  .plate{
    width:${size}px;height:${size}px;background:${palette.brand};
    display:flex;align-items:center;justify-content:center;
    ${maskable ? '' : `border-radius:${Math.round(size * 0.18)}px;`}
  }
  .mark{
    width:${mark}px;height:${mark}px;display:flex;flex-direction:column;
    align-items:center;justify-content:center;color:#fff;
    font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
  }
  .letters{font-size:${Math.round(mark * 0.4)}px;font-weight:700;letter-spacing:-0.02em;line-height:1}
  .rule{width:${Math.round(mark * 0.4)}px;height:${Math.max(2, Math.round(mark * 0.022))}px;
        background:rgba(255,255,255,0.55);margin:${Math.round(mark * 0.06)}px 0}
  .caption{font-size:${Math.round(mark * 0.1)}px;font-weight:600;letter-spacing:0.14em;
           text-transform:uppercase;color:rgba(255,255,255,0.75)}
</style></head>
<body><div class="plate"><div class="mark">
  <div class="letters">LM</div>
  <div class="rule"></div>
  <div class="caption">Verified</div>
</div></div></body></html>`;
}

async function renderIcon(browser: Browser, size: number, file: string, maskable: boolean) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(iconHtml(size, maskable), { waitUntil: 'load' });
    await page.screenshot({ path: path.join(ICONS_DIR, file), omitBackground: !maskable });
  } finally {
    await page.close();
  }
  console.log(`icon  ${file}`);
}

// ---------------------------------------------------------------------------
// Mock package labels
// ---------------------------------------------------------------------------

interface LabelSpec {
  file: string;
  /** Matches the extraction archetype name in src/lib/extraction/mock.ts. */
  archetype: string;
  brand: string;
  brandColor: string;
  accentColor: string;
  product: string;
  variant: string;
  netQuantity: string | null;
  mrp: string | null;
  unitPrice: string | null;
  date: string | null;
  manufacturer: string | null;
  consumerCare: string | null;
  origin: string | null;
  /** Renders the mandatory block in near-illegible type. */
  tinyPrint?: boolean;
  secondaryLanguage?: string;
}

const LABELS: LabelSpec[] = [
  {
    file: 'label-turmeric-pouch.png',
    archetype: 'compliant-retail-pouch',
    brand: 'SUNDAR',
    brandColor: '#7B341E',
    accentColor: '#B7791F',
    product: 'Turmeric Powder',
    variant: 'Double Polished · Salem',
    netQuantity: 'Net Qty: 500 g',
    mrp: 'MRP Rs. 185.00 (inclusive of all taxes)',
    unitPrice: 'Unit Sale Price: Rs. 370 per kg',
    date: 'MFD: 02/2026',
    manufacturer:
      'Manufactured by: Sundar Foods Pvt. Ltd., Plot 44, MIDC Industrial Area, Pune, Maharashtra 411026',
    consumerCare: 'Consumer Care: care@sundarfoods.in | 1800-233-1188',
    origin: 'Country of Origin: India',
    secondaryLanguage: 'हल्दी पाउडर',
  },
  {
    file: 'label-basmati-rice.png',
    archetype: 'missing-mrp-and-care',
    brand: 'GREENLEAF',
    brandColor: '#22543D',
    accentColor: '#2F6E4E',
    product: 'Basmati Rice',
    variant: 'Aged 12 Months · Extra Long Grain',
    netQuantity: '1 kg',
    mrp: null,
    unitPrice: null,
    date: 'Packed on: 14 JAN 2026',
    manufacturer:
      'Packed by: Greenleaf Agro Industries, Survey No. 91/2, Hosur Road, Bengaluru, Karnataka 560100',
    consumerCare: null,
    origin: 'Made in India',
  },
  {
    file: 'label-sparkling-water.png',
    archetype: 'illegible-small-print',
    brand: 'ANANDI',
    brandColor: '#2A4365',
    accentColor: '#2C5282',
    product: 'Sparkling Water',
    variant: 'Lemon · Naturally Carbonated',
    netQuantity: '750 ml',
    mrp: 'M.R.P. Rs. 60/-',
    unitPrice: null,
    date: 'MFD 11/2025',
    manufacturer: 'Mfd by Anandi Beverages Ltd., Unit II, Baddi, Solan, Himachal Pradesh 173205',
    consumerCare: 'consumer.care@anandibev.co.in',
    origin: 'India',
    tinyPrint: true,
  },
  {
    file: 'label-smoked-salmon.png',
    archetype: 'imported-no-origin',
    brand: 'FJORDLINE',
    brandColor: '#1A365D',
    accentColor: '#9B2C2C',
    product: 'Smoked Salmon',
    variant: 'Cold Smoked · Sliced',
    netQuantity: 'Net weight 250 g',
    mrp: 'MRP INR 640',
    unitPrice: null,
    date: null,
    manufacturer: 'Fjordline Seafoods AS',
    consumerCare: 'support@fjordline.example',
    origin: null,
    secondaryLanguage: 'Røkt laks',
  },
  {
    file: 'label-nilgiri-tea.png',
    archetype: 'minor-defects-tea-pack',
    brand: 'NILGIRI ESTATE',
    brandColor: '#234E52',
    accentColor: '#2F6E4E',
    product: 'Orange Pekoe Tea',
    variant: 'Single Estate · Hand Picked',
    netQuantity: 'Net Qty. 250 g',
    mrp: 'MRP Rs. 320',
    unitPrice: null,
    date: 'PKD: 03/2026',
    manufacturer:
      'Manufactured & packed by: Nilgiri Estate Teas Pvt. Ltd., Door No. 12/4, Coonoor Road, Ooty, Tamil Nadu 643001',
    consumerCare: 'Consumer Care: grievance@nilgiriteas.in, Tel 1800-425-7788',
    origin: 'Country of Origin: India',
    secondaryLanguage: 'நீலகிரி தேயிலை',
  },
  {
    file: 'label-gel-pens.png',
    archetype: 'unitless-quantity',
    brand: 'NOVA',
    brandColor: '#44337A',
    accentColor: '#2C5282',
    product: 'Gel Ink Pens',
    variant: '0.7 mm · Assorted Colours',
    netQuantity: 'Net Qty: 12',
    mrp: 'MRP Rs. 249 incl. of all taxes',
    unitPrice: null,
    date: 'MFG: 12/25',
    manufacturer:
      'Marketed by: Nova Retail Brands, 3rd Floor, Cyber Towers, Hyderabad, Telangana 500081',
    consumerCare: 'Customer Care: 1800-102-9000',
    origin: 'Country of Origin: India',
  },
];

function labelHtml(spec: LabelSpec): string {
  const smallSize = spec.tinyPrint ? '5.5px' : '9px';
  const smallColor = spec.tinyPrint ? '#5a6472' : '#2d3748';

  const line = (value: string | null) =>
    value ? `<div class="decl">${escapeHtml(value)}</div>` : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><style>
  html,body{margin:0;padding:0}
  body{width:720px;height:900px;font-family:Inter,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;
       background:#d9dde3;display:flex;align-items:center;justify-content:center}
  /* A slight rotation and a soft shadow so the result reads as a photographed
     package rather than a flat mock-up. */
  .pack{width:600px;height:790px;background:#fdfdfc;border-radius:10px;overflow:hidden;
        box-shadow:0 18px 40px -12px rgba(20,25,35,0.45);transform:rotate(-0.7deg);
        display:flex;flex-direction:column}
  .top{background:${spec.brandColor};color:#fff;padding:26px 28px 22px}
  .brand{font-size:26px;font-weight:800;letter-spacing:0.16em}
  .rule{height:3px;width:64px;background:${spec.accentColor};margin:12px 0 14px}
  .product{font-size:40px;font-weight:700;line-height:1.08;letter-spacing:-0.02em}
  .variant{margin-top:8px;font-size:13px;font-weight:500;color:rgba(255,255,255,0.72)}
  .second{margin-top:10px;font-size:19px;font-weight:600;color:rgba(255,255,255,0.9)}

  .middle{flex:1;display:flex;align-items:center;justify-content:center;
          background:linear-gradient(180deg,#fdfdfc 0%,#f2f1ee 100%);padding:20px 28px}
  .plate{width:100%;border:1px dashed #cbd2da;border-radius:8px;padding:22px 20px;text-align:center}
  .qty{font-size:${spec.netQuantity && spec.netQuantity.length > 12 ? '30px' : '42px'};
       font-weight:700;color:#1a202c;letter-spacing:-0.02em}
  .qty-missing{font-size:15px;color:#a0aab8;font-style:italic}
  .price{margin-top:16px;font-size:20px;font-weight:600;color:${spec.brandColor}}
  .price-missing{margin-top:16px;font-size:13px;color:#a0aab8;font-style:italic}
  .unit{margin-top:6px;font-size:12px;color:#4a5568}

  .bottom{background:#fdfdfc;border-top:1px solid #e6e6e2;padding:18px 28px 22px}
  .bottom-title{font-size:8px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;
                color:#8f98a6;margin-bottom:8px}
  .decl{font-size:${smallSize};line-height:1.55;color:${smallColor};margin-bottom:3px}
  .barcode{margin-top:14px;display:flex;align-items:flex-end;gap:1.5px;height:34px}
  .barcode span{display:block;background:#1a202c;width:2px}
</style></head>
<body>
  <div class="pack">
    <div class="top">
      <div class="brand">${escapeHtml(spec.brand)}</div>
      <div class="rule"></div>
      <div class="product">${escapeHtml(spec.product)}</div>
      <div class="variant">${escapeHtml(spec.variant)}</div>
      ${spec.secondaryLanguage ? `<div class="second">${escapeHtml(spec.secondaryLanguage)}</div>` : ''}
    </div>

    <div class="middle">
      <div class="plate">
        ${
          spec.netQuantity
            ? `<div class="qty">${escapeHtml(spec.netQuantity)}</div>`
            : '<div class="qty-missing">no net quantity printed</div>'
        }
        ${
          spec.mrp
            ? `<div class="price">${escapeHtml(spec.mrp)}</div>`
            : '<div class="price-missing">no retail sale price printed</div>'
        }
        ${spec.unitPrice ? `<div class="unit">${escapeHtml(spec.unitPrice)}</div>` : ''}
      </div>
    </div>

    <div class="bottom">
      <div class="bottom-title">Mandatory declarations</div>
      ${line(spec.manufacturer)}
      ${line(spec.date)}
      ${line(spec.consumerCare)}
      ${line(spec.origin)}
      <div class="barcode">${barcode()}</div>
    </div>
  </div>
</body></html>`;
}

/** Deterministic pseudo-barcode; purely visual. */
function barcode(): string {
  let out = '';
  let seed = 7;
  for (let i = 0; i < 46; i += 1) {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    const height = 18 + (seed % 17);
    out += `<span style="height:${height}px"></span>`;
  }
  return out;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}

async function renderLabel(browser: Browser, spec: LabelSpec) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 720, height: 900, deviceScaleFactor: 1 });
    await page.setContent(labelHtml(spec), { waitUntil: 'load' });
    await page.screenshot({ path: path.join(SAMPLES_DIR, spec.file), type: 'png' });
  } finally {
    await page.close();
  }
  console.log(`label ${spec.file}  (${spec.archetype})`);
}

/** Exported so the seed script can pair each image with its extraction archetype. */
export const SAMPLE_LABELS = LABELS.map((label) => ({
  file: label.file,
  archetype: label.archetype,
  product: `${label.brand.split(' ')[0]} ${label.product}${
    label.netQuantity ? ` ${label.netQuantity.replace(/^[^0-9]*/, '')}` : ''
  }`.trim(),
}));

async function main() {
  await mkdir(ICONS_DIR, { recursive: true });
  await mkdir(SAMPLES_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
  });

  try {
    await renderIcon(browser, 192, 'icon-192.png', false);
    await renderIcon(browser, 512, 'icon-512.png', false);
    await renderIcon(browser, 512, 'icon-maskable-512.png', true);

    for (const spec of LABELS) {
      await renderLabel(browser, spec);
    }
  } finally {
    await browser.close();
  }

  console.log(`\nWrote 3 icons and ${LABELS.length} sample labels.`);
}

// Only run when invoked directly, so the seed script can import SAMPLE_LABELS.
if (process.argv[1] && process.argv[1].includes('generate-assets')) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
