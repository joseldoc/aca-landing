# syntax=docker/dockerfile:1

# ---------- Stage 1: PHP dependencies --------------------------------------
FROM composer:2 AS vendor
WORKDIR /app
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-interaction --optimize-autoloader --no-progress
COPY . .
RUN composer dump-autoload --optimize --no-dev --classmap-authoritative

# ---------- Stage 2: runtime image ------------------------------------------
FROM php:8.4-fpm-alpine AS app

RUN apk add --no-cache \
        nginx \
        supervisor \
        openssh-server \
        openssh-sftp-server \
        shadow \
        bash \
    && docker-php-ext-install opcache \
    && rm -rf /var/cache/apk/*

# Dedicated, shell-less SFTP account — see docker/sshd_config for the jail.
# Alpine's `adduser -D` leaves the shadow password field as "!" (locked),
# which OpenSSH refuses to authenticate even with a valid key — pubkey auth
# needs the account merely password-less ("*"), not locked.
RUN addgroup -S aca_sftp \
    && adduser -S -D -H -h /incoming -s /sbin/nologin -G aca_sftp aca_sftp \
    && usermod -p '*' aca_sftp

COPY docker/php/zz-app.ini /usr/local/etc/php/conf.d/zz-app.ini
COPY docker/nginx.conf /etc/nginx/nginx.conf
COPY docker/supervisord.conf /etc/supervisor.d/app.ini
COPY docker/sshd_config /etc/ssh/sshd_config
COPY docker/sftp-sync.sh /usr/local/bin/sftp-sync.sh
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /usr/local/bin/sftp-sync.sh /entrypoint.sh

WORKDIR /var/www/html
COPY --from=vendor /app ./

RUN mkdir -p var/cache var/log public/uploads \
    && APP_ENV=prod APP_SECRET=build-time-placeholder-not-used-at-runtime \
       php bin/console cache:warmup --env=prod --no-debug \
    && chown -R www-data:www-data /var/www/html

EXPOSE 80 22
VOLUME ["/etc/ssh"]

ENTRYPOINT ["/entrypoint.sh"]
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor.d/app.ini"]
