#!/usr/bin/env python3
"""Convert a PUB_BLS_... key to 96-byte hex (stripping 4-byte ripemd160 checksum)."""
import base64
import sys

def convert_bls_key(pub_key):
    if not pub_key.startswith("PUB_BLS_"):
        print(f"Error: expected PUB_BLS_ prefix, got: {pub_key[:20]}...", file=sys.stderr)
        sys.exit(1)

    data = pub_key[len("PUB_BLS_"):]
    # Add base64url padding
    data += '=' * (-len(data) % 4)
    raw = base64.urlsafe_b64decode(data)

    # Raw = 96 bytes (G1 point) + 4 bytes (ripemd160 checksum) = 100 bytes
    if len(raw) < 96:
        print(f"Error: decoded key too short ({len(raw)} bytes, expected >= 96)", file=sys.stderr)
        sys.exit(1)

    print(raw[:96].hex())

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} PUB_BLS_...", file=sys.stderr)
        sys.exit(1)
    convert_bls_key(sys.argv[1])
