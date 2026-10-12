#!/bin/bash
set -e

# FAR/AIM Pro - Development Server
# Usage: ./start-dev.sh [--port PORT]

export PORT=3000

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --port)
            export PORT="$2"
            shift 2
            ;;
        -p)
            export PORT="$2"
            shift 2
            ;;
        *)
            echo "Usage: ./start-dev.sh [--port PORT]"
            echo "  --port, -p PORT    Port to run dev server on (default: 3000)"
            exit 1
            ;;
    esac
done

echo "🚀 Starting FAR/AIM Pro development server on port ${PORT}..."

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    pnpm install
fi

# Run the dev server with the specified port
pnpm vite --port "${PORT}" --host 0.0.0.0
