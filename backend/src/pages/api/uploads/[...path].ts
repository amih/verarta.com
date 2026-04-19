import type { APIRoute } from 'astro';
import { readFile } from 'fs/promises';
import { join, extname, basename } from 'path';
import { query } from '../../../lib/db.js';
import { generateCachedThumbnail } from '../../../lib/thumbnailCache.js';

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(process.cwd(), 'uploads');

const MIME_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
};

export const GET: APIRoute = async (context) => {
  try {
    const filePath = context.params.path;
    if (!filePath) {
      return new Response('Not found', { status: 404 });
    }

    // Prevent directory traversal
    const normalized = filePath.replace(/\.\./g, '');
    const fullPath = join(UPLOADS_DIR, normalized);

    if (!fullPath.startsWith(UPLOADS_DIR)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const data = await readFile(fullPath);
      const ext = extname(fullPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    } catch {
      // File not on disk — try to regenerate from blockchain if it's a thumbnail
      if (!normalized.startsWith('thumbnails/')) {
        return new Response('Not found', { status: 404 });
      }

      const requestedFilename = basename(normalized);
      const requestedUrl = `/api/uploads/${normalized}`;

      // Find which artwork this thumbnail belongs to
      const result = await query(
        `SELECT blockchain_artwork_id FROM artwork_extras
         WHERE thumbnail_url = $1 AND (hidden = FALSE OR hidden IS NULL)
         LIMIT 1`,
        [requestedUrl]
      );

      if (result.rows.length === 0) {
        return new Response('Not found', { status: 404 });
      }

      const artworkId = String(result.rows[0].blockchain_artwork_id);
      const newUrl = await generateCachedThumbnail(artworkId);

      if (!newUrl) {
        return new Response('Not found', { status: 404 });
      }

      // Update the DB if the generated file has a different hash/name
      if (newUrl !== requestedUrl) {
        await query(
          `UPDATE artwork_extras SET thumbnail_url = $1, updated_at = NOW()
           WHERE blockchain_artwork_id = $2`,
          [newUrl, artworkId]
        );
      }

      // Serve the newly generated file
      const newFilename = basename(newUrl);
      const newFullPath = join(UPLOADS_DIR, 'thumbnails', newFilename);
      const data = await readFile(newFullPath);

      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
  } catch {
    return new Response('Not found', { status: 404 });
  }
};
