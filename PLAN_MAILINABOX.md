# Mail-in-a-Box Migration Plan
## Upgrading via New Server Migration Approach

---

## Table of Contents

1. [Overview](#overview)
2. [Why Migration Instead of In-Place Upgrade?](#why-migration-instead-of-in-place-upgrade)
3. [Prerequisites](#prerequisites)
4. [Timeline Overview](#timeline-overview)
5. [Phase 1: Pre-Migration Preparation](#phase-1-pre-migration-preparation)
6. [Phase 2: DNS TTL Reduction](#phase-2-dns-ttl-reduction)
7. [Phase 3: New Server Setup](#phase-3-new-server-setup)
8. [Phase 4: Final Backup & Service Lock](#phase-4-final-backup--service-lock)
9. [Phase 5: Data Restoration](#phase-5-data-restoration)
10. [Phase 6: Testing & Verification](#phase-6-testing--verification)
11. [Phase 7: DNS Cutover](#phase-7-dns-cutover)
12. [Phase 8: Post-Migration Monitoring](#phase-8-post-migration-monitoring)
13. [Phase 9: Decommissioning Old Server](#phase-9-decommissioning-old-server)
14. [Rollback Procedures](#rollback-procedures)
15. [Common Pitfalls & Troubleshooting](#common-pitfalls--troubleshooting)
16. [Appendix: Command Reference](#appendix-command-reference)

---

## Overview

This document provides a comprehensive step-by-step plan for migrating a Mail-in-a-Box (MiaB) installation to a new server. This migration-based approach is the recommended method for:

- Upgrading to a new Ubuntu version (e.g., Ubuntu 18.04 → 22.04 → 24.04)
- Moving to a server with better resources
- Changing hosting providers
- Recovering from a problematic installation

**Expected Total Timeline:** 3-5 days (including DNS propagation waiting periods)
**Expected Downtime:** 15-30 minutes (during final cutover)

---

## Why Migration Instead of In-Place Upgrade?

The Mail-in-a-Box project recommends the migration approach for several reasons:

1. **Ubuntu Version Compatibility**: MiaB is tightly coupled to specific Ubuntu versions. Major Ubuntu upgrades (e.g., 18.04 → 22.04) cannot be done in-place.

2. **Clean State**: A fresh installation eliminates accumulated configuration drift, outdated packages, and potential conflicts.

3. **Reduced Risk**: If the migration fails, your original server remains intact and operational. In-place upgrades can leave you with a broken system.

4. **Testing Opportunity**: You can fully test the new server before switching production traffic.

5. **Version Compatibility Path**: If you're on MiaB v0.50 or earlier (Ubuntu 18.04), you must first upgrade to v0.51+ before migrating to Ubuntu 22.04.

---

## Prerequisites

### Information You Must Have

- [ ] Current server's hostname (e.g., `box.example.com`)
- [ ] Current MiaB admin email and password
- [ ] Access to your domain registrar (for DNS changes)
- [ ] SSH access to current server
- [ ] Backup encryption key location: `/home/user-data/backup/secret_key.txt`
- [ ] List of all email accounts and aliases
- [ ] List of all domains hosted on the server

### Access Requirements

- [ ] Root/sudo access to current server
- [ ] Ability to provision a new VPS
- [ ] SSH client (Terminal on macOS/Linux, PuTTY on Windows)
- [ ] Access to current backup storage (if using remote backups)

### Technical Requirements for New Server

- **OS**: Ubuntu 22.04 LTS (or latest supported version)
- **RAM**: Minimum 2GB (4GB+ recommended for multiple domains)
- **Storage**: 20GB+ depending on mailbox sizes
- **IP Requirements**:
  - Static IPv4 address (required)
  - IPv6 address (recommended)
  - Clean IP reputation (check against spam blacklists)
  - Reverse DNS must be configurable

### Required Ports (New Server)

Ensure these ports are open on your new server's firewall:

- 22 (SSH)
- 25 (SMTP) - both TCP and UDP
- 53 (DNS) - both TCP and UDP
- 80 (HTTP)
- 443 (HTTPS)
- 465 (SMTP submission)
- 587 (SMTP submission alternate)
- 993 (IMAP)
- 995 (POP3)
- 4190 (Sieve/ManageSieve)

---

## Timeline Overview

| Phase | Duration | Downtime | Description |
|-------|----------|----------|-------------|
| **Phase 1**: Pre-Migration Prep | 2-4 hours | None | Documentation, backup verification, server provisioning |
| **Phase 2**: DNS TTL Reduction | 48 hours | None | Wait for TTL changes to propagate |
| **Phase 3**: New Server Setup | 1-2 hours | None | Install MiaB on new server |
| **Phase 4**: Service Lock & Final Backup | 30 mins | Partial | Lock old server, create final backup |
| **Phase 5**: Data Restoration | 1-3 hours | Partial | Restore backup on new server |
| **Phase 6**: Testing & Verification | 1-2 hours | None | Test all services on new server |
| **Phase 7**: DNS Cutover | 5-15 mins | Full | Switch DNS to new server |
| **Phase 8**: Post-Migration Monitoring | 24-48 hours | None | Monitor for issues |
| **Phase 9**: Decommissioning | 1 week later | None | Shut down old server |

**Total Calendar Time**: 3-5 days
**Total Active Work**: 6-12 hours
**Total Downtime**: 15-30 minutes

---

## Phase 1: Pre-Migration Preparation

**Duration:** 2-4 hours
**Downtime:** None

### 1.1 Document Current Configuration

Before touching anything, document your current setup:

```bash
# SSH into your current Mail-in-a-Box server
ssh user@box.example.com

# Check current MiaB version
sudo mailinabox --version

# Check Ubuntu version
lsb_release -a

# Document all installed mail accounts (from control panel)
# Go to https://box.example.com/admin#system_user
# Export or screenshot list of email accounts

# Document DNS configuration
# Go to https://box.example.com/admin#system_dns
# Screenshot or export DNS records

# Document mail aliases
# Go to https://box.example.com/admin#system_aliases
# Export or screenshot aliases

# Check disk usage
df -h

# Check current backup status
# Go to https://box.example.com/admin#system_status
# Verify last backup date and status
```

**Checklist:**
- [ ] Document current MiaB version
- [ ] Document Ubuntu version
- [ ] List all email accounts with passwords (store securely)
- [ ] List all mail aliases
- [ ] List all domains
- [ ] Screenshot DNS configuration
- [ ] Note any custom configurations or modifications
- [ ] Document current disk usage

### 1.2 Verify Current Backups

```bash
# SSH to current server
ssh user@box.example.com

# Locate backup encryption key
sudo cat /home/user-data/backup/secret_key.txt

# CRITICAL: Copy this key to a secure location immediately
# You will need it to restore your data
```

**Copy the backup secret key to:**
1. Password manager
2. Encrypted local file
3. Printed paper in secure location

**Check backup status in control panel:**
- Navigate to: `https://box.example.com/admin#system_status`
- Verify "Backup Status" is green
- Note the last successful backup date/time
- Verify backup size is reasonable

### 1.3 Upgrade Current Server to Latest Version

**CRITICAL**: Your current server must be on the latest MiaB version before migration.

```bash
# SSH to current server
ssh user@box.example.com

# Run upgrade
curl -s https://mailinabox.email/setup.sh | sudo bash
```

**Wait for upgrade to complete.** This may take 10-30 minutes.

After upgrade:
```bash
# Verify status
sudo mailinabox --version

# Check control panel
# https://box.example.com/admin#system_status
# Ensure all checks are green
```

**If on Ubuntu 18.04 with MiaB v0.50 or earlier:**
You MUST upgrade to v0.51 or later before proceeding. Run the upgrade command above.

### 1.4 Provision New Server

**Choose a VPS provider** (DigitalOcean, Linode, Vultr, etc.)

**Server specifications:**
- **OS**: Ubuntu 22.04 LTS (64-bit)
- **RAM**: 4GB minimum (2GB absolute minimum)
- **Storage**: 50GB+ SSD (depending on your email volume)
- **Region**: Choose geographically close to your users
- **Networking**: Ensure both IPv4 and IPv6 are available

**IMPORTANT IP Considerations:**

1. **Check IP reputation** before committing:
   ```bash
   # After server is provisioned, check IP against blacklists
   # Visit: https://mxtoolbox.com/blacklists.aspx
   # Enter your new server's IP address
   ```

2. **Configure Reverse DNS (rDNS)**:
   - Set PTR record to match your hostname: `box.example.com`
   - This is usually done through your VPS provider's control panel
   - CRITICAL: Must be configured before mail server will work properly

3. **Record new server IP addresses**:
   - IPv4: `_________________`
   - IPv6: `_________________`

### 1.5 Initial Security Setup (New Server)

```bash
# SSH to new server as root
ssh root@NEW_SERVER_IP

# Update system
apt-get update
apt-get upgrade -y

# Create non-root user (if not exists)
adduser yourusername
usermod -aG sudo yourusername

# Set up SSH keys (recommended)
# On your local machine:
# ssh-copy-id yourusername@NEW_SERVER_IP

# Disable root SSH login (recommended but optional at this stage)
# sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
# systemctl restart ssh
```

**Checklist:**
- [ ] New server provisioned
- [ ] Ubuntu 22.04 LTS installed
- [ ] Reverse DNS configured
- [ ] IP reputation checked (not blacklisted)
- [ ] System updated
- [ ] SSH access configured
- [ ] New server IP addresses documented

---

## Phase 2: DNS TTL Reduction

**Duration:** 48 hours (waiting period)
**Downtime:** None

### 2.1 Why Lower TTL?

DNS records have a Time To Live (TTL) value that tells DNS resolvers how long to cache the record. By default, MiaB sets TTL to 1 day (86400 seconds).

When you change DNS records during migration, systems worldwide will cache the old records for the duration of the TTL. By lowering TTL before migration, you minimize how long stale records persist after cutover.

### 2.2 Lower TTL for Critical Records

**48 hours before planned migration**, lower TTL for these record types:

- **A records** (IPv4 addresses)
- **AAAA records** (IPv6 addresses)
- **MX records** (mail servers)
- **CNAME records** (subdomains)

**If using MiaB's built-in DNS:**

1. SSH to current server:
   ```bash
   ssh user@box.example.com
   ```

2. Edit DNS TTL (MiaB doesn't provide UI for this, you'll need to do it via external DNS if needed)

**If using external DNS provider:**

1. Log into your DNS provider (Cloudflare, Route53, etc.)
2. Lower TTL for all domain records to **300 seconds (5 minutes)**
3. Common records to update:
   - `box.example.com` → A/AAAA records
   - `example.com` → MX records
   - `example.com` → A/AAAA records
   - `mail.example.com` → A/AAAA records
   - `www.example.com` → A/AAAA/CNAME records
   - `autoconfig.example.com` → CNAME
   - `autodiscover.example.com` → CNAME

### 2.3 Verify TTL Changes

```bash
# Check current TTL from your local machine
dig box.example.com

# Look for TTL value in the ANSWER section
# example.com.  86400  IN  A  1.2.3.4
#               ↑ this is TTL in seconds
```

**Wait 48 hours** before proceeding to Phase 3. This ensures the old TTL expires and new short TTL is in effect globally.

**Checklist:**
- [ ] TTL lowered to 300 seconds for all critical records
- [ ] Changes verified with `dig` command
- [ ] 48 hours waiting period started
- [ ] Calendar reminder set for next phase

---

## Phase 3: New Server Setup

**Duration:** 1-2 hours
**Downtime:** None (old server still handling mail)

### 3.1 Install Mail-in-a-Box

**CRITICAL**: Use the **exact same hostname** as your old server.

```bash
# SSH to new server
ssh user@NEW_SERVER_IP

# Download and run MiaB installer
curl -s https://mailinabox.email/setup.sh | sudo bash
```

### 3.2 Installation Prompts

The installer will ask several questions:

1. **Email address for the first account:**
   - Enter: `admin@example.com` (use same as old server)
   - This should match your primary admin account

2. **Hostname:**
   - Enter: `box.example.com` (MUST BE EXACT SAME as old server)
   - ⚠️ **WARNING**: If you use a different hostname, DNS and SSL certificates will fail

3. **Country Code for CSR:**
   - Enter your 2-letter country code (e.g., `US`)

4. **Timezone:**
   - Select your timezone (should match old server)

**Installation takes 15-30 minutes.** Let it complete fully.

### 3.3 Post-Installation Check

After installation completes:

```bash
# Check service status
systemctl status mailinabox

# Verify MiaB version
sudo mailinabox --version
```

**Access the control panel** (using new server's IP):

```
https://NEW_SERVER_IP/admin
```

**Login with:**
- Email: `admin@example.com`
- Password: (you set during install)

**Check System Status:**
- Navigate to Status Checks
- You'll see many warnings (expected - DNS not pointed yet)
- Verify these services are running:
  - ✅ Dovecot (IMAP/POP)
  - ✅ Postfix (SMTP)
  - ✅ Nginx (Web server)

### 3.4 Do NOT Configure DNS Yet

⚠️ **IMPORTANT**: Do **NOT** point DNS to the new server yet. The old server is still handling production traffic.

**Checklist:**
- [ ] MiaB installed on new server
- [ ] Same hostname used as old server
- [ ] Control panel accessible via IP
- [ ] System status checked (services running)
- [ ] DNS still pointing to old server

---

## Phase 4: Final Backup & Service Lock

**Duration:** 30 minutes
**Downtime:** Partial (no new emails will be received/sent)

This is where we prevent new emails from arriving while we create the final backup.

### 4.1 Announce Maintenance Window

**24 hours before this phase**, notify users:

> "Scheduled email maintenance on [DATE] at [TIME]. Email services will be briefly unavailable for approximately 30 minutes during the upgrade. All existing emails will be preserved."

### 4.2 Lock Down Old Server

**This prevents new emails from being received or sent:**

```bash
# SSH to OLD server
ssh user@box.example.com

# Reset firewall to lock down all services except SSH
sudo ufw --force reset

# Allow SSH only (so you don't lock yourself out)
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw --force enable

# Verify firewall status
sudo ufw status verbose
```

**Expected output:**
```
Status: active

To                         Action      From
--                         ------      ----
22/tcp                     ALLOW       Anywhere
22/tcp (v6)                ALLOW       Anywhere (v6)
```

**What this does:**
- ✅ SSH still works (port 22 open)
- ❌ Email cannot be sent (port 25, 465, 587 blocked)
- ❌ Email cannot be received (port 993, 995 blocked)
- ❌ Web panel inaccessible (port 443 blocked)
- ❌ DNS queries blocked (port 53 blocked)

### 4.3 Create Final Backup

```bash
# Still on OLD server via SSH

# Manually trigger backup
sudo -u root python3 /root/mailinabox/management/backup.py

# This will take 5-30 minutes depending on data size
# Wait for it to complete
```

**Monitor backup progress:**
```bash
# Check backup logs
sudo tail -f /var/log/syslog | grep backup
```

**Verify backup completed:**
```bash
# Check backup directory
sudo ls -lh /home/user-data/backup/encrypted/

# Should show recent backup files with today's date
```

### 4.4 Download Backup Files (If Using Local Backups)

If your backups are stored locally on the server (not S3/remote):

```bash
# From your local computer
scp -r user@box.example.com:/home/user-data/backup/encrypted/ ~/miab-backup/

# This will download all backup files to your local machine
```

### 4.5 Verify Backup Encryption Key

```bash
# On OLD server
sudo cat /home/user-data/backup/secret_key.txt

# Copy this key - you'll need it for restoration
```

**Checklist:**
- [ ] Maintenance window announced
- [ ] Old server firewall locked down (SSH only)
- [ ] Final backup completed successfully
- [ ] Backup files accessible (local or remote)
- [ ] Backup encryption key saved securely
- [ ] Backup size verified (reasonable for your data)

---

## Phase 5: Data Restoration

**Duration:** 1-3 hours (depends on backup size)
**Downtime:** Partial (still blocked from Phase 4)

### 5.1 Prepare New Server for Restoration

```bash
# SSH to NEW server
ssh user@NEW_SERVER_IP

# CRITICAL: Delete SSL directory
# The restore process will fail if SSL directory has content
sudo rm -rf /home/user-data/ssl/*

# Verify it's empty
sudo ls -la /home/user-data/ssl/
# Should show only . and .. entries
```

⚠️ **WARNING**: If you skip this step, restoration will fail and you'll need to reinstall MiaB from scratch.

### 5.2 Transfer Backup Encryption Key

```bash
# On NEW server, create the secret key file
sudo nano /home/user-data/backup/secret_key.txt

# Paste the backup encryption key you saved earlier
# Save and exit (Ctrl+X, Y, Enter)

# Set proper permissions
sudo chmod 640 /home/user-data/backup/secret_key.txt
sudo chown root:root /home/user-data/backup/secret_key.txt
```

### 5.3 Configure Backup Location

**If backups are on remote storage (S3, B2, etc.):**

```bash
# On NEW server
# Navigate to control panel: https://NEW_SERVER_IP/admin
# Go to: System > Backups
# Configure same backup target as old server
# Enter credentials for S3/B2/etc.
```

**If backups are local files you downloaded:**

```bash
# From your local computer, upload backup to new server
scp -r ~/miab-backup/encrypted/ user@NEW_SERVER_IP:/home/user-data/backup/

# On NEW server, fix permissions
sudo chown -R root:root /home/user-data/backup/encrypted/
sudo chmod -R 640 /home/user-data/backup/encrypted/
```

### 5.4 Run Restoration

```bash
# On NEW server, verify backup files are present
sudo ls -lh /home/user-data/backup/encrypted/

# Restore from backup
sudo -u root python3 /root/mailinabox/management/backup.py --restore
```

**The restoration process will:**
1. Decrypt backup files
2. Restore mail directories
3. Restore user accounts and passwords
4. Restore mail aliases
5. Restore DNS settings
6. Restore SSL certificates (if included)
7. Restore web content

**This can take 30 minutes to 3 hours** depending on backup size.

### 5.5 Post-Restoration Steps

After restoration completes:

```bash
# Re-run MiaB setup to stitch everything together
sudo mailinabox

# This ensures all configurations are properly applied
# Takes 5-10 minutes
```

**Verify restoration:**

```bash
# Check mail directories exist
sudo ls -lh /home/user-data/mail/mailboxes/

# Should show your domain folders

# Check user database
sudo sqlite3 /home/user-data/mail/users.sqlite "SELECT email FROM users;"

# Should list all your email accounts
```

### 5.6 Verify SSL Certificates

```bash
# Check SSL certificate status
sudo management/ssl_certificates.py

# If certificates need to be regenerated:
sudo management/ssl_certificates.py --force
```

**Checklist:**
- [ ] SSL directory cleared before restoration
- [ ] Backup encryption key transferred
- [ ] Backup files accessible on new server
- [ ] Restoration completed successfully
- [ ] MiaB setup re-run after restoration
- [ ] Mail directories present
- [ ] User accounts verified
- [ ] SSL certificates verified

---

## Phase 6: Testing & Verification

**Duration:** 1-2 hours
**Downtime:** None (for testing; production still blocked)

Before switching DNS, thoroughly test the new server.

### 6.1 Access New Server via IP

Since DNS still points to old server, access new server by IP:

```
https://NEW_SERVER_IP/admin
```

**Login with your admin credentials.**

### 6.2 Check System Status

Navigate to **Status Checks** in control panel:

**Expected warnings** (these are normal before DNS cutover):
- ⚠️ Reverse DNS mismatch (because rDNS points to old IP)
- ⚠️ DNS records don't point here (because we haven't switched DNS yet)
- ⚠️ SSL certificate issues (Let's Encrypt can't verify domain ownership yet)

**Must be green:**
- ✅ Services are running
- ✅ Mail accounts exist
- ✅ Disk space sufficient

### 6.3 Test Email Accounts (Using /etc/hosts Hack)

To test email without changing DNS, use the `/etc/hosts` file:

**On your local computer (macOS/Linux):**

```bash
# Edit hosts file
sudo nano /etc/hosts

# Add line:
NEW_SERVER_IP box.example.com mail.example.com example.com

# Save and exit
```

**On Windows:**
1. Edit `C:\Windows\System32\drivers\etc\hosts` as Administrator
2. Add line: `NEW_SERVER_IP box.example.com mail.example.com example.com`

**Now test email:**

1. **Web-based email** (Roundcube):
   - Go to: `https://box.example.com/mail`
   - Login with an email account
   - Verify you can see existing emails
   - Try sending a test email to yourself

2. **IMAP test**:
   ```bash
   # From your local machine
   openssl s_client -connect box.example.com:993 -crlf

   # After connection, enter:
   # a login user@example.com password
   # b select inbox
   # c logout
   ```

3. **SMTP test**:
   ```bash
   # From your local machine
   openssl s_client -connect box.example.com:587 -starttls smtp -crlf

   # After connection, enter:
   # EHLO example.com
   # AUTH LOGIN
   # (then provide base64 encoded username and password)
   ```

### 6.4 Test Mail Client Configuration

Configure a desktop mail client (Thunderbird, Apple Mail, etc.) to connect to new server:

**IMAP Settings:**
- Server: `box.example.com` (or NEW_SERVER_IP)
- Port: 993
- Security: SSL/TLS
- Username: `user@example.com`
- Password: (your password)

**SMTP Settings:**
- Server: `box.example.com` (or NEW_SERVER_IP)
- Port: 587
- Security: STARTTLS
- Username: `user@example.com`
- Password: (your password)

**Test:**
- [ ] Can receive existing emails
- [ ] Can send emails
- [ ] Folders appear correctly
- [ ] Attachments work

### 6.5 Verify User Accounts

```bash
# SSH to new server
ssh user@NEW_SERVER_IP

# List all users
sudo sqlite3 /home/user-data/mail/users.sqlite "SELECT email FROM users;"

# Count should match old server
```

### 6.6 Verify Mail Aliases

**In control panel:**
- Go to: System > Aliases
- Verify all aliases are present
- Test an alias by sending email to it

### 6.7 Remove /etc/hosts Entry

After testing, restore your local hosts file:

```bash
# On your local computer
sudo nano /etc/hosts

# Remove or comment out the line you added:
# NEW_SERVER_IP box.example.com mail.example.com example.com

# Save and exit
```

**Checklist:**
- [ ] Control panel accessible on new server
- [ ] System status checks reviewed
- [ ] Webmail (Roundcube) works
- [ ] IMAP connections successful
- [ ] SMTP sending successful
- [ ] Desktop mail client works
- [ ] All user accounts present
- [ ] All aliases present
- [ ] Test emails sent and received
- [ ] /etc/hosts entry removed

---

## Phase 7: DNS Cutover

**Duration:** 5-15 minutes (plus propagation time)
**Downtime:** 15-30 minutes total

This is the critical moment where you switch production traffic to the new server.

### 7.1 Pre-Cutover Checklist

Before changing DNS, ensure:

- [ ] New server fully tested (Phase 6 complete)
- [ ] Backup encryption key saved
- [ ] Old server still accessible via SSH
- [ ] New server IP addresses documented
- [ ] Reverse DNS configured for new IP
- [ ] Maintenance window announced

### 7.2 Update DNS Records

**If using external DNS provider:**

Log into your DNS provider and update these records:

1. **A Record for mail subdomain:**
   - Hostname: `box.example.com`
   - Type: `A`
   - Value: `NEW_SERVER_IPv4`
   - TTL: `300`

2. **AAAA Record for mail subdomain (if using IPv6):**
   - Hostname: `box.example.com`
   - Type: `AAAA`
   - Value: `NEW_SERVER_IPv6`
   - TTL: `300`

3. **A Record for main domain:**
   - Hostname: `example.com`
   - Type: `A`
   - Value: `NEW_SERVER_IPv4`
   - TTL: `300`

4. **MX Record:**
   - Hostname: `example.com`
   - Type: `MX`
   - Priority: `10`
   - Value: `box.example.com.` (note the trailing dot)
   - TTL: `300`

5. **Update SPF, DKIM, DMARC records:**
   - These should be automatically correct if you used the same hostname
   - But verify in new server's control panel under System > DNS

6. **Other subdomains:**
   - `mail.example.com` → `A` → `NEW_SERVER_IPv4`
   - `www.example.com` → `A` → `NEW_SERVER_IPv4`
   - `autoconfig.example.com` → `CNAME` → `box.example.com`
   - `autodiscover.example.com` → `CNAME` → `box.example.com`

**If using MiaB's built-in DNS:**

MiaB manages DNS for you. The main glue records need updating at your domain registrar:

1. Log into your domain registrar
2. Update nameserver glue records (if you use custom nameservers):
   - `ns1.box.example.com` → `NEW_SERVER_IPv4`
   - `ns2.box.example.com` → `NEW_SERVER_IPv4`
3. Wait for nameserver updates to propagate (can take 24-48 hours)

**Recommended approach**: Use external DNS provider for faster cutover.

### 7.3 Verify DNS Propagation

```bash
# From your local machine

# Check A record
dig box.example.com +short
# Should return NEW_SERVER_IPv4

# Check MX record
dig example.com MX +short
# Should show: 10 box.example.com.

# Check from multiple locations
# Visit: https://dnschecker.org
# Enter: box.example.com
# Verify all locations show new IP
```

**DNS propagation typically takes:**
- 5 minutes: 50% of users
- 30 minutes: 90% of users
- 2 hours: 99% of users
- 24 hours: 99.9% of users

Because you lowered TTL in Phase 2, propagation should be fast (5-15 minutes).

### 7.4 Request SSL Certificates

Once DNS points to new server, request fresh SSL certificates:

```bash
# SSH to NEW server
ssh user@NEW_SERVER_IP

# Force SSL certificate renewal
sudo management/ssl_certificates.py --force

# Check certificate status
sudo management/ssl_certificates.py
```

This uses Let's Encrypt and may take 2-5 minutes.

**Verify SSL in control panel:**
- Navigate to: System > TLS Certificates
- All domains should show valid certificates

### 7.5 Open New Server Firewall

By default, MiaB configures the firewall. Verify it's open:

```bash
# On NEW server
sudo ufw status verbose

# Should show these ports ALLOW:
# 22, 25, 53, 80, 443, 465, 587, 993, 995, 4190
```

If firewall is too restrictive:

```bash
# Reset and reconfigure
sudo ufw --force reset
sudo mailinabox
```

### 7.6 Monitor Email Flow

**Watch mail logs on new server:**

```bash
# On NEW server
sudo tail -f /var/log/mail.log

# You should start seeing:
# - Incoming connections
# - Email deliveries
# - IMAP logins
```

**Send test emails:**
1. Send email TO your domain from external provider (Gmail, etc.)
2. Send email FROM your domain to external provider
3. Verify both directions work

**Check for bounces:**
- Monitor your inbox for bounce messages
- Check Spam/Junk folders

### 7.7 User Notification

Once DNS has propagated and mail is flowing:

**Notify users:**

> "Email maintenance complete. Services are now fully operational. If you experience any issues, please restart your email client. Contact support if problems persist."

**Checklist:**
- [ ] DNS records updated at provider
- [ ] A records point to new server
- [ ] MX records point to new server
- [ ] DNS propagation verified (dig commands)
- [ ] SSL certificates issued successfully
- [ ] Firewall properly configured on new server
- [ ] Test email sent TO domain (successful)
- [ ] Test email sent FROM domain (successful)
- [ ] Mail logs showing activity
- [ ] Users notified

---

## Phase 8: Post-Migration Monitoring

**Duration:** 24-48 hours
**Downtime:** None

### 8.1 Monitor System Status

**First 24 hours:**

Check control panel status every 2-4 hours:
- Navigate to: `https://box.example.com/admin#system_status`
- Verify all checks are green

**Watch for:**
- ❌ Disk space issues
- ❌ Memory/CPU spikes
- ❌ Certificate errors
- ❌ DNS misconfigurations

### 8.2 Monitor Mail Logs

```bash
# SSH to NEW server
ssh user@NEW_SERVER_IP

# Watch mail logs for errors
sudo tail -f /var/log/mail.log | grep -i error

# Watch for delivery failures
sudo tail -f /var/log/mail.log | grep -i failed

# Check mail queue
sudo mailq
# Should be empty or minimal
```

### 8.3 Monitor Bounce Reports

**Check admin mailbox** for:
- Delivery failure notifications
- Blacklist warnings
- User complaints

**Common bounce reasons:**
- Reverse DNS not configured
- IP on spam blacklist
- SPF/DKIM misaligned

### 8.4 Check IP Reputation

```bash
# Visit these tools:
# https://mxtoolbox.com/blacklists.aspx
# https://www.hetrixtools.com/blacklist-check/

# Enter NEW_SERVER_IPv4
# Verify not blacklisted
```

If blacklisted:
1. Follow delisting procedures for each blacklist
2. Most blacklists offer automatic delisting after 24-48 hours
3. Some require manual request

### 8.5 Verify Backup Schedule

```bash
# On NEW server
# Backups should run nightly at 3 AM

# Next morning, check backup status
sudo python3 /root/mailinabox/management/backup.py --verify

# Or check via control panel:
# System > Backup Status
```

### 8.6 User Support

**Be available** for user questions in first 48 hours:
- Password resets
- Configuration help
- Mobile device reconfiguration

**Common user issues:**
- Mobile devices still pointing to old IP (require restart)
- Cached DNS on client devices (require flush)
- Password not working (may need reset)

### 8.7 Performance Baseline

Establish performance baselines:

```bash
# Check resource usage
htop

# Check disk I/O
iotop

# Check network traffic
iftop
```

**Record baseline metrics:**
- Average CPU usage: ____%
- Average memory usage: ____%
- Disk usage: ____%
- Network traffic: ____MB/day

**Checklist:**
- [ ] System status monitored regularly
- [ ] Mail logs reviewed for errors
- [ ] No bounces or delivery failures
- [ ] IP reputation checked (not blacklisted)
- [ ] Backup schedule verified
- [ ] User support provided
- [ ] Performance baselines recorded
- [ ] Old server still kept online (for Phase 9)

---

## Phase 9: Decommissioning Old Server

**Duration:** 30 minutes (after 1 week)
**Downtime:** None

**Wait at least 7 days** after cutover before decommissioning old server.

### 9.1 Why Wait?

- Some DNS resolvers may still cache old records
- Stragglers might still send email to old server
- You may discover issues requiring rollback
- Old server serves as backup/recovery option

### 9.2 Final Data Verification

Before shutting down old server:

```bash
# SSH to OLD server
ssh user@box.example.com

# Check if any new emails arrived after cutover
sudo ls -lah /home/user-data/mail/mailboxes/*/Maildir/new/

# If any emails present, forward them:
# Use control panel to forward to addresses on new server
```

### 9.3 Export Old Server Data (Optional)

Create a final archive for safe-keeping:

```bash
# On OLD server
sudo tar -czf /root/old-miab-final.tar.gz /home/user-data/

# Download to your local machine
scp user@box.example.com:/root/old-miab-final.tar.gz ~/backups/
```

### 9.4 Increase DNS TTL

Now that migration is complete, increase TTL for better performance:

**Update DNS records:**
- Change TTL from `300` back to `86400` (24 hours)
- Or use provider default (usually 1 hour to 1 day)

### 9.5 Document New Server

Update your documentation:

- [ ] New server IP addresses
- [ ] New server hostname (should be same)
- [ ] New server provider
- [ ] New server specs (RAM, disk, etc.)
- [ ] New backup location
- [ ] Migration completion date
- [ ] Current MiaB version
- [ ] Current Ubuntu version

### 9.6 Shutdown Old Server

**Only after:**
- 7+ days since cutover
- No issues reported
- New server stable
- Final data exported

**To shutdown:**

```bash
# SSH to OLD server
ssh user@box.example.com

# Shutdown
sudo shutdown -h now
```

**Via VPS provider:**
1. Log into provider dashboard
2. Power off the old server
3. Wait 24-48 hours
4. If no issues, destroy/delete the old server

⚠️ **WARNING**: Once server is destroyed, data is unrecoverable (unless you have backups).

**Checklist:**
- [ ] At least 7 days passed since cutover
- [ ] No stragglers emails on old server
- [ ] Final data archive created
- [ ] DNS TTL increased back to normal
- [ ] New server documentation complete
- [ ] Old server powered off
- [ ] Old server destroyed (after 48 hour grace period)

---

## Rollback Procedures

### When to Rollback

Consider rollback if:
- Migration fails at Phase 5 (restoration)
- SSL certificates won't provision on new server
- Critical data missing after migration
- Mail delivery completely broken
- Users cannot authenticate

**Do NOT rollback for:**
- Minor DNS propagation delays (give it time)
- Individual user issues (fixable)
- Cosmetic problems

### Rollback: During Phase 4-5 (Before DNS Cutover)

**If migration fails before you changed DNS:**

✅ **Good news:** This is easiest scenario. Your old server is still handling production mail.

```bash
# 1. SSH to OLD server
ssh user@box.example.com

# 2. Re-enable firewall
sudo ufw --force reset
sudo mailinabox
# This will reconfigure firewall properly

# 3. Verify services
systemctl status postfix dovecot nginx

# 4. Check control panel
# https://box.example.com/admin#system_status
# All should be green

# 5. Notify users
# "Maintenance window extended. Services are operational."
```

**That's it.** Your old server continues working. You can retry migration later.

### Rollback: After Phase 7 (After DNS Cutover)

**If you discover critical issues after DNS cutover:**

⚠️ This is more involved but still recoverable.

#### Step 1: Switch DNS Back to Old Server

```bash
# Get old server IP (you documented this, right?)
OLD_SERVER_IPv4=1.2.3.4

# Update DNS records back:
# - box.example.com A → OLD_SERVER_IPv4
# - example.com MX → box.example.com
```

**DNS propagation will take 5-15 minutes** (because you lowered TTL).

#### Step 2: Re-enable Old Server Services

```bash
# SSH to OLD server
ssh user@box.example.com

# Re-enable firewall
sudo ufw --force reset
sudo mailinabox

# Verify services running
systemctl status postfix dovecot nginx
```

#### Step 3: Handle Split-Brain Emails

**Problem:** Some emails went to new server, some to old server.

**Solution:** Sync mailboxes manually:

```bash
# Install imapsync on your local machine
# On macOS:
brew install imapsync

# On Linux:
apt-get install imapsync

# Sync each mailbox from NEW → OLD
imapsync \
  --host1 NEW_SERVER_IP \
  --user1 user@example.com \
  --password1 'password' \
  --host2 OLD_SERVER_IP \
  --user2 user@example.com \
  --password2 'password' \
  --syncinternaldates \
  --no-modulesversion

# Repeat for each user account
```

**Or use the control panel:**
1. On NEW server, export mailboxes via Webmail (download as .mbox)
2. On OLD server, import mailboxes via Webmail (upload .mbox files)

#### Step 4: Notify Users

```
"Due to unforeseen issues, we've rolled back to the previous mail server.
Your emails from the past [HOURS] may need to be re-synced.
Please restart your email client.
We apologize for the inconvenience."
```

#### Step 5: Investigate New Server Issues

Don't rush. Take time to diagnose:

```bash
# SSH to NEW server
ssh user@NEW_SERVER_IP

# Check logs
sudo tail -n 500 /var/log/mail.log
sudo tail -n 500 /var/log/syslog

# Check status
sudo mailinabox
systemctl status postfix dovecot nginx

# Check disk space
df -h

# Check SSL certs
sudo management/ssl_certificates.py
```

**Common rollback reasons and fixes:**

| Issue | Cause | Fix |
|-------|-------|-----|
| SSL won't provision | DNS not fully propagated | Wait longer (up to 1 hour) |
| Mail bouncing | Reverse DNS not set | Configure rDNS at VPS provider |
| Authentication fails | User DB corrupt | Re-run restoration, ensure `/home/user-data/backup/secret_key.txt` is correct |
| Missing emails | Backup incomplete | Use older backup or re-backup from old server |

#### Step 6: Retry Migration

After fixing issues:
1. Keep old server as primary
2. Destroy new server or re-image it
3. Restart from Phase 3 with fixes applied

---

## Common Pitfalls & Troubleshooting

### Issue: SSL Certificates Won't Provision

**Symptoms:**
- Let's Encrypt errors in logs
- "Unable to validate domain ownership" errors
- Control panel shows SSL warnings

**Causes:**
1. DNS not fully propagated yet
2. Firewall blocking port 80
3. Reverse DNS misconfigured

**Solutions:**

```bash
# 1. Wait for DNS propagation
dig box.example.com +short
# Must return new server IP from multiple locations

# 2. Check firewall
sudo ufw status verbose
# Port 80 must be ALLOW

# 3. Verify reverse DNS
host NEW_SERVER_IPv4
# Should return: box.example.com

# 4. Force retry
sudo management/ssl_certificates.py --force

# 5. Check Let's Encrypt rate limits
# https://letsencrypt.org/docs/rate-limits/
# If you hit limits, wait 1 week or use staging environment
```

### Issue: Emails Bouncing

**Symptoms:**
- Users report sent emails bouncing
- "550 Relay not permitted" errors
- Delivery failure notifications

**Causes:**
1. SPF record not updated
2. Reverse DNS missing
3. IP on spam blacklist
4. Authentication failures

**Solutions:**

```bash
# 1. Check SPF record
dig example.com TXT +short | grep spf

# Should include new server IP:
# "v=spf1 mx ip4:NEW_SERVER_IPv4 -all"

# 2. Verify reverse DNS
host NEW_SERVER_IPv4
# Must match: box.example.com

# 3. Check blacklists
# https://mxtoolbox.com/blacklists.aspx
# If blacklisted, request delisting

# 4. Test SMTP auth
openssl s_client -connect box.example.com:587 -starttls smtp
# Should show successful TLS handshake

# 5. Check mail logs
sudo tail -f /var/log/mail.log
# Look for authentication errors
```

### Issue: Missing Emails After Migration

**Symptoms:**
- Users report missing folders
- Inbox empty on new server
- Search shows missing emails

**Causes:**
1. Backup incomplete
2. Restoration failed partially
3. SSL directory not cleared before restore

**Solutions:**

```bash
# 1. Check mail directories
sudo ls -lah /home/user-data/mail/mailboxes/example.com/user/

# Should show: Maildir/cur/, Maildir/new/, Maildir/tmp/

# 2. Check backup integrity
sudo python3 /root/mailinabox/management/backup.py --verify

# 3. Re-run restoration
# First, clear SSL directory:
sudo rm -rf /home/user-data/ssl/*

# Then restore:
sudo python3 /root/mailinabox/management/backup.py --restore

# Then reconfigure:
sudo mailinabox

# 4. As last resort, rollback and re-backup old server
```

### Issue: Users Can't Authenticate

**Symptoms:**
- "Authentication failed" errors
- "Invalid username or password"
- Webmail login fails

**Causes:**
1. Password database not restored
2. User database corrupt
3. Wrong hostname used

**Solutions:**

```bash
# 1. Check user database
sudo sqlite3 /home/user-data/mail/users.sqlite "SELECT email FROM users;"

# Should list all users

# 2. Manually reset a password
sudo tools/mail.py user password user@example.com

# 3. Check dovecot auth logs
sudo tail -f /var/log/mail.log | grep dovecot

# 4. Verify hostname matches
hostname -f
# Must be: box.example.com (exact match to old server)

# 5. Re-run restoration if database missing
```

### Issue: Slow Performance on New Server

**Symptoms:**
- Webmail slow to load
- Email delivery delayed
- Control panel timeouts

**Causes:**
1. Insufficient RAM
2. High disk I/O
3. Database indexing in progress

**Solutions:**

```bash
# 1. Check RAM usage
free -h
# Available should be > 512MB

# 2. Check disk I/O
iotop
# Look for high % values

# 3. Check CPU
htop
# Load average should be < number of CPU cores

# 4. Wait for indexing to complete
# After migration, databases rebuild indexes
# This can take 1-4 hours

# 5. Consider upgrading server specs
# Minimum: 2GB RAM → Recommended: 4GB RAM
```

### Issue: Control Panel Status Checks Not Green

**Symptom:**
- Persistent warnings in status checks after DNS cutover

**Common warnings and fixes:**

| Warning | Cause | Fix |
|---------|-------|-----|
| "Nameserver glue records..." | Using external DNS | Ignore if not using MiaB DNS |
| "Reverse DNS is not set..." | rDNS not configured | Configure at VPS provider |
| "Domain's A/AAAA records..." | DNS not fully propagated | Wait 1-24 hours |
| "TLS certificate is missing..." | Let's Encrypt failed | Run `sudo management/ssl_certificates.py --force` |
| "Email is being rejected..." | IP blacklisted | Check blacklists and delist |

**To re-check status:**

```bash
# SSH to server
sudo management/status_checks.py

# Or use control panel:
# https://box.example.com/admin#system_status
```

### Issue: Restore Fails with "SSL Directory Not Empty"

**Symptom:**
```
Error: Cannot restore. SSL directory must be empty.
```

**Cause:**
MiaB creates initial SSL certs during install. Restore process can't overwrite them.

**Solution:**

```bash
# SSH to NEW server (before restoration)
sudo rm -rf /home/user-data/ssl/*

# Verify empty
sudo ls -la /home/user-data/ssl/
# Should show only . and ..

# Now run restore
sudo python3 /root/mailinabox/management/backup.py --restore
```

⚠️ **CRITICAL**: Do this BEFORE first restoration attempt, or you'll need to reinstall MiaB from scratch.

---

## Appendix: Command Reference

### Backup Commands

```bash
# Manual backup
sudo -u root python3 /root/mailinabox/management/backup.py

# Verify backup integrity
sudo python3 /root/mailinabox/management/backup.py --verify

# Restore from backup
sudo python3 /root/mailinabox/management/backup.py --restore

# Check backup location
sudo cat /home/user-data/backup/custom.yaml

# View backup secret key
sudo cat /home/user-data/backup/secret_key.txt
```

### SSL Certificate Commands

```bash
# Check certificate status
sudo management/ssl_certificates.py

# Force certificate renewal
sudo management/ssl_certificates.py --force

# View certificate details
sudo openssl x509 -in /home/user-data/ssl/ssl_certificate.pem -text -noout
```

### User Management Commands

```bash
# List all users
sudo sqlite3 /home/user-data/mail/users.sqlite "SELECT email FROM users;"

# Add user
sudo tools/mail.py user add user@example.com

# Remove user
sudo tools/mail.py user remove user@example.com

# Change password
sudo tools/mail.py user password user@example.com

# Make user admin
sudo tools/mail.py user make-admin user@example.com

# Remove admin privileges
sudo tools/mail.py user remove-admin user@example.com
```

### Alias Management Commands

```bash
# List aliases
sudo tools/mail.py alias list

# Add alias
sudo tools/mail.py alias add alias@example.com user@example.com

# Remove alias
sudo tools/mail.py alias remove alias@example.com
```

### System Commands

```bash
# Run MiaB setup/upgrade
sudo mailinabox

# Check MiaB version
sudo mailinabox --version

# Run status checks
sudo management/status_checks.py

# Check all services
systemctl status postfix dovecot nginx php8.1-fpm fail2ban

# Restart all services
sudo systemctl restart postfix dovecot nginx php8.1-fpm

# Reboot server
sudo reboot
```

### Firewall Commands

```bash
# Check firewall status
sudo ufw status verbose

# Reset firewall
sudo ufw --force reset

# Allow specific port
sudo ufw allow 22/tcp

# Enable firewall
sudo ufw --force enable

# Disable firewall (not recommended)
sudo ufw disable
```

### Log Monitoring Commands

```bash
# Watch mail logs
sudo tail -f /var/log/mail.log

# Watch for errors
sudo tail -f /var/log/mail.log | grep -i error

# Watch for authentication
sudo tail -f /var/log/mail.log | grep -i auth

# Check mail queue
sudo mailq

# View system logs
sudo tail -f /var/log/syslog
```

### DNS Testing Commands

```bash
# Check A record
dig box.example.com +short

# Check MX record
dig example.com MX +short

# Check TXT records (SPF, DKIM, DMARC)
dig example.com TXT +short

# Check from specific DNS server
dig @8.8.8.8 box.example.com +short

# Check reverse DNS
host 1.2.3.4

# Flush local DNS cache (macOS)
sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder

# Flush local DNS cache (Linux)
sudo systemd-resolve --flush-caches

# Flush local DNS cache (Windows)
ipconfig /flushdns
```

### Network Testing Commands

```bash
# Test SMTP connection
openssl s_client -connect box.example.com:587 -starttls smtp

# Test IMAP connection
openssl s_client -connect box.example.com:993

# Test port connectivity
nc -zv box.example.com 25

# Check listening ports
sudo netstat -tlnp | grep LISTEN

# Test HTTP/HTTPS
curl -I https://box.example.com
```

### Disk & Performance Commands

```bash
# Check disk usage
df -h

# Check directory sizes
du -sh /home/user-data/*

# Check RAM usage
free -h

# Check swap usage
swapon --show

# Monitor CPU and processes
htop

# Monitor disk I/O
iotop

# Monitor network
iftop

# Check system load
uptime

# Check available updates
apt list --upgradable
```

---

## Migration Timeline Cheat Sheet

| Day | Phase | Action | Duration | Downtime |
|-----|-------|--------|----------|----------|
| **Day -2** | Phase 1-2 | Document, backup verify, lower DNS TTL | 2 hours | None |
| **Day 0** | Phase 3 | Provision and install new server | 2 hours | None |
| **Day 1** | Phase 4 | Lock services, final backup | 30 mins | Partial |
| **Day 1** | Phase 5 | Restore data to new server | 1-3 hours | Partial |
| **Day 1** | Phase 6 | Test new server | 1-2 hours | None |
| **Day 1** | Phase 7 | Switch DNS, cutover | 15 mins | Full |
| **Day 1-3** | Phase 8 | Monitor and support | Ongoing | None |
| **Day 8+** | Phase 9 | Decommission old server | 30 mins | None |

---

## Emergency Contacts

**Before starting migration, document:**

- VPS provider support: ___________________
- Domain registrar support: ___________________
- DNS provider support: ___________________
- Your escalation contact: ___________________
- Backup administrator: ___________________

**Official Mail-in-a-Box Resources:**

- Documentation: https://mailinabox.email/
- Forum: https://discourse.mailinabox.email/
- GitHub: https://github.com/mail-in-a-box/mailinabox

---

## Final Notes

### Success Criteria

Migration is successful when:
- ✅ All email accounts accessible
- ✅ Email sending and receiving works
- ✅ All aliases functional
- ✅ SSL certificates valid
- ✅ All status checks green
- ✅ Backup schedule running
- ✅ No user complaints
- ✅ Old server decommissioned

### Estimated Costs

**Time investment:**
- Technical work: 8-12 hours
- Waiting periods: 3-5 days
- Monitoring: 24-48 hours

**Financial costs:**
- New server: $10-20/month (ongoing)
- Old server: $10-20/month (1 week overlap)
- Domain renewal: $0 (no change)
- SSL certificates: $0 (Let's Encrypt)
- **Total extra cost**: ~$10-20 (one-time for server overlap)

### Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Data loss | Low | High | Multiple backups, verification |
| Extended downtime | Low | Medium | Thorough testing, rollback plan |
| DNS propagation delays | Medium | Low | Lower TTL in advance |
| User confusion | Medium | Low | Clear communication |
| SSL certificate issues | Medium | Low | DNS verification, patient waiting |
| IP blacklisting | Low | Medium | Check reputation before, monitor after |

### Best Practices Summary

1. **Never skip backups**: Always have multiple backup copies
2. **Document everything**: Write down IPs, passwords, configurations
3. **Test thoroughly**: Don't rush the testing phase
4. **Communicate clearly**: Keep users informed
5. **Lower TTL early**: Do this 48 hours before cutover
6. **Keep old server running**: Don't destroy until 100% confident
7. **Monitor actively**: Watch logs closely first 48 hours
8. **Have rollback plan**: Know how to revert if needed

---

## Document Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-12 | Initial comprehensive migration plan |

---

## Sources

This migration plan was compiled using the following authoritative sources:

- [Mail-in-a-Box Official Maintenance Guide](https://mailinabox.email/maintenance.html)
- [Migration to a new server - Mail-in-a-Box Forum](https://discourse.mailinabox.email/t/migration-to-a-new-server/11226)
- [Building and Restoring a MIAB Server - Mike Neumann](https://mikeneumann.net/tech/build-and-restore-a-miab-server/)
- [Mailinabox: Upgrade to Ubuntu 22.04 - Zechendorf](https://zechendorf.com/2023/12/22/mailinabox-ubuntu-22.04.html)
- [Mail-in-a-Box Setup Guide](https://mailinabox.email/guide.html)
- [DNS TTL Best Practices - DCHost Blog](https://www.dchost.com/blog/en/dns-ttl-best-practices-for-a-mx-cname-and-txt-records/)
- [DNS Migration Best Practices - No-IP Blog](https://blog.noip.com/dns-migration-best-practices)
- [Same Domain Email Migration - MailJerry](https://www.mailjerry.com/same-domain-email-migration-dns-mx-settings/)
- [Mail-in-a-Box GitHub Repository](https://github.com/mail-in-a-box/mailinabox)
- [Mail-in-a-Box Forum Discussions](https://discourse.mailinabox.email/)

---

**End of Migration Plan**

*This is a living document. Update as your migration progresses and you discover new insights.*
