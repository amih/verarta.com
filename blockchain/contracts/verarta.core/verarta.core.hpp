#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/crypto.hpp>
#include <eosio/time.hpp>

using namespace eosio;

namespace verarta {

class [[eosio::contract("verarta.core")]] verartatoken : public contract {
public:
   using contract::contract;

   // ========== ACTIONS ==========

   /**
    * Create artwork record
    * @param artwork_id - Unique artwork ID
    * @param owner - Owner account
    * @param title_encrypted - Encrypted title (base64)
    * @param description_encrypted - Encrypted description (base64)
    * @param metadata_encrypted - Encrypted JSON metadata (base64)
    * @param creator_public_key - Creator's X25519 public key for encryption
    */
   [[eosio::action]]
   void createart(
      uint64_t artwork_id,
      name owner,
      std::string title_encrypted,
      std::string description_encrypted,
      std::string metadata_encrypted,
      std::string creator_public_key
   );

   /**
    * Add file to artwork with encrypted DEK
    * @param file_id - Unique file ID
    * @param artwork_id - Parent artwork ID
    * @param owner - Owner account
    * @param filename_encrypted - Encrypted filename
    * @param mime_type - File MIME type (plaintext for filtering)
    * @param file_size - Total file size in bytes
    * @param file_hash - SHA256 hash of complete file
    * @param encrypted_dek - DEK encrypted with user's public key
    * @param admin_encrypted_deks - Array of DEKs encrypted with admin keys
    * @param iv - Initialization vector for AES-GCM
    * @param auth_tag - Authentication tag for AES-GCM
    * @param is_thumbnail - Whether this is a thumbnail
    */
   [[eosio::action]]
   void addfile(
      uint64_t file_id,
      uint64_t artwork_id,
      name owner,
      std::string filename_encrypted,
      std::string mime_type,
      uint64_t file_size,
      checksum256 file_hash,
      std::string encrypted_dek,
      std::vector<std::string> admin_encrypted_deks,
      std::string iv,
      std::string auth_tag,
      bool is_thumbnail
   );

   /**
    * Upload file chunk
    * @param chunk_id - Unique chunk ID
    * @param file_id - Parent file ID
    * @param owner - Owner account
    * @param chunk_index - Zero-based chunk index
    * @param chunk_data - Encrypted chunk data (base64)
    * @param chunk_size - Size of this chunk in bytes
    */
   [[eosio::action]]
   void uploadchunk(
      uint64_t chunk_id,
      uint64_t file_id,
      name owner,
      uint32_t chunk_index,
      std::string chunk_data,
      uint32_t chunk_size
   );

   /**
    * Mark file upload as complete
    * @param file_id - File ID to mark complete
    * @param owner - Owner account
    * @param total_chunks - Total number of chunks uploaded
    */
   [[eosio::action]]
   void completefile(
      uint64_t file_id,
      name owner,
      uint32_t total_chunks
   );

   /**
    * Set user quota limits
    * @param account - User account
    * @param tier - Quota tier (0=free, 1=premium)
    * @param daily_file_limit - Daily file count limit
    * @param daily_size_limit - Daily size limit in bytes
    * @param weekly_file_limit - Weekly file count limit
    * @param weekly_size_limit - Weekly size limit in bytes
    */
   [[eosio::action]]
   void setquota(
      name account,
      uint8_t tier,
      uint32_t daily_file_limit,
      uint64_t daily_size_limit,
      uint32_t weekly_file_limit,
      uint64_t weekly_size_limit
   );

   /**
    * Add admin public key for key escrow
    * @param admin_account - Admin account
    * @param public_key - X25519 public key (base64)
    * @param description - Key description/purpose
    */
   [[eosio::action]]
   void addadminkey(
      name admin_account,
      std::string public_key,
      std::string description
   );

   /**
    * Remove admin public key
    * @param key_id - Admin key ID to remove
    */
   [[eosio::action]]
   void rmadminkey(uint64_t key_id);

   /**
    * Log admin access to encrypted file (for audit trail)
    * @param admin_account - Admin accessing the file
    * @param file_id - File being accessed
    * @param reason - Reason for access
    */
   [[eosio::action]]
   void logaccess(
      name admin_account,
      uint64_t file_id,
      std::string reason
   );

   /**
    * Delete artwork and all associated files
    * @param artwork_id - Artwork ID to delete
    * @param owner - Owner account (must match)
    */
   [[eosio::action]]
   void deleteart(
      uint64_t artwork_id,
      name owner
   );

   // ========== TABLES ==========

   /**
    * Artworks table - stores artwork metadata
    */
   struct [[eosio::table]] artwork {
      uint64_t artwork_id;                  // Primary key
      name owner;                            // Owner account
      std::string title_encrypted;           // Encrypted title
      std::string description_encrypted;     // Encrypted description
      std::string metadata_encrypted;        // Encrypted JSON metadata
      std::string creator_public_key;        // Creator's X25519 public key
      uint64_t created_at;                   // Creation timestamp
      uint32_t file_count;                   // Number of associated files

      uint64_t primary_key() const { return artwork_id; }
      uint64_t by_owner() const { return owner.value; }
   };

   using artworks_table = multi_index<
      "artworks"_n,
      artwork,
      indexed_by<"byowner"_n, const_mem_fun<artwork, uint64_t, &artwork::by_owner>>
   >;

