import sodium from 'libsodium-wrappers';

let sodiumReady = false;

async function ensureSodium() {
  if (!sodiumReady) {
    await sodium.ready;
    sodiumReady = true;
  }
}

export interface EncryptedDek {
  encryptedDek: string; // base64
  ephemeralPublicKey: string; // base64
}

export interface EncryptedFile {
  ciphertext: Uint8Array;
  nonce: string; // base64
  encryptedDeks: EncryptedDek[];
  hash: string; // hex
}

/**
 * Encrypt a file with ChaCha20-Poly1305, then encrypt the DEK
 * for each recipient (user + admin keys) using X25519.
 */
export async function encryptFile(
  fileBuffer: ArrayBuffer,
  recipientPublicKeys: string[] // base64-encoded X25519 public keys
): Promise<EncryptedFile> {
  await ensureSodium();

  // 1. Generate random DEK (Data Encryption Key)
  const dek = sodium.randombytes_buf(sodium.crypto_aead_chacha20poly1305_ietf_KEYBYTES);

  // 2. Generate random nonce
  const nonce = sodium.randombytes_buf(sodium.crypto_aead_chacha20poly1305_ietf_NPUBBYTES);

  console.log('[encrypt] AEAD nonce length', nonce.length, 'expected', sodium.crypto_aead_chacha20poly1305_ietf_NPUBBYTES);

  // 3. Encrypt file with DEK using ChaCha20-Poly1305
  let ciphertext: Uint8Array;
  try {
    ciphertext = sodium.crypto_aead_chacha20poly1305_ietf_encrypt(
      new Uint8Array(fileBuffer),
      null, // no additional data
      null, // no secret nonce
      nonce,
      dek
    );
  } catch (err) {
    throw new Error(`encryptFile: AEAD encrypt failed (nonce=${nonce.length}B, dek=${dek.length}B): ${err}`);
  }

  // 4. Encrypt DEK for each recipient using X25519 box
  // crypto_box_easy requires a 24-byte nonce; pad the 12-byte AEAD nonce with zeros
  const boxNonce = new Uint8Array(sodium.crypto_box_NONCEBYTES);
  boxNonce.set(nonce);

  console.log('[encrypt] box nonce length', boxNonce.length, 'expected', sodium.crypto_box_NONCEBYTES);

  const encryptedDeks = recipientPublicKeys.map((pubKeyB64, idx) => {
    const pubKeyBytes = sodium.from_base64(pubKeyB64, sodium.base64_variants.ORIGINAL);
    const ephemeralKeyPair = sodium.crypto_box_keypair();
    console.log(`[encrypt] recipient[${idx}] pubKey=${pubKeyBytes.length}B`);
    let encryptedDek: Uint8Array;
    try {
      encryptedDek = sodium.crypto_box_easy(
        dek,
        boxNonce,
        pubKeyBytes,
        ephemeralKeyPair.privateKey
      );
    } catch (err) {
      throw new Error(`encryptFile: crypto_box_easy failed for recipient[${idx}] (boxNonce=${boxNonce.length}B, pubKey=${pubKeyBytes.length}B): ${err}`);
    }
    return {
      encryptedDek: sodium.to_base64(encryptedDek, sodium.base64_variants.ORIGINAL),
      ephemeralPublicKey: sodium.to_base64(ephemeralKeyPair.publicKey, sodium.base64_variants.ORIGINAL),
    };
  });

  // 5. Calculate SHA256 hash of plaintext
  const hash = sodium.crypto_hash_sha256(new Uint8Array(fileBuffer));

  return {
    ciphertext,
    nonce: sodium.to_base64(nonce, sodium.base64_variants.ORIGINAL),
    encryptedDeks,
    hash: sodium.to_hex(hash),
  };
}

/**
 * Decrypt a file encrypted with encryptFile().
 */
export async function decryptFile(
  ciphertext: Uint8Array,
  nonceB64: string,
  encryptedDekB64: string,
  ephemeralPublicKeyB64: string,
  userPrivateKeyB64: string
): Promise<ArrayBuffer> {
  await ensureSodium();

  const nonce = sodium.from_base64(nonceB64, sodium.base64_variants.ORIGINAL);
  const encryptedDek = sodium.from_base64(encryptedDekB64, sodium.base64_variants.ORIGINAL);
  const ephemeralPublicKey = sodium.from_base64(ephemeralPublicKeyB64, sodium.base64_variants.ORIGINAL);
  const userPrivateKey = sodium.from_base64(userPrivateKeyB64, sodium.base64_variants.ORIGINAL);

  // 1. Decrypt DEK with user's private key
  // crypto_box_open_easy requires a 24-byte nonce; pad the 12-byte AEAD nonce with zeros
  const boxNonce = new Uint8Array(sodium.crypto_box_NONCEBYTES);
  boxNonce.set(nonce);

  const dek = sodium.crypto_box_open_easy(
    encryptedDek,
    boxNonce,
    ephemeralPublicKey,
    userPrivateKey
  );

  // 2. Decrypt file with DEK
  const plaintext = sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
    null, // no secret nonce
    ciphertext,
    null, // no additional data
    nonce,
    dek
  );

  return plaintext.buffer as ArrayBuffer;
}

/**
 * Verify a file's SHA256 hash matches the expected hash.
 */
export async function verifyFileHash(
  fileBuffer: ArrayBuffer,
  expectedHashHex: string
): Promise<boolean> {
  await ensureSodium();
  const hash = sodium.crypto_hash_sha256(new Uint8Array(fileBuffer));
  return sodium.to_hex(hash) === expectedHashHex;
}
