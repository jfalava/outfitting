#!/usr/bin/env bash
# Alchemy StaticSite spawns the build command without a shell, and Astro's
# prerender step (Node) cannot resolve bun-hoisted optional native bindings.
# Point NODE_PATH at the satteri + platform packages under the monorepo store.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BUN_STORE="${ROOT}/node_modules/.bun"

# Prefer the newest installed satteri / platform binding dirs.
SATTERI_DIR="$(ls -d "${BUN_STORE}"/satteri@*/node_modules 2>/dev/null | sort -V | tail -1 || true)"
PLATFORM_DIR="$(ls -d "${BUN_STORE}"/@bruits+satteri-*-*/node_modules 2>/dev/null | sort -V | tail -1 || true)"

NODE_PATH_PARTS=()
if [[ -n "${SATTERI_DIR}" ]]; then
  NODE_PATH_PARTS+=("${SATTERI_DIR}")
fi
if [[ -n "${PLATFORM_DIR}" ]]; then
  NODE_PATH_PARTS+=("${PLATFORM_DIR}")
fi

if ((${#NODE_PATH_PARTS[@]} > 0)); then
  JOINED="$(IFS=:; echo "${NODE_PATH_PARTS[*]}")"
  export NODE_PATH="${JOINED}${NODE_PATH:+:$NODE_PATH}"
fi

cd "$(dirname "$0")/.."
exec bun run build
