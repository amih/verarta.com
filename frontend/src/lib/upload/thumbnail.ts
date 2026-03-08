/**
 * Client-side thumbnail generation for PDF and text files.
 * Must be called before encryption — operates on the raw file.
 */

const THUMB_WIDTH = 400;
const THUMB_HEIGHT = 300;

export async function generateThumbnail(file: File): Promise<File | null> {
  try {
    if (file.type === 'application/pdf') {
      return await generatePdfThumbnail(file);
    }
    if (file.type === 'text/plain' || file.type === 'application/json') {
      return await generateTextThumbnail(file);
    }
    return null;
  } catch {
    return null;
  }
}

const PUBLIC_THUMB_WIDTH = 600;

/**
 * Generate an unencrypted public thumbnail for image files.
 * Returns a base64 data URL suitable for uploading to the public thumbnail endpoint.
 */
export async function generatePublicThumbnail(file: File): Promise<string | null> {
  try {
    if (!file.type.startsWith('image/')) return null;

    const img = await createImageBitmap(file);
    const scale = Math.min(1, PUBLIC_THUMB_WIDTH / img.width);
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, width, height);

    return canvas.toDataURL('image/webp', 0.8);
  } catch {
    return null;
  }
}

async function generatePdfThumbnail(file: File): Promise<File | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const page = await pdf.getPage(1);

    // Scale so the page fits within THUMB_WIDTH x THUMB_HEIGHT
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(THUMB_WIDTH / viewport.width, THUMB_HEIGHT / viewport.height);
    const scaled = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = scaled.width;
    canvas.height = scaled.height;
    const ctx = canvas.getContext('2d')!;

    await page.render({ canvasContext: ctx, viewport: scaled } as any).promise;

    return await canvasToFile(canvas, `thumb_${file.name}.png`);
  } catch {
    return null;
  }
}

async function generateTextThumbnail(file: File): Promise<File | null> {
  try {
    const text = await file.text();
    const preview = text.slice(0, 800);

    const canvas = document.createElement('canvas');
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);

    ctx.fillStyle = '#1a1a1a';
    ctx.font = '12px monospace';

    const lineHeight = 18;
    const maxWidth = THUMB_WIDTH - 30;
    const lines = wrapText(ctx, preview, maxWidth);
    const maxLines = Math.floor((THUMB_HEIGHT - 30) / lineHeight);

    lines.slice(0, maxLines).forEach((line, i) => {
      ctx.fillText(line, 15, 20 + (i + 1) * lineHeight);
    });

    return await canvasToFile(canvas, `thumb_${file.name}.png`);
  } catch {
    return null;
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const result: string[] = [];
  for (const raw of text.split('\n')) {
    const words = raw.split(' ');
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && current) {
        result.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    result.push(current);
  }
  return result;
}

function canvasToFile(canvas: HTMLCanvasElement, name: string): Promise<File | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(null); return; }
      resolve(new File([blob], name, { type: 'image/png' }));
    }, 'image/png');
  });
}
