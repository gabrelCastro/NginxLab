#!/bin/sh
# Backup lógico do PostgreSQL em formato custom (pg_restore), com retenção por dias.
# Variáveis: PGHOST, PGUSER, PGPASSWORD, PGDATABASE, BACKUP_DIR (/backups), RETENTION_DAYS (14).
set -eu
dir="${BACKUP_DIR:-/backups}"
retention="${RETENTION_DAYS:-14}"
mkdir -p "$dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$dir/nginxlearn-$stamp.dump"
pg_dump --format=custom --no-owner --file="$target.partial"
# O arquivo só ganha o nome final depois de completo e verificado.
pg_restore --list "$target.partial" >/dev/null
mv "$target.partial" "$target"
find "$dir" -name 'nginxlearn-*.dump' -mtime "+$retention" -delete
echo "backup ok: $target ($(wc -c < "$target") bytes)"
