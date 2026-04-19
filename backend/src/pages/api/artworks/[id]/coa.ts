import type { APIRoute } from 'astro';
import { join } from 'path';
import { readFile } from 'fs/promises';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { query } from '../../../../lib/db.js';
import { getTableRows } from '../../../../lib/antelope.js';

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');
const PUBLIC_BASE = process.env.PUBLIC_BASE_URL || 'https://verarta.com';
const LOGO_PATH = join(process.cwd(), 'src', 'assets', 'logo-light.svg');

// Brand colors (match frontend manifest / logo)
const BRAND_PURPLE = '#250D59';
const BRAND_LAVENDER = '#DAA5DE';

let logoPngCache: Buffer | null = null;
async function getLogoPng(): Promise<Buffer | null> {
  if (logoPngCache) return logoPngCache;
  try {
    const svg = await readFile(LOGO_PATH);
    // Rasterize at 3× for crisp print. Target final height ~32pt ≈ 128px @ 4x.
    logoPngCache = await sharp(svg, { density: 600 })
      .resize({ height: 200, withoutEnlargement: false })
      .png()
      .toBuffer();
    return logoPngCache;
  } catch (err) {
    console.warn('[coa] Failed to load logo:', err);
    return null;
  }
}

type ArtworkData = {
  id: string;
  title: string;
  thumbnail_url: string | null;
  artist_name: string | null;
  collection_name: string | null;
  era: string | null;
  creation_date: string | null;
  owner_display_name: string | null;
  owner_account: string | null;
  blockchain_tx_id: string | null;
  created_at: Date;
};

async function loadArtwork(artworkId: string): Promise<ArtworkData | null> {
  const chainResult = await getTableRows({
    code: 'verarta.core',
    scope: 'verarta.core',
    table: 'artworks',
    key_type: 'i64',
    lower_bound: artworkId,
    limit: 1,
  });
  const chainArtwork = chainResult.rows.find(
    (r: any) => String(r.artwork_id) === String(artworkId)
  );
  if (!chainArtwork) return null;

  const extrasResult = await query(
    `SELECT ae.title, ae.creation_date, ae.era, ae.thumbnail_url, ae.blockchain_tx_id,
            a.name AS artist_name, c.name AS collection_name,
            u.display_name AS owner_display_name
     FROM artwork_extras ae
     LEFT JOIN artists a ON ae.artist_id = a.id
     LEFT JOIN collections c ON ae.collection_id = c.id
     LEFT JOIN users u ON ae.user_id = u.id
     WHERE ae.blockchain_artwork_id = $1
       AND (ae.hidden = FALSE OR ae.hidden IS NULL)`,
    [artworkId]
  );
  if (extrasResult.rows.length === 0) return null;

  const e = extrasResult.rows[0];
  let title: string;
  try {
    title = e.title || atob(chainArtwork.title_encrypted);
  } catch {
    title = chainArtwork.title_encrypted;
  }

  return {
    id: String(chainArtwork.artwork_id),
    title,
    thumbnail_url: e.thumbnail_url ?? null,
    artist_name: e.artist_name ?? null,
    collection_name: e.collection_name ?? null,
    era: e.era ?? null,
    creation_date: e.creation_date ?? null,
    owner_display_name: e.owner_display_name ?? null,
    owner_account: chainArtwork.owner ?? null,
    blockchain_tx_id: e.blockchain_tx_id ?? null,
    created_at: new Date(chainArtwork.created_at * 1000),
  };
}

async function loadThumbnail(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  const prefix = '/api/uploads/';
  if (!url.startsWith(prefix)) return null;
  const relative = url.slice(prefix.length).replace(/\.\./g, '');
  const fullPath = join(UPLOADS_DIR, relative);
  if (!fullPath.startsWith(UPLOADS_DIR)) return null;
  try {
    const raw = await readFile(fullPath);
    // PDFKit only supports JPEG and PNG. Our thumbnails are WebP, so transcode.
    return await sharp(raw).png().toBuffer();
  } catch {
    return null;
  }
}

