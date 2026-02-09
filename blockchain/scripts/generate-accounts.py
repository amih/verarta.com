#!/usr/bin/env python3
"""
Generate accounts.json with cryptographic keys for producers and users.
Uses cleos to generate secure key pairs.
"""

import subprocess
import json
import sys

def run_command(cmd):
    """Execute shell command and return output"""
    try:
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            check=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"Error running command: {cmd}")
        print(f"Error: {e.stderr}")
        sys.exit(1)

def generate_key_pair():
    """Generate a new EOS key pair using cleos"""
    output = run_command("cleos create key --to-console")
    lines = output.split('\n')

    private_key = None
    public_key = None

    for line in lines:
        if 'Private key:' in line:
            private_key = line.split('Private key:')[1].strip()
        elif 'Public key:' in line:
            public_key = line.split('Public key:')[1].strip()

    if not private_key or not public_key:
        print("Failed to parse key pair from cleos output")
        sys.exit(1)

    return {
        "pvt": private_key,
        "pub": public_key
    }

def main():
    print("Generating blockchain accounts...")

    accounts = {
        "initial_key": "EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV",
        "producers": [],
        "users": []
    }

    # Generate 4 producer accounts
    print("\nGenerating producer keys...")
    for i in range(1, 5):
        name = f"producer{i}"
        keys = generate_key_pair()
        accounts["producers"].append({
            "name": name,
            "pvt": keys["pvt"],
            "pub": keys["pub"]
        })
        print(f"  ✓ {name}: {keys['pub']}")

    # Generate core application account
    print("\nGenerating application accounts...")
    verartacore_keys = generate_key_pair()
    accounts["users"].append({
        "name": "verartacore",
        "pvt": verartacore_keys["pvt"],
        "pub": verartacore_keys["pub"]
    })
    print(f"  ✓ verartacore: {verartacore_keys['pub']}")

    # Generate a few test user accounts
    for i in range(1, 4):
        name = f"testuser{i}"
        keys = generate_key_pair()
        accounts["users"].append({
            "name": name,
            "pvt": keys["pvt"],
            "pub": keys["pub"]
        })
        print(f"  ✓ {name}: {keys['pub']}")

    # Write to accounts.json
    output_file = "blockchain/accounts.json"
    with open(output_file, 'w') as f:
        json.dump(accounts, f, indent=2)

    print(f"\n✅ Accounts generated successfully!")
    print(f"📄 Saved to: {output_file}")
    print(f"\n⚠️  IMPORTANT: Keep accounts.json secure - it contains private keys!")

if __name__ == "__main__":
    main()