   /**
    * Files table - stores file metadata with encrypted DEKs
    */
   struct [[eosio::table]] artfile {
      uint64_t file_id;                      // Primary key
      uint64_t artwork_id;                   // Parent artwork
      name owner;                            // Owner account
      std::string filename_encrypted;        // Encrypted filename
      std::string mime_type;                 // MIME type (plaintext)
      uint64_t file_size;                    // Total file size
      checksum256 file_hash;                 // SHA256 hash
      std::string encrypted_dek;             // DEK encrypted with user key
      std::vector<std::string> admin_encrypted_deks; // DEKs encrypted with admin keys
      std::string iv;                        // AES-GCM IV
      std::string auth_tag;                  // AES-GCM auth tag
      bool is_thumbnail;                     // Thumbnail flag
      uint32_t total_chunks;                 // Total chunks
      uint32_t uploaded_chunks;              // Uploaded chunks
      bool upload_complete;                  // Upload completion flag
      uint64_t created_at;                   // Creation timestamp
      uint64_t completed_at;                 // Completion timestamp

      uint64_t primary_key() const { return file_id; }
      uint64_t by_artwork() const { return artwork_id; }
      uint64_t by_owner() const { return owner.value; }
   };

   using artfiles_table = multi_index<
      "artfiles"_n,
      artfile,
      indexed_by<"byartwork"_n, const_mem_fun<artfile, uint64_t, &artfile::by_artwork>>,
      indexed_by<"byowner"_n, const_mem_fun<artfile, uint64_t, &artfile::by_owner>>
   >;

   /**
    * Chunks table - stores encrypted file chunks
    */
   struct [[eosio::table]] artchunk {
      uint64_t chunk_id;                     // Primary key
      uint64_t file_id;                      // Parent file
      name owner;                            // Owner account
      uint32_t chunk_index;                  // Zero-based index
      std::string chunk_data;                // Encrypted chunk data (base64)
      uint32_t chunk_size;                   // Chunk size in bytes
      uint64_t uploaded_at;                  // Upload timestamp

      uint64_t primary_key() const { return chunk_id; }
      uint64_t by_file() const { return file_id; }
      uint128_t by_file_index() const {
         return (uint128_t{file_id} << 64) | chunk_index;
      }
   };

   using artchunks_table = multi_index<
      "artchunks"_n,
      artchunk,
      indexed_by<"byfile"_n, const_mem_fun<artchunk, uint64_t, &artchunk::by_file>>,
      indexed_by<"byfileindex"_n, const_mem_fun<artchunk, uint128_t, &artchunk::by_file_index>>
   >;

   /**
    * Usage quotas table - tracks user upload limits (daily + weekly)
    */
   struct [[eosio::table]] usagequota {
      name account;                          // Primary key
      uint8_t tier;                          // Quota tier (0=free, 1=premium)

      // Limits
      uint32_t daily_file_limit;             // Max files per day
      uint64_t daily_size_limit;             // Max bytes per day
      uint32_t weekly_file_limit;            // Max files per week
      uint64_t weekly_size_limit;            // Max bytes per week

      // Daily usage
      uint32_t daily_files_used;             // Files used today
      uint64_t daily_size_used;              // Bytes used today
      uint64_t daily_reset_at;               // Daily reset timestamp (midnight UTC)

      // Weekly usage
      uint32_t weekly_files_used;            // Files used this week
      uint64_t weekly_size_used;             // Bytes used this week
      uint64_t weekly_reset_at;              // Weekly reset timestamp (Monday 00:00 UTC)

      uint64_t primary_key() const { return account.value; }
   };

   using usagequotas_table = multi_index<"usagequotas"_n, usagequota>;

   /**
    * Admin keys table - stores admin public keys for key escrow
    */
   struct [[eosio::table]] adminkey {
      uint64_t key_id;                       // Primary key
      name admin_account;                    // Admin account
      std::string public_key;                // X25519 public key (base64)
      std::string description;               // Key description
      uint64_t added_at;                     // Addition timestamp
      bool is_active;                        // Active status

      uint64_t primary_key() const { return key_id; }
      uint64_t by_admin() const { return admin_account.value; }
   };

   using adminkeys_table = multi_index<
      "adminkeys"_n,
      adminkey,
      indexed_by<"byadmin"_n, const_mem_fun<adminkey, uint64_t, &adminkey::by_admin>>
   >;

   /**
    * Admin access log - audit trail for admin file access
    */
   struct [[eosio::table]] adminaccesslog {
      uint64_t log_id;                       // Primary key
      name admin_account;                    // Admin account
      uint64_t file_id;                      // File accessed
      std::string reason;                    // Access reason
      uint64_t accessed_at;                  // Access timestamp

      uint64_t primary_key() const { return log_id; }
      uint64_t by_file() const { return file_id; }
      uint64_t by_admin() const { return admin_account.value; }
   };

   using adminaccesslogs_table = multi_index<
      "adminaccess"_n,
      adminaccesslog,
      indexed_by<"byfile"_n, const_mem_fun<adminaccesslog, uint64_t, &adminaccesslog::by_file>>,
      indexed_by<"byadmin"_n, const_mem_fun<adminaccesslog, uint64_t, &adminaccesslog::by_admin>>
   >;

private:
   /**
    * Check and update quota usage for a file upload
    * @param account - User account
    * @param file_size - File size in bytes
    */
   void check_and_update_quota(name account, uint64_t file_size);

   /**
    * Reset quota counters if periods have expired
    * @param quota - Quota record to check/reset
    * @param current_time - Current timestamp
    * @return true if any reset occurred
    */
   bool reset_quota_if_expired(usagequota& quota, uint64_t current_time);

   /**
    * Get all active admin public keys
    * @return Vector of active admin public keys
    */
   std::vector<std::string> get_active_admin_keys();

   /**
    * Calculate next Monday 00:00 UTC timestamp
    * @param from_time - Base timestamp
    * @return Timestamp of next Monday 00:00 UTC
    */
   uint64_t calculate_next_monday(uint64_t from_time);
};

} // namespace verarta
