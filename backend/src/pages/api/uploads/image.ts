import type { APIRoute } from 'astro';
import { requireAuth } from '../../../middleware/auth.js';
import { query } from '../../../lib/db.js';
import sharp from 'sharp';
import { createHash } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

export const POST: APIRoute = async (context) => {
  const authResult = await requireAuth(context);
  if (authResult) return authResult;

  const user = (context as any).user;

  try {
    const body = await context.request.json();
    const { image, type, artwork_id } = body;

    if (!image || !type) {
      return new Response(JSON.stringify({ error: 'Missing image or type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!['thumbnail', 'profile', 'cover'].includes(type)) {
      return new Response(JSON.stringify({ error: 'Invalid type' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Decode base64 image
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    // Resize based on type
    let processed: Buffer;
    if (type === 'thumbnail') {
      processed = await sharp(buffer)
        .resize(600, undefined, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    } else if (type === 'profile') {
      processed = await sharp(buffer)
        .resize(400, 400, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();
    } else {
      // cover
      processed = await sharp(buffer)
        .resize(1200, undefined, { withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
    }

    // Generate filename from hash
    const hash = createHash('sha256').update(processed).digest('hex').slice(0, 16);
    const filename = `${hash}.webp`;
    const subdir = `${type}s`;
    const dirPath = join(UPLOADS_DIR, subdir);
    await mkdir(dirPath, { recursive: true });
    await writeFile(join(dirPath, filename), processed);

    const url = `/api/uploads/${subdir}/${filename}`;

    // Update DB based on type
    if (type === 'thumbnail' && artwork_id) {
      await query(
        `INSERT INTO artwork_extras(blockchain_artwork_id, user_id, thumbnail_url, updated_at)
         VALUES($1, $2, $3, NOW())
         ON CONFLICT (blockchain_artwork_id, user_id)
         DO UPDATE SET thumbnail_url = EXCLUDED.thumbnail_url, updated_at = NOW()`,
        [artwork_id, user.userId, url]
      );
    } else if (type === 'profile') {
      await query('UPDATE users SET profile_image_url = $1 WHERE id = $2', [url, user.userId]);
    } else if (type === 'cover') {
      await query('UPDATE users SET cover_image_url = $1 WHERE id = $2', [url, user.userId]);
    }

    return new Response(JSON.stringify({ url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Image upload error:', error);
    return new Response(JSON.stringify({ error: 'Failed to upload image' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
