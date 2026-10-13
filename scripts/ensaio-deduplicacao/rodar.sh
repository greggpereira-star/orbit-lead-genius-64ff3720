#!/usr/bin/env bash
#
# Ensaio da migração de deduplicação de lead.
#
# Junta a migração e os testes entre BEGIN e ROLLBACK e manda para o Postgres.
# NADA FICA GRAVADO: a transação é desfeita no fim, e também se algum teste
# falhar (o `ON_ERROR_STOP` aborta, e transação abortada não escreve).
#
# Por rodar contra o banco de VERDADE, o ensaio exercita o schema real, as
# funções reais e o quiz publicado real — que é o que um banco de brinquedo não
# reproduz. O preço é um bloqueio de poucos instantes na tabela `leads`
# enquanto os índices são criados; em 560 linhas isso é imperceptível, mas
# prefira rodar fora do horário de pico.
#
# Uso:
#   ./scripts/ensaio-deduplicacao/rodar.sh
#
set -euo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MIGRACAO="$RAIZ/supabase/migrations/20261013120000_lead_sem_duplicata.sql"
TESTES="$RAIZ/scripts/ensaio-deduplicacao/testes.sql"
HOST="${ALTFLOW_SSH:-altflow}"
CONTAINER="${ALTFLOW_DB:-altleadflow-db}"

for arquivo in "$MIGRACAO" "$TESTES"; do
  [ -f "$arquivo" ] || { echo "não achei $arquivo" >&2; exit 1; }
done

echo "==> ensaiando contra $CONTAINER em $HOST (tudo será desfeito no fim)"

{
  echo "BEGIN;"
  cat "$MIGRACAO"
  cat "$TESTES"
  echo "ROLLBACK;"
} | ssh "$HOST" "docker exec -i $CONTAINER psql -U postgres -v ON_ERROR_STOP=1 -q"

echo "==> ensaio concluído sem erro. Nada foi gravado."
