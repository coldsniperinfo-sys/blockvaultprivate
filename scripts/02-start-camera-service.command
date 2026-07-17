#!/bin/bash
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/camera-service"
if [ ! -f .env ]; then
  echo "Missing camera-service/.env"
  echo "Copy .env.example to .env, then replace both camera IPs and passwords locally."
  exit 1
fi
if [ ! -d node_modules ]; then
  npm install
fi
npm run dev
