import sodium from 'libsodium-wrappers';

let ready = false;

async function ensureSodium() {
  if (!ready) {
    await sodium.ready;
    ready = true;
  }
}

/**
 * Decrypt a DEK (Data Encryption Key) using the service X25519 private key.
 * The DEK was encrypted with crypto_box_easy using an ephemeral keypair.
 */
export async function decryptDek(
  encryptedDekB64: string,
  ivB64: string,
  ephemeralPublicKeyB64: string,
  privateKeyB64: string
): Promise<Uint8Array> {
  await ensureSodium();

  const iv = sodium.from_base64(ivB64, sodium.base64_variants.ORIGINAL);
  const encryptedDek = sodium.from_base64(encryptedDekB64, sodium.base64_variants.ORIGINAL);
  const ephemeralPublicKey = sodium.from_base64(ephemeralPublicKeyB64, sodium.base64_variants.ORIGINAL);
  const privateKey = sodium.from_base64(privateKeyB64, sodium.base64_variants.ORIGINAL);

  // Pad 12-byte AEAD iv to 24-byte box nonce (same convention as frontend)
  const boxNonce = new Uint8Array(sodium.crypto_box_NONCEBYTES);
  boxNonce.set(iv);

  return sodium.crypto_box_open_easy(
    encryptedDek,
    boxNonce,
    ephemeralPublicKey,
    privateKey
  );
}

/**
 * Decrypt a file encrypted with ChaCha20-Poly1305 using the DEK.
 */
export async function decryptFile(
  ciphertext: Uint8Array,
  nonceB64: string,
  dek: Uint8Array
): Promise<Uint8Array> {
  await ensureSodium();

  const nonce = sodium.from_base64(nonceB64, sodium.base64_variants.ORIGINAL);

  return sodium.crypto_aead_chacha20poly1305_ietf_decrypt(
    null, // no secret nonce
    ciphertext,
    null, // no additional data
    nonce,
    dek
  );
}
