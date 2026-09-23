#!/bin/sh
set -eu

fail() {
    echo "entrypoint: $1" >&2
    exit 1
}

# --- required secrets: fail fast instead of booting insecurely -------------
[ -n "${APP_SECRET:-}" ] || fail "APP_SECRET is not set. Generate one with: openssl rand -hex 16"
[ -n "${SFTP_AUTHORIZED_KEYS:-}" ] || fail "SFTP_AUTHORIZED_KEYS is not set (at least one SSH public key is required to use the file-drop SFTP account)."

# --- SSH host keys (persist by mounting a volume at /etc/ssh) --------------
ssh-keygen -A >/dev/null 2>&1 || true

# --- SFTP chroot jail --------------------------------------------------
# Every path component of a Chroot dir must be root-owned and non-writable
# by anyone else, so this lives outside /var/www/html rather than inside it;
# docker/sftp-sync.sh relays finished uploads into public/uploads/.
mkdir -p /srv/sftp/uploads/incoming
chown root:root /srv/sftp/uploads
chmod 755 /srv/sftp/uploads
chown aca_sftp:aca_sftp /srv/sftp/uploads/incoming
chmod 755 /srv/sftp/uploads/incoming

mkdir -p /etc/ssh/authorized_keys
: > /etc/ssh/authorized_keys/aca_sftp
printf '%s\n' "$SFTP_AUTHORIZED_KEYS" | tr '|' '\n' | while IFS= read -r key; do
    [ -n "$key" ] && printf '%s\n' "$key" >> /etc/ssh/authorized_keys/aca_sftp
done
chown root:root /etc/ssh/authorized_keys/aca_sftp
# 644 not 600: Alpine's OpenSSH build refuses to read a 600 authorized_keys
# file here ("Permission denied") — confirmed empirically. Safe regardless,
# since this file only ever holds public keys.
chmod 644 /etc/ssh/authorized_keys/aca_sftp

# --- app writable dirs (in case var/ is volume-mounted fresh) --------------
mkdir -p /var/www/html/var/cache /var/www/html/var/log /var/www/html/public/uploads
chown -R www-data:www-data /var/www/html/var /var/www/html/public/uploads

exec "$@"
