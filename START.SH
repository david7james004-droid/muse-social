#!/bin/bash
echo "=========================================="
echo "  MUSE SOCIAL MEDIA - Amusement Inc."
echo "  Sponsored by The Blue Whale Family"
echo "=========================================="
echo ""
cd "$(dirname "$0")"
npm install
echo ""
echo "Starting server..."
node server.js