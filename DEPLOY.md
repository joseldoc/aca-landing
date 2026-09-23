# Deploying ACA Nettoyage to a VPS

One image, three processes inside it (nginx, PHP-FPM, and an SFTP-only SSH
server), managed by supervisord. Build it, run it with real secrets, done.

## 1. Prerequisites

- A Linux VPS with Docker (and the Compose plugin) installed.
- This repo's code on that VPS (`git clone` it, or `scp`/`rsync` it over).
- An SSH keypair on your own machine for whoever needs to drop files onto
  the site (e.g. real photos to replace the Unsplash placeholders):
  `ssh-keygen -t ed25519 -f aca_deploy_key` (do this locally, not on the VPS).

## 2. Configure secrets

```
cp .env.prod.example .env.prod
```

Edit `.env.prod` and fill in:

- `APP_SECRET` — generate with `openssl rand -hex 16`.
- `MAILER_DSN` — leave as `null://null` until real SMTP credentials exist
  (see the TODO in `src/Controller/HomeController.php`); the contact form
  keeps working either way, it just won't send real email until this is set.
- `SFTP_AUTHORIZED_KEYS` — paste the **public** key (the `.pub` file's
  contents) from step 1. Multiple keys can be separated with `|`.

`.env.prod` is git-ignored — never commit it. `.env.prod.example` (the
template, with no real values) is the only one that belongs in version
control.

## 3. Build and run

```
docker compose -f docker-compose.prod.yml up -d --build
```

This builds the image (multi-stage: `composer install` in one stage, a
`php:8.4-fpm-alpine` runtime in the other — nginx, PHP-FPM, and the SFTP
server all run inside that single container via supervisord) and starts it,
publishing:

- port **80** → the site
- port **2222** → SFTP (mapped away from 22 to keep default-port bot noise
  off the real SSH port, in case you also run plain SSH on the host)

Without Compose, the equivalent is:

```
docker build -t aca-landing .
docker run -d --name aca-landing --restart unless-stopped \
  -p 80:80 -p 2222:22 \
  --env-file .env.prod \
  -v aca_ssh_host_keys:/etc/ssh \
  -v aca_uploads:/var/www/html/public/uploads \
  aca-landing
```

## 4. Verify

- Visit `http://<vps-ip>/` — the site should load.
- `curl -i http://<vps-ip>/.env` should return **403** (config/secrets are
  never servable — verified in `docker/nginx.conf`).
- `sftp -P 2222 -i aca_deploy_key aca_sftp@<vps-ip>` should connect straight
  into an `incoming/` folder. Anything dropped there is picked up within a
  few seconds and becomes available at `http://<vps-ip>/uploads/<file>`.
  The account is chrooted, key-only, no shell — verified: password auth,
  root login, and escaping the jail (`cd /`, `cd ..`) all refuse cleanly.

## 5. Firewall

Only expose what's needed: 80 (and 443 once you add TLS — see below), and
2222. Leave the real port 22 for your own host SSH access, separate from
the container's SFTP-only port 2222.

## 6. HTTPS

This setup deliberately stays at plain HTTP — TLS termination is a separate
concern (a cert renews, this container doesn't need to know about it). The
straightforward way to add it without touching this image: put a small
reverse proxy in front that only does TLS, e.g. [Caddy](https://caddyserver.com/)
with a two-line Caddyfile (`your-domain.fr { reverse_proxy localhost:80 }`)
handles Let's Encrypt automatically. Point the VPS's port 80/443 at Caddy,
and Caddy at this container's port 80.

## 7. Redeploying after a code change

```
git pull   # or however new code lands on the VPS
docker compose -f docker-compose.prod.yml up -d --build
```

The image bakes in `opcache.validate_timestamps=0` and a warmed prod cache
for performance — that's exactly why a rebuild (not just a file copy) is
required on every change; a full container recreate always picks up fresh
opcache and cache state.

## 8. Rotating or adding SFTP keys

Edit `SFTP_AUTHORIZED_KEYS` in `.env.prod`, then:

```
docker compose -f docker-compose.prod.yml up -d
```

(No rebuild needed — the entrypoint rewrites the authorized_keys file from
that env var on every container start.)

## What NOT to do

- Don't commit `.env.prod`.
- Don't loosen `docker/sshd_config`'s `PasswordAuthentication no` /
  `PermitRootLogin no` — the SFTP account is meant to be key-only and
  unprivileged.
- Don't point `SFTP_AUTHORIZED_KEYS` at a key you don't control — anyone
  holding the matching private key can write into `public/uploads/`.
