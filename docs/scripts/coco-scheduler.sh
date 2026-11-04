#!/bin/sh
# Llama al scheduler de CoCo cada 15 minutos desde el VPS.
# El secreto se lee de /etc/convive/scheduler.env y no se imprime.
set -eu

ENV_FILE="${CONVIVE_SCHEDULER_ENV:-/etc/convive/scheduler.env}"
if [ ! -r "$ENV_FILE" ]; then
  echo "No se puede leer $ENV_FILE" >&2
  exit 1
fi

# shellcheck disable=SC1090
. "$ENV_FILE"

if [ -z "${SCHEDULER_SECRET:-}${CRON_SECRET:-}" ]; then
  echo "Falta SCHEDULER_SECRET o CRON_SECRET" >&2
  exit 1
fi

TOKEN="${SCHEDULER_SECRET:-$CRON_SECRET}"
SITE="${SITE_URL:-https://conviveconnect.com}"

curl --silent --show-error --fail --max-time 60 \
  -H "Authorization: Bearer ${TOKEN}" \
  "${SITE}/api/agent-center/scheduler?mode=all" \
  >/dev/null
