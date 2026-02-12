import {
  startRegistration,
  startAuthentication,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';

const RP_NAME = 'Verarta';
const RP_ID = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

function generateChallenge(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generateUserId(email: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(email);
  return btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function registerWebAuthnCredential(
  email: string,
  displayName: string
): Promise<{ credentialId: string; publicKey: string }> {
  const options: PublicKeyCredentialCreationOptionsJSON = {
    rp: { name: RP_NAME, id: RP_ID },
    user: {
      id: generateUserId(email),
      name: email,
      displayName,
    },
    challenge: generateChallenge(),
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },   // ES256
      { alg: -257, type: 'public-key' },  // RS256
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      userVerification: 'preferred',
      residentKey: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
  };

  const credential = await startRegistration({ optionsJSON: options });

  return {
    credentialId: credential.id,
    publicKey: credential.response.publicKey || '',
  };
}

export async function authenticateWebAuthn(
  credentialId?: string
): Promise<{ credentialId: string; signature: string }> {
  const options: PublicKeyCredentialRequestOptionsJSON = {
    challenge: generateChallenge(),
    rpId: RP_ID,
    timeout: 60000,
    userVerification: 'preferred',
    allowCredentials: credentialId
      ? [{ id: credentialId, type: 'public-key' }]
      : [],
  };

  const assertion = await startAuthentication({ optionsJSON: options });

  return {
    credentialId: assertion.id,
    signature: assertion.response.signature,
  };
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined'
  );
}
