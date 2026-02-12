import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const TEMP_UPLOAD_DIR = process.env.TEMP_UPLOAD_DIR || '/tmp/verarta-uploads';
const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE || '262144'); // 256 KB default

// Ensure upload directory exists
export async function ensureUploadDir(): Promise<void> {
  try {
    await fs.mkdir(TEMP_UPLOAD_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create upload directory:', error);
    throw error;
  }
}

// Save base64 file data to temporary file
export async function saveTempFile(
  uploadId: string,
  fileData: string
): Promise<string> {
  await ensureUploadDir();

  const filePath = path.join(TEMP_UPLOAD_DIR, uploadId);
  const buffer = Buffer.from(fileData, 'base64');

  await fs.writeFile(filePath, buffer);

  return filePath;
}

// Read a specific chunk from a file
export async function readChunk(
  filePath: string,
  chunkIndex: number
): Promise<Buffer> {
  const fileHandle = await fs.open(filePath, 'r');

  try {
    const offset = chunkIndex * CHUNK_SIZE;
    const buffer = Buffer.alloc(CHUNK_SIZE);

    const { bytesRead } = await fileHandle.read(buffer, 0, CHUNK_SIZE, offset);

    // Return only the bytes actually read
    return buffer.slice(0, bytesRead);
  } finally {
    await fileHandle.close();
  }
}

// Calculate SHA256 hash of entire file
export async function calculateFileHash(filePath: string): Promise<string> {
  const fileBuffer = await fs.readFile(filePath);
  const hash = crypto.createHash('sha256');
  hash.update(fileBuffer);
  return hash.digest('hex');
}

// Calculate total number of chunks for a file
export function calculateTotalChunks(fileSize: number): number {
  return Math.ceil(fileSize / CHUNK_SIZE);
}

// Get file size
export async function getFileSize(filePath: string): Promise<number> {
  const stats = await fs.stat(filePath);
  return stats.size;
}

// Delete temporary file
export async function deleteTempFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as any).code !== 'ENOENT') {
      console.error('Failed to delete temp file:', error);
      throw error;
    }
  }
}

// Check if file exists
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

// Get chunk size constant
export function getChunkSize(): number {
  return CHUNK_SIZE;
}
