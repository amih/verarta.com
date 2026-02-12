#!/usr/bin/env python3
"""
Update producer configuration files with keys from accounts.json
"""

import json
import sys
import os

def main():
    # Load accounts
    accounts_file = "blockchain/accounts.json"
    if not os.path.exists(accounts_file):
        print(f"Error: {accounts_file} not found")
        print("Run generate-accounts.py first")
        sys.exit(1)

    with open(accounts_file) as f:
        accounts = json.load(f)

    print("Updating producer configuration files...")

    # Update each producer config
    for producer in accounts['producers']:
        name = producer['name']
        pub = producer['pub']
        pvt = producer['pvt']

        config_file = f"blockchain/config/{name}.ini"

        if not os.path.exists(config_file):
            print(f"  ⚠️  Config not found: {config_file}")
            continue

        # Read config file
        with open(config_file, 'r') as f:
            content = f.read()

        # Replace signature-provider line
        # Handle both placeholder and existing key formats
        lines = content.split('\n')
        updated = False

        for i, line in enumerate(lines):
            if line.startswith('signature-provider'):
                old_line = line
                lines[i] = f"signature-provider = {pub}=KEY:{pvt}"
                updated = True
                break

        if updated:
            # Write back
            with open(config_file, 'w') as f:
                f.write('\n'.join(lines))
            print(f"  ✓ Updated {name}: {pub}")
        else:
            print(f"  ⚠️  No signature-provider found in {config_file}")

    print("\n✅ Producer configs updated successfully!")

if __name__ == "__main__":
    main()
