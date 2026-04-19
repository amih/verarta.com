import type { APIRoute } from 'astro';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const START_TIME = new Date().toISOString();

function readVersion(): string {
  try {
    const versionFile = join(process.cwd(), 'VERSION');
    if (existsSync(versionFile)) {
      return readFileSync(versionFile, 'utf8').trim();
    }
  } catch {}
  return process.env.APP_VERSION || START_TIME;
}

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ version: readVersion() }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
