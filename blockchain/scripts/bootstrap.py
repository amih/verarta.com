#!/usr/bin/env python3
"""
Bootstrap the Verarta blockchain network.
Creates system accounts, deploys contracts, and sets up producers.

Based on AntelopeIO/spring bios-boot-tutorial.py
"""

import subprocess
import json
import sys
import time

def run(cmd):
    """Execute command and print output"""
    print(f"$ {cmd}")
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ERROR: {result.stderr}")
        sys.exit(1)
    if result.stdout:
        print(result.stdout)
    return result.stdout

def main():
    print("=" * 70)
    print("Verarta Blockchain Bootstrap Script")
    print("=" * 70)

    # Configuration
    CLEOS = "cleos -u http://localhost:8888"
    WALLET_URL = "http://localhost:6666"

    print("\n[1/10] Creating wallet...")
    run(f"cleos --wallet-url {WALLET_URL} wallet create --to-console")

    print("\n[2/10] Loading accounts...")
    with open('blockchain/accounts.json') as f:
        accounts = json.load(f)

    print("\n[3/10] Importing keys to wallet...")
    # Import initial key
    run(f"cleos --wallet-url {WALLET_URL} wallet import --private-key 5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3")

    # Import producer keys
    for producer in accounts['producers']:
        print(f"  Importing {producer['name']} key...")
        run(f"cleos --wallet-url {WALLET_URL} wallet import --private-key {producer['pvt']}")

    # Import user keys
    for user in accounts['users']:
        print(f"  Importing {user['name']} key...")
        run(f"cleos --wallet-url {WALLET_URL} wallet import --private-key {user['pvt']}")

    print("\n[4/10] Creating system accounts...")
    system_accounts = [
        'eosio.bpay', 'eosio.msig', 'eosio.names', 'eosio.ram',
        'eosio.ramfee', 'eosio.saving', 'eosio.stake', 'eosio.token',
        'eosio.vpay', 'eosio.rex', 'eosio.fees', 'eosio.reward'
    ]

    for account in system_accounts:
        print(f"  Creating {account}...")
        run(f"{CLEOS} create account eosio {account} {accounts['initial_key']}")

    print("\n[5/10] Creating producer accounts...")
    for producer in accounts['producers']:
        print(f"  Creating {producer['name']}...")
        run(f"{CLEOS} create account eosio {producer['name']} {producer['pub']}")

    print("\n[6/10] Creating user accounts...")
    for user in accounts['users']:
        print(f"  Creating {user['name']}...")
        run(f"{CLEOS} create account eosio {user['name']} {user['pub']}")

    print("\n[7/10] Deploying eosio.token contract...")
    # Note: Requires compiled contracts in blockchain/contracts/
    # For now, this is a placeholder
    print("  ⚠️  TODO: Deploy eosio.token contract")
    print("  Run: cleos set contract eosio.token <path-to-eosio.token-contract>")

    print("\n[8/10] Creating and issuing SYS token...")
    print("  ⚠️  TODO: Create token")
    print("  Run: cleos push action eosio.token create '[\"eosio\", \"1000000000.0000 SYS\"]' -p eosio.token")
    print("  Run: cleos push action eosio.token issue '[\"eosio\", \"1000000000.0000 SYS\", \"Initial supply\"]' -p eosio")

    print("\n[9/10] Registering producers...")
    print("  ⚠️  TODO: Register producers")
    print("  Run: cleos push action eosio regproducer ...")

    print("\n[10/10] Activating protocol features...")
    print("  ⚠️  TODO: Activate protocol features and deploy eosio.system")

    print("\n" + "=" * 70)
    print("Bootstrap script completed!")
    print("=" * 70)
    print("\nNext steps:")
    print("  1. Deploy system contracts (eosio.token, eosio.system)")
    print("  2. Create and issue tokens")
    print("  3. Register producers")
    print("  4. Vote for producers")
    print("  5. Deploy verarta.core contract")
    print("\nSee PLAN.md for full bootstrap instructions.")

if __name__ == "__main__":
    main()
