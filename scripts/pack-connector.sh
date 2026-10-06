#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
OUT="$ROOT/ozonflow-connector.zip"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/ozonflow-connector"
cp -R extension/. "$TMP/ozonflow-connector/"
find "$TMP" -name '.DS_Store' -delete
rm -f "$OUT"
if command -v zip >/dev/null 2>&1; then
  (cd "$TMP" && zip -r -q "$OUT" ozonflow-connector)
else
  python3 - << PY
import zipfile, os
from pathlib import Path
root = Path("$TMP")
out = Path("$OUT")
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for p in root.rglob("*"):
        if p.is_file():
            z.write(p, p.relative_to(root).as_posix())
print("python zip ok")
PY
fi
echo "已打包: $OUT ($(wc -c < "$OUT") bytes)"
