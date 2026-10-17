#!/usr/bin/env bash
#
# Aplica TODAS as migrações, em ordem, num Postgres local descartável.
# Nunca aponta para produção: o destino é fixo em 127.0.0.1.
#
#   PGPORT=54329 ./scripts/ensaio-local/aplicar-migracoes.sh
#
# As extensões que o Postgres comum não tem (pg_cron, pg_net, supabase_vault,
# pgmq) viram no-op nas migrações; as funções que elas oferecem estão simuladas
# em bootstrap-supabase.sql. Cada migração roda em transação própria; a que
# falhar é listada no fim, sem interromper as demais.
set -uo pipefail
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PGPORT="${PGPORT:-54329}"
PSQL=(psql -h 127.0.0.1 -p "$PGPORT" -U postgres -d "${ENSAIO_DB:-postgres}" -v ON_ERROR_STOP=1 -q)

"${PSQL[@]}" -f "$RAIZ/scripts/ensaio-local/bootstrap-supabase.sql" >/dev/null || { echo "bootstrap falhou"; exit 1; }
ok=0; falhas=()
for f in "$RAIZ"/supabase/migrations/*.sql; do
  n="$(basename "$f")"
  if { echo "BEGIN; SET search_path = public, extensions;"
       sed -E 's/create extension (if not exists )?(pg_cron|pg_net|supabase_vault|pgmq)[^;]*;/select 1;/I' "$f"
       echo "COMMIT;"; } | "${PSQL[@]}" >/dev/null 2>"/tmp/ensaio_erro.txt"; then
    ok=$((ok+1))
  else
    falhas+=("$n :: $(grep -m1 -i 'erro\|error' /tmp/ensaio_erro.txt | cut -c1-170)")
  fi
done
echo "migrações aplicadas: $ok · com falha: ${#falhas[@]}"
for x in "${falhas[@]:-}"; do [ -n "$x" ] && echo "  ✗ $x"; done
exit 0
