#!/usr/bin/env bash
#
# Ensaio da migração wa_* contra a base REAL, tudo entre BEGIN e ROLLBACK:
# NADA FICA GRAVADO (e também não se algum teste falhar — ON_ERROR_STOP aborta).
#
#   ./scripts/ensaio-wa-fundacao/rodar.sh
#
set -euo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRACAO="$RAIZ/supabase/migrations/20261015180000_wa_fundacao.sql"
MIGRACAO2="$RAIZ/supabase/migrations/20261015190000_wa_templates_e_estado.sql"
MIGRACAO3="$RAIZ/supabase/migrations/20261015200000_wa_automacao.sql"
MIGRACAO4="$RAIZ/supabase/migrations/20261015210000_wa_midia_e_notas.sql"
MIGRACAO5="$RAIZ/supabase/migrations/20261015220000_endurecer_acessos.sql"
MIGRACAO6="$RAIZ/supabase/migrations/20261016120000_wa_seguir_e_mencoes.sql"
TESTES="$RAIZ/scripts/ensaio-wa-fundacao/testes.sql"
HOST="${ALTFLOW_SSH:-altflow}"
CONTAINER="${ALTFLOW_DB:-altleadflow-db}"
for a in "$MIGRACAO" "$MIGRACAO2" "$MIGRACAO3" "$MIGRACAO4" "$MIGRACAO5" "$MIGRACAO6" "$TESTES"; do [ -f "$a" ] || { echo "não achei $a" >&2; exit 1; }; done
echo "==> ensaiando contra $CONTAINER em $HOST (tudo será desfeito no fim)"
{ echo "BEGIN;"; cat "$MIGRACAO"; cat "$MIGRACAO2"; cat "$MIGRACAO3"; cat "$MIGRACAO4"; cat "$MIGRACAO5"; cat "$MIGRACAO6"; cat "$TESTES"; echo "ROLLBACK;"; } \
  | ssh "$HOST" "docker exec -i $CONTAINER psql -U postgres -v ON_ERROR_STOP=1 -q"
echo "==> ensaio concluído sem erro. Nada foi gravado."
