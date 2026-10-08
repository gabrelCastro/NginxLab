#!/bin/sh
# Restaura um backup num banco (por padrão, o de PGDATABASE). Uso: restore.sh /backups/arquivo.dump
# Para ensaiar sem tocar em produção, aponte PGDATABASE para um banco vazio (veja docs/DEPLOY.md).
set -eu
file="${1:?informe o arquivo .dump}"
pg_restore --list "$file" >/dev/null
pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$PGDATABASE" "$file"
echo "restore ok: $file -> $PGDATABASE"
