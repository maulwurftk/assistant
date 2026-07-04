#!/usr/bin/env bash
#
# prod-backup.sh — Voll-Dump der PROD-Datenbank (public + auth) vor dem Cutover.
# Betriebsplan §5. Rein LESEND (pg_dump). Prod wird sonst nicht angefasst.
#
# Nutzung:
#   PROD_DB_PW='<passwort>' ./scripts/prod-backup.sh
#
# Passwort: Supabase Dashboard -> Settings -> Database (Session-Pooler / IPv4).
# Die .dump-Datei enthält echte Personendaten inkl. Logins:
#   -> NICHT ins Repo, an einen sicheren Ort. (supabasebackup/ ist ge-gitignored.)

set -euo pipefail

# --- Prod-Ziel (fest verdrahtet, damit nichts verrutscht) --------------------
PROD_REF="rqtwlqsfrjnzduzdjrhe"
REGION="eu-central-1"
POOLER_HOST="aws-0-${REGION}.pooler.supabase.com"
PORT="5432"

# --- Ausgabeort: außerhalb des Repos ----------------------------------------
OUT_DIR="${BACKUP_DIR:-$HOME/supabasebackup}"
STAMP="$(date +%Y%m%d-%H%M)"
OUT_FILE="${OUT_DIR}/prod-full-${STAMP}.dump"

# --- Vorbedingungen ---------------------------------------------------------
if [[ -z "${PROD_DB_PW:-}" ]]; then
  echo "FEHLER: Umgebungsvariable PROD_DB_PW ist nicht gesetzt." >&2
  echo "  Aufruf:  PROD_DB_PW='<passwort>' $0" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "FEHLER: pg_dump nicht gefunden (Postgres-Client-Tools installieren)." >&2
  exit 1
fi

echo "pg_dump-Version: $(pg_dump --version)"
echo "Hinweis: pg_dump-Major sollte >= Server-Version sein (Supabase i.d.R. PG 15/17)."
echo

mkdir -p "$OUT_DIR"

CONN="postgresql://postgres.${PROD_REF}:${PROD_DB_PW}@${POOLER_HOST}:${PORT}/postgres"

echo "Ziel-Projekt (PROD): ${PROD_REF}  @ ${POOLER_HOST}"
echo "Schemas:             public, auth"
echo "Ausgabe:             ${OUT_FILE}"
echo
read -r -p "Voll-Dump von PROD jetzt ziehen? [ja/NEIN] " ANSWER
if [[ "$ANSWER" != "ja" ]]; then
  echo "Abgebrochen."
  exit 0
fi

# --- Dump -------------------------------------------------------------------
pg_dump "$CONN" \
  --schema=public --schema=auth \
  -Fc -f "$OUT_FILE"

echo
echo "Fertig: ${OUT_FILE}"
echo "Größe:  $(du -h "$OUT_FILE" | cut -f1)"
echo
echo "Nächster Schritt (Betriebsplan §5):"
echo "  App-JSON-Export über admin/sicherung ziehen (zweites, lesbares Netz)."
echo "  Beide Dateien sicher ablegen — nicht ins Repo."
