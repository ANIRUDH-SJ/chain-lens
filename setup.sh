#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# setup.sh — install dependencies for Chain Lens (CLI + web UI)
###############################################################################

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Install CLI/server dependencies
npm install

# Install + build the React web UI
(cd web && npm install && npm run build)

echo "Setup complete. Run ./cli.sh <fixture.json> or ./web.sh"
