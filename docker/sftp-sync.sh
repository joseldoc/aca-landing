#!/bin/sh
# Polls the SFTP jail's incoming/ folder and moves anything dropped there
# into public/uploads/, where nginx serves it at /uploads/<file>. A polling
# loop (rather than inotify) keeps this portable across container runtimes
# that don't expose inotify to the container.
set -eu

SRC=/srv/sftp/uploads/incoming
DEST=/var/www/html/public/uploads

while true; do
    if [ -d "$SRC" ]; then
        find "$SRC" -mindepth 1 -maxdepth 1 2>/dev/null | while IFS= read -r item; do
            name=$(basename "$item")
            mv "$item" "$DEST/$name" 2>/dev/null && chown www-data:www-data "$DEST/$name" 2>/dev/null || true
        done
    fi
    sleep 5
done
