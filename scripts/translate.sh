#!/usr/bin/env bash
# Polyglot Translation Tool wrapper for Unix/Linux/macOS
# Uses uv to automatically handle Python and dependencies

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v uv &> /dev/null; then
    echo "Error: uv is not installed."
    echo "Install with: curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "Or visit: https://docs.astral.sh/uv/getting-started/installation/"
    exit 1
fi

uv run "$SCRIPT_DIR/translate.py" "$@"
