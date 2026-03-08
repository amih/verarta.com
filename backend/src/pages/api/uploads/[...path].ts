import type { APIRoute } from 'astro';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

const MIME_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
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
    return new Response('Not found', { status: 404 });
  }
};
