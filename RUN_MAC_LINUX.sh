#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js/npm is not installed."
  echo "Install Node.js LTS from https://nodejs.org/ and run this script again."
  exit 1
fi

echo "Node: $(node --version)"
echo "npm:  $(npm --version)"
echo "Installing dependencies..."
npm install
npm run dev
