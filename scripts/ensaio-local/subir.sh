#!/usr/bin/env bash
#
# Sobe o ambiente de ensaio local (tudo em 127.0.0.1, nada de produção):
#   Postgres 16 (54329) · PostgREST (54322) · gateway Supabase (54321) · Meta falsa (9911)
# e grava .env.ensaio.local (ignorado pelo git) com as variáveis do app.
#
#   ENSAIO_DIR=/tmp/leadflow-ensaio ./scripts/ensaio-local/subir.sh
#
# Na primeira vez copia o ESQUEMA da produção (só estrutura, em leitura, via ssh).
set -euo pipefail
export LC_ALL=en_US.UTF-8
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR="${ENSAIO_DIR:-/tmp/leadflow-ensaio}"; mkdir -p "$DIR"
PGB="$(brew --prefix postgresql@16)/bin"
SOCK=/tmp/pgs54329; mkdir -p "$SOCK"
PSQL=("$PGB/psql" -h 127.0.0.1 -p 54329 -U postgres)

if [ ! -d "$DIR/data" ]; then "$PGB/initdb" -D "$DIR/data" -U postgres --auth=trust -E UTF8 >/dev/null; fi
if ! "${PSQL[@]}" -Atc "select 1" >/dev/null 2>&1; then
  "$PGB/pg_ctl" -D "$DIR/data" -o "-p 54329 -k $SOCK -c listen_addresses=127.0.0.1 -c fsync=off" -l "$DIR/pg.log" start >/dev/null
  sleep 2
fi
if [ "$("${PSQL[@]}" -Atc "select count(*) from pg_database where datname='leadflow_ensaio'")" = "0" ]; then
  echo "==> primeira vez: copiando o esquema da produção (só estrutura)"
  ssh "${ALTFLOW_SSH:-altflow}" "docker exec ${ALTFLOW_DB:-altleadflow-db} pg_dump -U postgres -s -n public --no-owner" > "$DIR/esquema-prod.sql"
  "${PSQL[@]}" -qc "create database leadflow_ensaio"
  "${PSQL[@]}" -d leadflow_ensaio -v ON_ERROR_STOP=1 -q -f "$RAIZ/scripts/ensaio-local/bootstrap-supabase.sql" >/dev/null 2>&1
  "${PSQL[@]}" -d leadflow_ensaio -q -f "$DIR/esquema-prod.sql" >/dev/null 2>"$DIR/restaura-erros.txt" || true
fi

cd "$RAIZ"
SEGREDO="$(node -e 'import("./scripts/ensaio-local/chaves.mjs").then(m=>console.log(m.SEGREDO_JWT))')"
cat > "$DIR/postgrest.conf" <<CONF
db-uri = "postgres://authenticator:ensaio@127.0.0.1:54329/leadflow_ensaio"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "$SEGREDO"
server-host = "127.0.0.1"
server-port = 54322
db-pool = 5
CONF
parar() { pkill -f "postgrest $DIR/postgrest.conf" 2>/dev/null || true; pkill -f "ensaio-local/gateway.mjs" 2>/dev/null || true; pkill -f "ensaio-local/meta-falsa.mjs" 2>/dev/null || true; }
parar; sleep 1
nohup postgrest "$DIR/postgrest.conf" >"$DIR/postgrest.log" 2>&1 &
nohup node scripts/ensaio-local/gateway.mjs >"$DIR/gateway.log" 2>&1 &
PORT=9911 nohup node scripts/ensaio-local/meta-falsa.mjs >"$DIR/meta-falsa.log" 2>&1 &

node --input-type=module -e '
import * as k from "./scripts/ensaio-local/chaves.mjs";
const e = {
  SUPABASE_URL: "http://127.0.0.1:54321", VITE_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISHABLE_KEY: k.CHAVE_ANON, VITE_SUPABASE_PUBLISHABLE_KEY: k.CHAVE_ANON,
  SUPABASE_SERVICE_ROLE_KEY: k.CHAVE_SERVICE, SUPABASE_PROJECT_ID: "ensaio", VITE_SUPABASE_PROJECT_ID: "ensaio",
  WA_TOKEN_KEY: k.WA_TOKEN_KEY, WA_WEBHOOK_VERIFY_TOKEN: k.WA_VERIFY_TOKEN, META_APP_SECRET: k.META_APP_SECRET,
  META_GRAPH_BASE_URL: "http://127.0.0.1:9911/v25.0",
};
import("node:fs").then(fs => fs.writeFileSync(".env.ensaio.local", Object.entries(e).map(([a,b]) => a+"="+b).join("\n")+"\n"));'
sleep 2
for i in 1 2 3 4 5; do curl -sf -o /dev/null "http://127.0.0.1:54321/rest/v1/companies?select=id&limit=1" -H "apikey: x" && break; sleep 1; done
echo "==> no ar: gateway :54321 · PostgREST :54322 · Meta falsa :9911 · env em .env.ensaio.local"
