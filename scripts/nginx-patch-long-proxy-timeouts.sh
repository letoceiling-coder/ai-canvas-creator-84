#!/usr/bin/env bash
set -euo pipefail
VHOST="${1:-/etc/nginx/sites-available/botme.siteaacess.store}"
if grep -q proxy_read_timeout "$VHOST" 2>/dev/null; then
  echo "[nginx-patch] already has proxy_read_timeout"
else
  tmp="$(mktemp)"
  awk '
    /proxy_cache_bypass \$http_upgrade;/ && !done {
      print
      print "        proxy_connect_timeout 600s;"
      print "        proxy_send_timeout 1800s;"
      print "        proxy_read_timeout 1800s;"
      print "        send_timeout 1800s;"
      done=1
      next
    }
    { print }
  ' "$VHOST" > "$tmp"
  mv "$tmp" "$VHOST"
  echo "[nginx-patch] inserted long proxy timeouts into $VHOST"
fi
nginx -t
systemctl reload nginx
echo "[nginx-patch] nginx reloaded OK"
