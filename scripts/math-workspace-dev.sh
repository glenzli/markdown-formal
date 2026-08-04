#!/bin/sh

set -eu

SCRIPT_DIR=$(node -e 'const fs = require("node:fs"); const path = require("node:path"); process.stdout.write(path.dirname(fs.realpathSync(process.argv[1])));' "$0")
exec node "$SCRIPT_DIR/../out/cli/math-workspace.js" "$@"
