#!/bin/sh
# Bundles src/ into app.js (a classic script, so index.html also opens straight from disk with a double click).
# Needs esbuild: npx esbuild@0.24.0 works too if the local copy below is gone.
cd "$(dirname "$0")"
E=${ESBUILD:-esbuild}
$E src/main.js --bundle --format=iife --alias:three=./vendor/three/three.module.min.js --outfile=app.js --minify --legal-comments=none --log-level=warning
