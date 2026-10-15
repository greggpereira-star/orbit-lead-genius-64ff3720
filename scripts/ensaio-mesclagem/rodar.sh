#!/usr/bin/env bash
#
# Ensaio da migração de mesclagem de leads. Tudo entre BEGIN e ROLLBACK:
# NADA FICA GRAVADO. Exige que a migração 20261013120000 (normalizar_telefone_br)
# já esteja aplicada — ou a inclui antes, com INCLUIR_DEDUP=1.
#
#   ./scripts/ensaio-mesclagem/rodar.sh
#   INCLUIR_DEDUP=1 ./scripts/ensaio-mesclagem/rodar.sh
#
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEDUP="$RAIZ/supabase/migrations/20261013120000_lead_sem_duplicata.sql"
MIGRACAO="$RAIZ/supabase/migrations/20261015150000_mesclar_leads_duplicados.sql"
TESTES="$RAIZ/scripts/ensaio-mesclagem/testes.sql"
HOST="${ALTFLOW_SSH:-altflow}"
CONTAINER="${ALTFLOW_DB:-altleadflow-db}"
for a in "$DEDUP" "$MIGRACAO" "$TESTES"; do [ -f "$a" ] || { echo "não achei $a" >&2; exit 1; }; done
echo "==> ensaiando contra $CONTAINER em $HOST (tudo será desfeito no fim)"
{
  echo "BEGIN;"
  [ "${INCLUIR_DEDUP:-0}" = "1" ] && cat "$DEDUP"
  cat "$MIGRACAO"
  cat "$TESTES"
  echo "ROLLBACK;"
} | ssh "$HOST" "docker exec -i $CONTAINER psql -U postgres -v ON_ERROR_STOP=1 -q"
echo "==> ensaio concluído sem erro. Nada foi gravado."