function buildPdf(
  artwork: ArtworkData,
  thumbnail: Buffer | null,
  qrDataUrl: string,
  logo: Buffer | null
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 56 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const contentWidth = pageWidth - doc.page.margins.left - doc.page.margins.right;

    // Header band (brand purple)
    const headerHeight = 80;
    doc.rect(0, 0, pageWidth, headerHeight).fill(BRAND_PURPLE);

    if (logo) {
      try {
        doc.image(logo, doc.page.margins.left, 24, { height: 32 });
      } catch {
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
          .text('VERARTA', doc.page.margins.left, 28, { width: contentWidth });
      }
    } else {
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
        .text('VERARTA', doc.page.margins.left, 28, { width: contentWidth });
    }

    doc.fillColor(BRAND_LAVENDER)
      .font('Helvetica')
      .fontSize(11)
      .text('Certificate of Authenticity', doc.page.margins.left, 58, {
        width: contentWidth,
        align: 'right',
      });

    doc.fillColor('#000000');
    let y = headerHeight + 24;

    // Artwork image
    if (thumbnail) {
      const maxWidth = contentWidth;
      const maxHeight = 220;
      try {
        doc.image(thumbnail, doc.page.margins.left, y, {
          fit: [maxWidth, maxHeight],
          align: 'center',
          valign: 'center',
        });
        y += maxHeight + 16;
      } catch {
        // Skip image entirely on decode failure — no reserved gap
      }
    }

    // Title
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111111')
      .text(artwork.title || 'Untitled', doc.page.margins.left, y, { width: contentWidth });
    y = doc.y + 8;

    // Metadata rows
    const rows: [string, string | null][] = [
      ['Artist', artwork.artist_name],
      ['Collection', artwork.collection_name],
      ['Era', artwork.era],
      ['Date of creation', artwork.creation_date],
      ['Registered by', artwork.owner_display_name || artwork.owner_account],
      ['Registered on', artwork.created_at.toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })],
      ['Artwork ID', artwork.id],
      ['Blockchain transaction', artwork.blockchain_tx_id],
    ];

    doc.font('Helvetica').fontSize(10).fillColor('#333333');
    for (const [label, value] of rows) {
      if (!value) continue;
      doc.font('Helvetica').fontSize(9).fillColor('#888888')
        .text(label.toUpperCase(), doc.page.margins.left, y, { width: contentWidth });
      y += 12;
      doc.font(label === 'Blockchain transaction' || label === 'Artwork ID' ? 'Courier' : 'Helvetica')
        .fontSize(label === 'Blockchain transaction' ? 9 : 11)
        .fillColor('#111111')
        .text(value, doc.page.margins.left, y, { width: contentWidth });
      y = doc.y + 10;
    }

    // QR code + verify caption (bottom of page)
    const qrSize = 110;
    const qrX = pageWidth - doc.page.margins.right - qrSize;
    const qrY = pageHeight - doc.page.margins.bottom - qrSize - 40;

    const qrBase64 = qrDataUrl.replace(/^data:image\/png;base64,/, '');
    const qrBuffer = Buffer.from(qrBase64, 'base64');
    doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });

    doc.font('Helvetica').fontSize(8).fillColor('#666666')
      .text('Scan to verify', qrX, qrY + qrSize + 4, { width: qrSize, align: 'center' });

    // Verify URL (text, bottom-left)
    doc.font('Helvetica').fontSize(9).fillColor('#555555')
      .text('Verify at:', doc.page.margins.left, qrY + 20);
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#111111')
      .text(`${PUBLIC_BASE}/verify/${artwork.id}`, doc.page.margins.left, qrY + 34, {
        width: contentWidth - qrSize - 20,
      });

    // Footer — keep above page bottom to avoid auto-pagination
    doc.font('Helvetica').fontSize(8).fillColor('#999999')
      .text(
        'This certificate is tamper-proof. The artwork record is stored on the Verarta blockchain and can be independently verified by anyone at the URL above.',
        doc.page.margins.left,
        pageHeight - doc.page.margins.bottom - 26,
        { width: contentWidth, align: 'center', lineBreak: true }
      );

    doc.end();
  });
}

export const GET: APIRoute = async (context) => {
  const artworkId = context.params.id;
  if (!artworkId || isNaN(Number(artworkId))) {
    return new Response('Invalid artwork ID', { status: 400 });
  }

  try {
    const artwork = await loadArtwork(artworkId);
    if (!artwork) {
      return new Response('Artwork not found or is private', { status: 404 });
    }

    const thumbnail = await loadThumbnail(artwork.thumbnail_url);
    const verifyUrl = `${PUBLIC_BASE}/verify/${artwork.id}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 400,
    });

    const logo = await getLogoPng();
    const pdf = await buildPdf(artwork, thumbnail, qrDataUrl, logo);

    const safeTitle = (artwork.title || 'artwork')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'artwork';
    const filename = `verarta-coa-${safeTitle}-${artwork.id}.pdf`;

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    console.error('COA generation error:', error);
    return new Response('Failed to generate certificate', { status: 500 });
  }
};
