#!/usr/bin/env bash
# Gera o SQL que troca o segredo ANTIGO dos jobs do pg_cron pelo novo.
#
# Os jobs foram criados com `Bearer altflow_retry_sync_secret` — um valor que
# está no repositório. Depois de colocar CRON_SECRET no .env e fazer o deploy,
# rode o SQL gerado para que os jobs passem a mandar o segredo novo.
#
# Uso:  CRON_SECRET='<o mesmo valor do .env>' ./scripts/rotacionar-cron/gerar.sh
# Sem CRON_SECRET no ambiente, gera um valor aleatório e o grava no arquivo
# `segredo.novo` (modo 600) — para copiar ao .env do servidor. Nada é impresso.
set -euo pipefail
cd "$(dirname "$0")"
umask 077

if [ -z "${CRON_SECRET:-}" ]; then
  CRON_SECRET="$(openssl rand -hex 32)"
  printf '%s\n' "$CRON_SECRET" > segredo.novo
  echo "Segredo novo gravado em scripts/rotacionar-cron/segredo.novo (copie para CRON_SECRET no .env e apague o arquivo)."
fi
case "$CRON_SECRET" in *\'*) echo "O segredo não pode conter aspas simples." >&2; exit 1;; esac

cat > rotacionar.sql <<SQL
-- Troca o segredo dos jobs do pg_cron. Rode DEPOIS do deploy com CRON_SECRET no .env.
-- Contém o segredo: não versionar, apagar depois de rodar.
DO \$\$
DECLARE j record; n int := 0;
BEGIN
  FOR j IN
    SELECT jobid, command FROM cron.job
    WHERE command LIKE '%altflow_retry_sync_secret%'
  LOOP
    PERFORM cron.alter_job(j.jobid,
      command := replace(j.command, 'altflow_retry_sync_secret', '${CRON_SECRET}'));
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'jobs atualizados: %', n;
END \$\$;
SQL
echo "Gerado scripts/rotacionar-cron/rotacionar.sql (modo 600)."
