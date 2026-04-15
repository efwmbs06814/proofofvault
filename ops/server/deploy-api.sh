#!/usr/bin/env bash
set -euo pipefail

APP_ROOT="${APP_ROOT:-/opt/proofofvault}"
REPO_URL="${REPO_URL:-https://github.com/efwmbs06814/proofofvault.git}"
BRANCH="${BRANCH:-main}"
API_PORT="${API_PORT:-4000}"
NODE_VERSION="${NODE_VERSION:-20}"

if ! command -v git >/dev/null 2>&1; then
  apt-get update
  apt-get install -y git curl build-essential
fi

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi

if ! command -v corepack >/dev/null 2>&1; then
  npm install -g corepack
fi

corepack enable

mkdir -p "$(dirname "$APP_ROOT")"

if [ ! -d "$APP_ROOT/.git" ]; then
  git clone "$REPO_URL" "$APP_ROOT"
fi

cd "$APP_ROOT"
git fetch origin
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

corepack pnpm install --frozen-lockfile
set -a
# shellcheck disable=SC1091
. "$APP_ROOT/apps/api/.env.production"
set +a
corepack pnpm --filter @proof-of-vault/api db:migrate

cat > /etc/systemd/system/proof-of-vault-api.service <<EOF
[Unit]
Description=Proof of Vault API
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP_ROOT
Environment=PORT=$API_PORT
EnvironmentFile=$APP_ROOT/apps/api/.env.production
ExecStart=/usr/bin/env bash -lc 'corepack pnpm --filter @proof-of-vault/api start'
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable proof-of-vault-api
systemctl restart proof-of-vault-api
systemctl status proof-of-vault-api --no-pager
