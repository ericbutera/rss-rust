#!/bin/sh
set -e
# Generates .env.production for the Next.js build.
# NEXT_PUBLIC_* values are baked in at build time.
# Update values here when endpoints change.
cat > ui-next/.env.production <<EOF
NEXT_PUBLIC_API_URL=https://rss-api.nibelheim.dev/api
NEXT_PUBLIC_CDN_URL=https://rss-api.nibelheim.dev/uploads
EOF
