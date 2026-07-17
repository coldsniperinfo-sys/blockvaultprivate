#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/blockvault-api"
if [ ! -f .env ]; then
  cp .env.example .env
fi
if [ ! -d node_modules ]; then
  npm install
fi
npm run dev
