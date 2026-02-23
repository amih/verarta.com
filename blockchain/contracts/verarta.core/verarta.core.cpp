#include "verarta.core.hpp"


namespace verarta {

// ========== ACTION IMPLEMENTATIONS ==========

void verartatoken::createart(
   uint64_t artwork_id,
   name owner,
   std::string title_encrypted,
   std::string description_encrypted,
   std::string metadata_encrypted,
   std::string creator_public_key
) {
   require_auth(owner);

   // Validate inputs
   check(artwork_id > 0, "artwork_id must be positive");
   check(title_encrypted.size() > 0, "title_encrypted cannot be empty");
   check(title_encrypted.size() <= 1024, "title_encrypted too long");
   check(description_encrypted.size() <= 10240, "description_encrypted too long");
   check(metadata_encrypted.size() <= 10240, "metadata_encrypted too long");
   check(creator_public_key.size() == 44, "invalid X25519 public key length");

   artworks_table artworks(get_self(), get_self().value);

   // Check if artwork_id already exists
   auto existing = artworks.find(artwork_id);
   check(existing == artworks.end(), "artwork_id already exists");

   // Create artwork record
   artworks.emplace(owner, [&](auto& row) {
      row.artwork_id = artwork_id;
      row.owner = owner;
      row.title_encrypted = title_encrypted;
      row.description_encrypted = description_encrypted;
      row.metadata_encrypted = metadata_encrypted;
      row.creator_public_key = creator_public_key;
      row.created_at = eosio::current_block_time().to_time_point().sec_since_epoch();
      row.file_count = 0;
   });
}

void verartatoken::addfile(
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
) {
   require_auth(owner);

   // Validate inputs
   check(file_id > 0, "file_id must be positive");
   check(artwork_id > 0, "artwork_id must be positive");
   check(filename_encrypted.size() > 0, "filename_encrypted cannot be empty");
   check(filename_encrypted.size() <= 512, "filename_encrypted too long");
   check(mime_type.size() > 0 && mime_type.size() <= 128, "invalid mime_type");
   check(file_size > 0, "file_size must be positive");
   check(file_size <= 104857600, "file_size exceeds 100MB limit");
   check(encrypted_dek.size() > 0, "encrypted_dek cannot be empty");
   check(iv.size() > 0, "iv cannot be empty");
   check(auth_tag.size() > 0, "auth_tag cannot be empty");

   // Check quota before creating file
   check_and_update_quota(owner, file_size);

   artworks_table artworks(get_self(), get_self().value);
   artfiles_table artfiles(get_self(), get_self().value);

   // Verify artwork exists and owner matches
   auto artwork_itr = artworks.find(artwork_id);
   check(artwork_itr != artworks.end(), "artwork not found");
   check(artwork_itr->owner == owner, "artwork owner mismatch");

   // Check if file_id already exists
   auto existing = artfiles.find(file_id);
   check(existing == artfiles.end(), "file_id already exists");

   // Validate admin encrypted DEKs match active admin keys
   auto active_admin_keys = get_active_admin_keys();
   check(admin_encrypted_deks.size() == active_admin_keys.size(),
         "admin_encrypted_deks count must match active admin keys");

   // Create file record
   artfiles.emplace(owner, [&](auto& row) {
      row.file_id = file_id;
      row.artwork_id = artwork_id;
      row.owner = owner;
      row.filename_encrypted = filename_encrypted;
      row.mime_type = mime_type;
      row.file_size = file_size;
      row.file_hash = file_hash;
      row.encrypted_dek = encrypted_dek;
      row.admin_encrypted_deks = admin_encrypted_deks;
      row.iv = iv;
      row.auth_tag = auth_tag;
      row.is_thumbnail = is_thumbnail;
      row.total_chunks = 0;
      row.uploaded_chunks = 0;
      row.upload_complete = false;
      row.created_at = eosio::current_block_time().to_time_point().sec_since_epoch();
      row.completed_at = 0;
   });

   // Increment artwork file count
   artworks.modify(artwork_itr, owner, [&](auto& row) {
      row.file_count++;
   });
}

void verartatoken::uploadchunk(
   uint64_t chunk_id,
   uint64_t file_id,
   name owner,
   uint32_t chunk_index,
   std::string chunk_data,
   uint32_t chunk_size
) {
   check(has_auth(owner) || has_auth(get_self()), "missing required authority");

   // Validate inputs
   check(chunk_id > 0, "chunk_id must be positive");
   check(file_id > 0, "file_id must be positive");
   check(chunk_data.size() > 0, "chunk_data cannot be empty");
   check(chunk_data.size() <= 350000, "chunk_data too large (max ~350KB base64)");
   check(chunk_size > 0 && chunk_size <= 262144, "invalid chunk_size (max 256KB)");

   artfiles_table artfiles(get_self(), get_self().value);
   artchunks_table artchunks(get_self(), get_self().value);

   // Verify file exists and owner matches
   auto file_itr = artfiles.find(file_id);
   check(file_itr != artfiles.end(), "file not found");
   check(file_itr->owner == owner, "file owner mismatch");
   check(!file_itr->upload_complete, "file upload already complete");

   // Check if chunk_id already exists
   auto existing = artchunks.find(chunk_id);
   check(existing == artchunks.end(), "chunk_id already exists");

   // Check if chunk_index already uploaded for this file
   auto by_file_index = artchunks.get_index<"byfileindex"_n>();
   uint128_t file_index_key = (uint128_t{file_id} << 64) | chunk_index;
   auto file_index_itr = by_file_index.find(file_index_key);
   check(file_index_itr == by_file_index.end(), "chunk_index already uploaded for this file");

   // Create chunk record — use get_self() as RAM payer so the service key
   // can sign without requiring the user to co-sign for RAM allocation.
   name ram_payer = has_auth(get_self()) ? get_self() : owner;
   artchunks.emplace(ram_payer, [&](auto& row) {
      row.chunk_id = chunk_id;
      row.file_id = file_id;
      row.owner = owner;
      row.chunk_index = chunk_index;
      row.chunk_data = chunk_data;
      row.chunk_size = chunk_size;
      row.uploaded_at = eosio::current_block_time().to_time_point().sec_since_epoch();
   });

   // Increment uploaded_chunks counter
   artfiles.modify(file_itr, same_payer, [&](auto& row) {
      row.uploaded_chunks++;
   });
}

void verartatoken::completefile(
   uint64_t file_id,
   name owner,
   uint32_t total_chunks
) {
   check(has_auth(owner) || has_auth(get_self()), "missing required authority");

   // Validate inputs
   check(file_id > 0, "file_id must be positive");
   check(total_chunks > 0, "total_chunks must be positive");

   artfiles_table artfiles(get_self(), get_self().value);

   // Verify file exists and owner matches
   auto file_itr = artfiles.find(file_id);
   check(file_itr != artfiles.end(), "file not found");
   check(file_itr->owner == owner, "file owner mismatch");
   check(!file_itr->upload_complete, "file already marked complete");

   // Verify all chunks uploaded
   check(file_itr->uploaded_chunks == total_chunks, "not all chunks uploaded");

   // Mark file as complete — use same_payer since we're not adding RAM.
   artfiles.modify(file_itr, same_payer, [&](auto& row) {
      row.total_chunks = total_chunks;
      row.upload_complete = true;
      row.completed_at = eosio::current_block_time().to_time_point().sec_since_epoch();
   });
}

void verartatoken::setquota(
   name account,
   uint8_t tier,
   uint32_t daily_file_limit,
   uint64_t daily_size_limit,
   uint32_t weekly_file_limit,
   uint64_t weekly_size_limit
) {
   // Only contract account can set quotas
   require_auth(get_self());

   // Validate inputs
   check(tier <= 1, "tier must be 0 (free) or 1 (premium)");
   check(daily_file_limit > 0, "daily_file_limit must be positive");
   check(daily_size_limit > 0, "daily_size_limit must be positive");
   check(weekly_file_limit > 0, "weekly_file_limit must be positive");
   check(weekly_size_limit > 0, "weekly_size_limit must be positive");
   check(weekly_file_limit >= daily_file_limit, "weekly_file_limit must be >= daily_file_limit");
   check(weekly_size_limit >= daily_size_limit, "weekly_size_limit must be >= daily_size_limit");

   usagequotas_table quotas(get_self(), get_self().value);
   auto quota_itr = quotas.find(account.value);

   uint64_t current_time = eosio::current_block_time().to_time_point().sec_since_epoch();
   uint64_t daily_reset = (current_time / 86400) * 86400 + 86400; // Next midnight UTC
   uint64_t weekly_reset = calculate_next_monday(current_time);

   if (quota_itr == quotas.end()) {
      // Create new quota
      quotas.emplace(get_self(), [&](auto& row) {
         row.account = account;
         row.tier = tier;
         row.daily_file_limit = daily_file_limit;
         row.daily_size_limit = daily_size_limit;
         row.weekly_file_limit = weekly_file_limit;
         row.weekly_size_limit = weekly_size_limit;
         row.daily_files_used = 0;
         row.daily_size_used = 0;
         row.daily_reset_at = daily_reset;
         row.weekly_files_used = 0;
         row.weekly_size_used = 0;
         row.weekly_reset_at = weekly_reset;
      });
   } else {
      // Update existing quota (preserve usage counters)
      quotas.modify(quota_itr, get_self(), [&](auto& row) {
         row.tier = tier;
         row.daily_file_limit = daily_file_limit;
         row.daily_size_limit = daily_size_limit;
         row.weekly_file_limit = weekly_file_limit;
         row.weekly_size_limit = weekly_size_limit;
      });
   }
}

void verartatoken::addadminkey(
   name admin_account,
   std::string public_key,
   std::string description
) {
   // Only contract account can add admin keys
   require_auth(get_self());

   // Validate inputs
   check(public_key.size() == 44, "invalid X25519 public key length");
   check(description.size() > 0 && description.size() <= 256, "invalid description");

   adminkeys_table adminkeys(get_self(), get_self().value);

   // Find next key_id
   uint64_t key_id = 1;
   auto idx = adminkeys.get_index<"byadmin"_n>();
   for (auto itr = idx.begin(); itr != idx.end(); ++itr) {
      if (itr->key_id >= key_id) {
         key_id = itr->key_id + 1;
      }
   }

   // Check if this public_key already exists
   for (auto itr = adminkeys.begin(); itr != adminkeys.end(); ++itr) {
      check(itr->public_key != public_key, "public_key already exists");
   }

   // Add admin key
   adminkeys.emplace(get_self(), [&](auto& row) {
      row.key_id = key_id;
      row.admin_account = admin_account;
      row.public_key = public_key;
      row.description = description;
      row.added_at = eosio::current_block_time().to_time_point().sec_since_epoch();
      row.is_active = true;
   });
}

void verartatoken::rmadminkey(uint64_t key_id) {
   // Only contract account can remove admin keys
   require_auth(get_self());

   adminkeys_table adminkeys(get_self(), get_self().value);
   auto key_itr = adminkeys.find(key_id);

   check(key_itr != adminkeys.end(), "admin key not found");

   // Mark as inactive (don't delete to preserve audit trail)
   adminkeys.modify(key_itr, get_self(), [&](auto& row) {
      row.is_active = false;
   });
}

void verartatoken::logaccess(
   name admin_account,
   uint64_t file_id,
   std::string reason
) {
   require_auth(admin_account);

   // Validate inputs
   check(file_id > 0, "file_id must be positive");
   check(reason.size() > 0 && reason.size() <= 512, "invalid reason");

   artfiles_table artfiles(get_self(), get_self().value);
   adminaccesslogs_table logs(get_self(), get_self().value);

   // Verify file exists
   auto file_itr = artfiles.find(file_id);
   check(file_itr != artfiles.end(), "file not found");

   // Verify admin has an active admin key
   adminkeys_table adminkeys(get_self(), get_self().value);
   auto by_admin = adminkeys.get_index<"byadmin"_n>();
   bool has_admin_key = false;
   for (auto itr = by_admin.lower_bound(admin_account.value);
        itr != by_admin.end() && itr->admin_account == admin_account;
        ++itr) {
      if (itr->is_active) {
         has_admin_key = true;
         break;
      }
   }
   check(has_admin_key, "admin_account does not have an active admin key");

   // Find next log_id
   uint64_t log_id = 1;
   for (auto itr = logs.begin(); itr != logs.end(); ++itr) {
      if (itr->log_id >= log_id) {
         log_id = itr->log_id + 1;
      }
   }

   // Create log entry
   logs.emplace(admin_account, [&](auto& row) {
      row.log_id = log_id;
      row.admin_account = admin_account;
      row.file_id = file_id;
      row.reason = reason;
      row.accessed_at = eosio::current_block_time().to_time_point().sec_since_epoch();
   });
}

void verartatoken::deletefile(
   uint64_t file_id,
   uint64_t artwork_id,
   name owner
) {
   require_auth(get_self()); // service key only

   check(file_id > 0, "file_id must be positive");
   check(artwork_id > 0, "artwork_id must be positive");

   artworks_table artworks(get_self(), get_self().value);
   artfiles_table artfiles(get_self(), get_self().value);
   artchunks_table artchunks(get_self(), get_self().value);

   auto artwork_itr = artworks.find(artwork_id);
   check(artwork_itr != artworks.end(), "artwork not found");
   check(artwork_itr->owner == owner, "artwork owner mismatch");

   auto file_itr = artfiles.find(file_id);
   check(file_itr != artfiles.end(), "file not found");
   check(file_itr->artwork_id == artwork_id, "file does not belong to artwork");
   check(file_itr->owner == owner, "file owner mismatch");

   // Delete all chunks for this file
   auto by_file = artchunks.get_index<"byfile"_n>();
   auto chunk_itr = by_file.lower_bound(file_id);
   while (chunk_itr != by_file.end() && chunk_itr->file_id == file_id) {
      chunk_itr = by_file.erase(chunk_itr);
   }

   // Decrement artwork file count
   artworks.modify(artwork_itr, same_payer, [&](auto& row) {
      if (row.file_count > 0) row.file_count--;
   });

   // Delete the file record
   artfiles.erase(file_itr);
}

void verartatoken::deleteart(
   uint64_t artwork_id,
   name owner
) {
   require_auth(owner);

   artworks_table artworks(get_self(), get_self().value);
   artfiles_table artfiles(get_self(), get_self().value);
   artchunks_table artchunks(get_self(), get_self().value);

   // Verify artwork exists and owner matches
   auto artwork_itr = artworks.find(artwork_id);
   check(artwork_itr != artworks.end(), "artwork not found");
   check(artwork_itr->owner == owner, "artwork owner mismatch");

   // Delete all files and their chunks
   auto by_artwork = artfiles.get_index<"byartwork"_n>();
   auto file_itr = by_artwork.lower_bound(artwork_id);

   while (file_itr != by_artwork.end() && file_itr->artwork_id == artwork_id) {
      uint64_t file_id = file_itr->file_id;

      // Delete all chunks for this file
      auto by_file = artchunks.get_index<"byfile"_n>();
      auto chunk_itr = by_file.lower_bound(file_id);

      while (chunk_itr != by_file.end() && chunk_itr->file_id == file_id) {
         chunk_itr = by_file.erase(chunk_itr);
      }

      // Delete file
      file_itr = by_artwork.erase(file_itr);
   }

   // Delete artwork
   artworks.erase(artwork_itr);
}

void verartatoken::transferart(
   uint64_t artwork_id,
   name from,
   name to,
   std::vector<uint64_t> file_ids,
   std::vector<std::string> new_encrypted_deks,
   std::vector<std::string> new_auth_tags,
   std::string memo
) {
   require_auth(from);

   check(from != to, "cannot transfer to self");
   check(file_ids.size() == new_encrypted_deks.size(), "file_ids and new_encrypted_deks size mismatch");
   check(file_ids.size() == new_auth_tags.size(), "file_ids and new_auth_tags size mismatch");

   artworks_table artworks(get_self(), get_self().value);
   artfiles_table artfiles(get_self(), get_self().value);

   // Verify artwork exists and from is the owner
   auto artwork_itr = artworks.find(artwork_id);
   check(artwork_itr != artworks.end(), "artwork not found");
   check(artwork_itr->owner == from, "artwork owner mismatch");

   // Update each file's owner and re-encrypted DEK
   for (size_t i = 0; i < file_ids.size(); ++i) {
      auto file_itr = artfiles.find(file_ids[i]);
      check(file_itr != artfiles.end(), "file not found");
      check(file_itr->artwork_id == artwork_id, "file does not belong to artwork");
      check(file_itr->owner == from, "file owner mismatch");

      artfiles.modify(file_itr, same_payer, [&](auto& row) {
         row.owner = to;
         row.encrypted_dek = new_encrypted_deks[i];
         row.auth_tag = new_auth_tags[i];
      });
   }

   // Transfer artwork ownership
   artworks.modify(artwork_itr, same_payer, [&](auto& row) {
      row.owner = to;
   });
}

void verartatoken::updateart(
   uint64_t artwork_id,
   name owner,
   std::string description_encrypted,
   std::string metadata_encrypted
) {
   // Allow the owner directly, or the contract's service key (for backend-initiated updates)
   check(has_auth(owner) || has_auth(get_self()), "missing required authority");

   check(artwork_id > 0, "artwork_id must be positive");
   check(description_encrypted.size() <= 10240, "description_encrypted too long");
   check(metadata_encrypted.size() <= 10240, "metadata_encrypted too long");

   artworks_table artworks(get_self(), get_self().value);
   auto artwork_itr = artworks.find(artwork_id);
   check(artwork_itr != artworks.end(), "artwork not found");
   check(artwork_itr->owner == owner, "artwork owner mismatch");

   artworks.modify(artwork_itr, same_payer, [&](auto& row) {
      row.description_encrypted = description_encrypted;
      row.metadata_encrypted = metadata_encrypted;
   });
}

void verartatoken::addadmindek(uint64_t file_id, std::string new_encrypted_dek) {
   require_auth(get_self()); // service key only

   check(file_id > 0, "file_id must be positive");
   check(new_encrypted_dek.size() > 0, "new_encrypted_dek cannot be empty");

   artfiles_table artfiles(get_self(), get_self().value);
   auto it = artfiles.find(file_id);
   check(it != artfiles.end(), "file not found");

   auto active_admin_keys = get_active_admin_keys();
   check(it->admin_encrypted_deks.size() < active_admin_keys.size(),
         "file already has DEKs for all active admin keys");

   artfiles.modify(it, same_payer, [&](auto& row) {
      row.admin_encrypted_deks.push_back(new_encrypted_dek);
   });
}

// ========== PRIVATE HELPER FUNCTIONS ==========

void verartatoken::check_and_update_quota(name account, uint64_t file_size) {
   usagequotas_table quotas(get_self(), get_self().value);
   auto quota_itr = quotas.find(account.value);

   // If no quota exists, apply default free tier limits
   if (quota_itr == quotas.end()) {
      uint64_t current_time = eosio::current_block_time().to_time_point().sec_since_epoch();
      uint64_t daily_reset = (current_time / 86400) * 86400 + 86400;
      uint64_t weekly_reset = calculate_next_monday(current_time);

      quotas.emplace(get_self(), [&](auto& row) {
         row.account = account;
         row.tier = 0; // Free tier
         row.daily_file_limit = 10;
         row.daily_size_limit = 26214400; // 25 MB
         row.weekly_file_limit = 40;
         row.weekly_size_limit = 104857600; // 100 MB
         row.daily_files_used = 1;
         row.daily_size_used = file_size;
         row.daily_reset_at = daily_reset;
         row.weekly_files_used = 1;
         row.weekly_size_used = file_size;
         row.weekly_reset_at = weekly_reset;
      });
      return;
   }

   // Check if quotas need to be reset
   uint64_t current_time = eosio::current_block_time().to_time_point().sec_since_epoch();
   bool reset_occurred = false;

   quotas.modify(quota_itr, get_self(), [&](auto& row) {
      // Reset daily quota if expired
      if (current_time >= row.daily_reset_at) {
         row.daily_files_used = 0;
         row.daily_size_used = 0;
         row.daily_reset_at = (current_time / 86400) * 86400 + 86400;
         reset_occurred = true;
      }

      // Reset weekly quota if expired
      if (current_time >= row.weekly_reset_at) {
         row.weekly_files_used = 0;
         row.weekly_size_used = 0;
         row.weekly_reset_at = calculate_next_monday(current_time);
         reset_occurred = true;
      }

      // Check daily limits
      check(row.daily_files_used < row.daily_file_limit,
            "daily file count limit exceeded");
      check(row.daily_size_used + file_size <= row.daily_size_limit,
            "daily size limit exceeded");

      // Check weekly limits
      check(row.weekly_files_used < row.weekly_file_limit,
            "weekly file count limit exceeded");
      check(row.weekly_size_used + file_size <= row.weekly_size_limit,
            "weekly size limit exceeded");

      // Update usage counters
      row.daily_files_used++;
      row.daily_size_used += file_size;
      row.weekly_files_used++;
      row.weekly_size_used += file_size;
   });
}

bool verartatoken::reset_quota_if_expired(usagequota& quota, uint64_t current_time) {
   bool reset_occurred = false;

   // Reset daily quota if expired
   if (current_time >= quota.daily_reset_at) {
      quota.daily_files_used = 0;
      quota.daily_size_used = 0;
      quota.daily_reset_at = (current_time / 86400) * 86400 + 86400;
      reset_occurred = true;
   }

   // Reset weekly quota if expired
   if (current_time >= quota.weekly_reset_at) {
      quota.weekly_files_used = 0;
      quota.weekly_size_used = 0;
      quota.weekly_reset_at = calculate_next_monday(current_time);
      reset_occurred = true;
   }

   return reset_occurred;
}

std::vector<std::string> verartatoken::get_active_admin_keys() {
   adminkeys_table adminkeys(get_self(), get_self().value);
   std::vector<std::string> active_keys;

   for (auto itr = adminkeys.begin(); itr != adminkeys.end(); ++itr) {
      if (itr->is_active) {
         active_keys.push_back(itr->public_key);
      }
   }

   return active_keys;
}

uint64_t verartatoken::calculate_next_monday(uint64_t from_time) {
   // Calculate days since Unix epoch
   uint64_t days_since_epoch = from_time / 86400;

   // Thursday, January 1, 1970 was day 0, so Monday is day 4
   // Days until next Monday: (11 - day_of_week) % 7
   // If today is Monday (day 4), next Monday is in 7 days
   uint64_t day_of_week = (days_since_epoch + 4) % 7; // 0=Monday, 6=Sunday

   uint64_t days_until_monday;
   if (day_of_week == 0) {
      // Today is Monday, next Monday is in 7 days
      days_until_monday = 7;
   } else {
      // Next Monday is (7 - day_of_week) days away
      days_until_monday = 7 - day_of_week;
   }

   // Calculate next Monday at 00:00 UTC
   uint64_t midnight_today = (from_time / 86400) * 86400;
   return midnight_today + (days_until_monday * 86400);
}

} // namespace verarta

// Dispatch actions
EOSIO_DISPATCH(verarta::verartatoken, (createart)(updateart)(addfile)(uploadchunk)(completefile)(setquota)(addadminkey)(rmadminkey)(addadmindek)(logaccess)(deleteart)(deletefile)(transferart))
