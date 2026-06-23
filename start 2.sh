#!/bin/bash
# ─────────────────────────────────────────────
# Smuggler Slots — VPS Startup Script
# ─────────────────────────────────────────────

set -e

# Load .env if it exists
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo "✅ Loaded environment from .env"
fi

# Check token
if [ -z "$DISCORD_TOKEN" ] || [ "$DISCORD_TOKEN" = "your_bot_token_here" ]; then
    echo "❌ ERROR: DISCORD_TOKEN is not set. Edit your .env file."
    exit 1
fi

echo "🚀 Starting Smuggler Slots..."
python3 bot.py
