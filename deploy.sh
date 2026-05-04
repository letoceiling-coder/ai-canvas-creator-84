#!/usr/bin/env bash
set -euo pipefail
ROOT="/var/www/botme.siteaacess.store"
cd "$ROOT"
mkdir -p logs
if [ -n "${DEPLOY_JOB_LOG:-}" ]; then
  mkdir -p "$(dirname "$DEPLOY_JOB_LOG")"
  LOG_FILE="$DEPLOY_JOB_LOG"
else
  LOG_FILE="logs/deploy-last.log"
fi
exec > >(tee -a "$LOG_FILE") 2>&1
echo "[deploy] start $(date -Is) log=$LOG_FILE"
if [ -d .git ]; then
  git pull
else
  echo "[deploy] skip git pull (no .git)"
fi
# Нужны devDependencies (Vite, @lovable.dev/vite-tanstack-config и т.д.), иначе build падает при NODE_ENV=production в PM2
npm ci --include=dev
npm run build || {
  echo "[deploy] ❌ build failed"
  exit 1
}
if pm2 describe botme-app >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
echo "[deploy] DEPLOY SUCCESS $(date -Is)"
