#!/usr/bin/env bash
# Spielt alle Migrationen in eine frische lokale PostgreSQL-Datenbank und führt die SQL-Tests aus.
# Voraussetzung: erreichbarer PostgreSQL-Server (≥ 15), z. B. PGHOST/PGPORT/PGUSER gesetzt.
# Aufruf: supabase/tests/run.sh   (Datenbank "boxentakt_test" wird neu angelegt)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=boxentakt_test
P=(psql -v ON_ERROR_STOP=1 -q)
"${P[@]}" postgres -c "drop database if exists $DB" -c "create database $DB"
"${P[@]}" "$DB" -f supabase/tests/stub.sql >/dev/null
for f in supabase/migrations/*.sql; do
  echo "migration $f"
  "${P[@]}" "$DB" -f "$f"
done
"${P[@]}" "$DB" -f supabase/tests/booking.sql
"${P[@]}" "$DB" -f supabase/tests/integration.sql
