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

LOG="${CONVIVE_SCHEDULER_LOG:-/var/log/coco-scheduler.log}"

# Una línea por ejecución: hora UTC, código HTTP y duración. Nunca el secreto ni la respuesta.
# Sin esto un 401 o un 500 pasaba en silencio: cron descartaba la salida.
set +e
RESULT=$(curl --silent --show-error --output /dev/null --max-time 60 \
  --write-out '%{http_code} %{time_total}s' \
  -H "Authorization: Bearer ${TOKEN}" \
  "${SITE}/api/agent-center/scheduler?mode=all" 2>&1)
STATUS=$?
set -e

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) curl=${STATUS} ${RESULT}" >> "$LOG"

case "$RESULT" in
  2??\ *) exit 0 ;;
  *) exit 1 ;;
esac
