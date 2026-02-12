import { query } from './db.js';
import { deleteTempFile } from './fileUpload.js';
import { getAndDelete } from './redis.js';

const ABANDONED_UPLOAD_HOURS = parseInt(
  process.env.ABANDONED_UPLOAD_HOURS || '24'
);
const CLEANUP_INTERVAL_HOURS = parseInt(
  process.env.CLEANUP_INTERVAL_HOURS || '1'
);

/**
 * Delete abandoned file uploads that were never completed
 */
export async function cleanAbandonedUploads(): Promise<number> {
  console.log('Starting cleanup of abandoned uploads...');

  try {
    // Find uploads older than threshold that haven't been completed
    const result = await query(
      `SELECT id, upload_id, temp_file_path
       FROM file_uploads
       WHERE completed_at IS NULL
       AND created_at < NOW() - INTERVAL '${ABANDONED_UPLOAD_HOURS} hours'`,
      []
    );

    const uploads = result.rows;
    let deletedCount = 0;

    for (const upload of uploads) {
      try {
        // Delete temp file
        await deleteTempFile(upload.temp_file_path);

        // Delete chunk records
        await query(
          'DELETE FROM chunk_uploads WHERE file_upload_id = $1',
          [upload.id]
        );

        // Delete upload record
        await query('DELETE FROM file_uploads WHERE id = $1', [upload.id]);

        deletedCount++;
        console.log(`Deleted abandoned upload: ${upload.upload_id}`);
      } catch (error) {
        console.error(`Failed to delete upload ${upload.upload_id}:`, error);
      }
    }

    console.log(`Cleaned up ${deletedCount} abandoned uploads`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning abandoned uploads:', error);
    throw error;
  }
}

/**
 * Delete expired sessions from database
 */
export async function cleanExpiredSessions(): Promise<number> {
  console.log('Starting cleanup of expired sessions...');

  try {
    const result = await query(
      'DELETE FROM sessions WHERE expires_at < NOW() RETURNING id',
      []
    );

    const deletedCount = result.rowCount;
    console.log(`Cleaned up ${deletedCount} expired sessions`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning expired sessions:', error);
    throw error;
  }
}

/**
 * Delete expired email verifications from database
 */
export async function cleanExpiredVerifications(): Promise<number> {
  console.log('Starting cleanup of expired email verifications...');

  try {
    const result = await query(
      'DELETE FROM email_verifications WHERE expires_at < NOW() RETURNING id',
      []
    );

    const deletedCount = result.rowCount;
    console.log(`Cleaned up ${deletedCount} expired email verifications`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning expired verifications:', error);
    throw error;
  }
}

/**
 * Delete completed uploads older than 7 days (keep temp files for recent uploads)
 */
export async function cleanOldCompletedUploads(): Promise<number> {
  console.log('Starting cleanup of old completed uploads...');

  try {
    const result = await query(
      `SELECT id, upload_id, temp_file_path
       FROM file_uploads
       WHERE completed_at IS NOT NULL
       AND completed_at < NOW() - INTERVAL '7 days'
       AND temp_file_path IS NOT NULL`,
      []
    );

    const uploads = result.rows;
    let deletedCount = 0;

    for (const upload of uploads) {
      try {
        // Only delete temp file, keep database records for audit trail
        await deleteTempFile(upload.temp_file_path);

        // Clear temp file path from record
        await query(
          'UPDATE file_uploads SET temp_file_path = NULL WHERE id = $1',
          [upload.id]
        );

        deletedCount++;
      } catch (error) {
        console.error(
          `Failed to delete temp file for upload ${upload.upload_id}:`,
          error
        );
      }
    }

    console.log(`Cleaned up ${deletedCount} old completed upload temp files`);
    return deletedCount;
  } catch (error) {
    console.error('Error cleaning old completed uploads:', error);
    throw error;
  }
}

/**
 * Run all cleanup tasks
 */
export async function runCleanup(): Promise<void> {
  console.log('=== Starting scheduled cleanup ===');
  const startTime = Date.now();

  try {
    const results = await Promise.allSettled([
      cleanAbandonedUploads(),
      cleanExpiredSessions(),
      cleanExpiredVerifications(),
      cleanOldCompletedUploads(),
    ]);

    let totalCleaned = 0;
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        totalCleaned += result.value;
      } else {
        console.error(`Cleanup task ${index} failed:`, result.reason);
      }
    });

    const duration = Date.now() - startTime;
    console.log(
      `=== Cleanup completed: ${totalCleaned} items removed in ${duration}ms ===`
    );
  } catch (error) {
    console.error('Cleanup failed:', error);
    throw error;
  }
}

/**
 * Start periodic cleanup job
 */
export function startCleanupSchedule(): void {
  const intervalMs = CLEANUP_INTERVAL_HOURS * 60 * 60 * 1000;

  console.log(
    `Starting cleanup scheduler (interval: ${CLEANUP_INTERVAL_HOURS} hours)`
  );

  // Run immediately on start
  runCleanup().catch((error) => {
    console.error('Initial cleanup failed:', error);
  });

  // Schedule periodic runs
  setInterval(() => {
    runCleanup().catch((error) => {
      console.error('Scheduled cleanup failed:', error);
    });
  }, intervalMs);
}
