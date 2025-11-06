#!/usr/bin/env bash
set -e
./scripts/fetch_env.sh --region eu-west-1
set -a; source .env; set +a
npm ci && npm run build
pm2 reload ecosystem.config.js --only 9ai-drone || pm2 start ecosystem.config.js --only 9ai-drone
pm2 save
