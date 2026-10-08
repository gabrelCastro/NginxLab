#!/bin/sh
# Agenda simples para o contêiner de backup: um backup ao subir e depois a cada BACKUP_INTERVAL_SECONDS.
set -eu
interval="${BACKUP_INTERVAL_SECONDS:-86400}"
until pg_isready -q; do sleep 2; done
while true; do
  /backup/backup.sh || echo "backup falhou" >&2
  sleep "$interval"
done
