#!/usr/bin/env bash
set -euo pipefail

# Defaults (override with flags)
PREFIX="/myapp/drone"
REGION="${AWS_REGION:-}"   # if empty, AWS CLI default chain/region applies
OUTFILE=".env"

# Expected vars for DRONE
VARS=(JWT_SECRET_BASE64 ENABLE_MILVUS ENABLE_REDIS)

usage() {
  cat <<EOF
Usage: $0 [--prefix /myapp/drone] [--region eu-west-1] [--outfile .env]

Fetch SSM params <PREFIX>/<VAR_NAME> and write KEY=VALUE lines to OUTFILE.
Honors AWS_PROFILE and AWS_REGION if set.

Examples:
  $0 --region eu-west-1
  $0 --prefix /company/app/drone --outfile .env
EOF
  exit 1
}

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prefix)  PREFIX="$2";  shift 2 ;;
    --region)  REGION="$2";  shift 2 ;;
    --outfile) OUTFILE="$2"; shift 2 ;;
    -h|--help) usage ;;
    *) echo "Unknown arg: $1"; usage ;;
  esac
done

command -v aws >/dev/null 2>&1 || { echo "ERROR: aws CLI not found"; exit 1; }

# Build full parameter names
NAMES=()
for k in "${VARS[@]}"; do NAMES+=("${PREFIX}/${k}"); done

echo "==> Fetching DRONE env from prefix: ${PREFIX}"

# Base AWS CLI cmd
CMD=(aws ssm get-parameters --with-decryption --output text --query "Parameters[].{Name:Name,Value:Value}")
[[ -n "$REGION" ]] && CMD+=(--region "$REGION")
CMD+=(--names "${NAMES[@]}")

# Execute and capture output (tab-separated: NAME <tab> VALUE)
OUTPUT="$("${CMD[@]}" 2>&1)" || {
  echo "ERROR running aws CLI:"
  echo "$OUTPUT"
  exit 1
}

# Write .env
: > "$OUTFILE"
while IFS=$'\t' read -r NAME VALUE; do
  [[ -z "${NAME:-}" ]] && continue
  KEY="${NAME##*/}"
  printf '%s=%s\n' "$KEY" "$VALUE" >> "$OUTFILE"
done <<< "$OUTPUT"

chmod 600 "$OUTFILE" || true
echo "Wrote $OUTFILE"

# Warn about missing vars
MISSING=()
for k in "${VARS[@]}"; do
  if ! grep -q "^${k}=" "$OUTFILE"; then
    MISSING+=("$k")
  fi
done
if [[ ${#MISSING[@]} -gt 0 ]]; then
  echo "WARNING: Missing DRONE vars in SSM → ${MISSING[*]} (expected under ${PREFIX}/<VAR>)" >&2
fi
