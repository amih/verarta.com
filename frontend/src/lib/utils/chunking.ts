const CHUNK_SIZE = 256 * 1024; // 256 KB — matches backend CHUNK_SIZE

export { CHUNK_SIZE };

/**
 * Split a Uint8Array (or ArrayBuffer) into 256 KB chunks.
 */
export function chunkBuffer(data: Uint8Array): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  while (offset < data.length) {
    chunks.push(data.slice(offset, offset + CHUNK_SIZE));
    offset += CHUNK_SIZE;
  }
  return chunks;
}

/**
 * Calculate how many chunks a file of the given size will produce.
 */
export function calculateTotalChunks(byteLength: number): number {
  return Math.ceil(byteLength / CHUNK_SIZE);
}

/**
 * Convert a Uint8Array to a base64 string.
 */
export function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert a base64 string back to a Uint8Array.
 */
export function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Read a File object into an ArrayBuffer.
 */
export function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Convert an entire file to base64 (for upload-init which takes base64 file_data).
 */
export async function fileToBase64(file: File): Promise<string> {
  const buffer = await readFileAsArrayBuffer(file);
  return uint8ToBase64(new Uint8Array(buffer));
}
