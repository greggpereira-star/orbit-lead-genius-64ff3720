#!/usr/bin/env bash
# Gera WA_TOKEN_KEY, WA_WEBHOOK_VERIFY_TOKEN e CRON_SECRET NO SERVIDOR (nada é
# impresso), grava no .env, reinicia o app e troca o segredo dos jobs do pg_cron.
#
#   ./scripts/rotacionar-cron/aplicar-na-vps.sh
#
# Idempotente: chave que já existe no .env não é sobrescrita (e, se CRON_SECRET
# já existe, ele é reaproveitado para a rotação). Faz cópia do .env antes.
set -euo pipefail
HOST="${ALTFLOW_SSH:-altflow}"
ssh "$HOST" 'bash -s' <<'REMOTO'
set -euo pipefail
cd /opt/altleadflow-app
umask 077
cp -p .env ".env.bak.antes-wa-$(date +%Y%m%d%H%M%S)"
tem() { grep -q "^$1=" .env; }
tem WA_TOKEN_KEY || echo "WA_TOKEN_KEY=$(openssl rand -base64 32)" >> .env
tem WA_WEBHOOK_VERIFY_TOKEN || echo "WA_WEBHOOK_VERIFY_TOKEN=$(openssl rand -hex 24)" >> .env
tem CRON_SECRET || echo "CRON_SECRET=$(openssl rand -hex 32)" >> .env
CS="$(grep '^CRON_SECRET=' .env | head -1 | cut -d= -f2-)"
systemctl restart altleadflow-app
{
  echo "DO \$\$ DECLARE j record; n int := 0; BEGIN"
  echo "  FOR j IN SELECT jobid, command FROM cron.job WHERE command LIKE '%altflow_retry_sync_secret%' LOOP"
  echo "    PERFORM cron.alter_job(j.jobid, command := replace(j.command, 'altflow_retry_sync_secret', '$CS'));"
  echo "    n := n + 1;"
  echo "  END LOOP;"
  echo "  RAISE NOTICE 'jobs_atualizados=%', n;"
  echo "END \$\$;"
} | docker exec -i altleadflow-db psql -U postgres -v ON_ERROR_STOP=1 -q 2>&1 | sed "s/$CS/***/g"
sleep 4
systemctl is-active altleadflow-app
for k in WA_TOKEN_KEY WA_WEBHOOK_VERIFY_TOKEN CRON_SECRET; do tem "$k" && echo "$k presente"; done
REMOTO
