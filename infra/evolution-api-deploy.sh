#!/bin/bash
# Sobe uma Evolution API dedicada ao altleadflow.
#
# Decisões:
#  - Bind em 127.0.0.1 apenas: o app roda no mesmo host (systemd), então não
#    precisa passar pela internet. Sem domínio, sem certificado, sem exposição.
#  - Compose próprio (docker compose, não swarm) pra não encostar na stack do
#    cliniq gerenciada pelo easypanel.
#  - Redis com senha na mesma rede interna. A instância do cliniq quebrou
#    justamente por apontar pra um host que não resolve — aqui o nome do
#    serviço no compose garante a resolução.
set -uo pipefail

DIR=/opt/altleadflow-evolution
PORT=8081

mkdir -p "$DIR"
cd "$DIR"

# Segredos gerados uma vez e preservados em reexecuções: regerar a API key
# invalidaria a instância já pareada.
if [ ! -f .env ]; then
  APIKEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  PGPASS=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
  REDISPASS=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
  cat > .env <<EOF
EVO_API_KEY=$APIKEY
EVO_PG_PASS=$PGPASS
EVO_REDIS_PASS=$REDISPASS
EOF
  chmod 600 .env
  echo "segredos: gerados"
else
  echo "segredos: ja existiam (preservados)"
fi

set -a; . ./.env; set +a

cat > docker-compose.yml <<'EOF'
services:
  evolution:
    image: evoapicloud/evolution-api:v2.3.7
    container_name: altflow-evolution
    restart: unless-stopped
    ports:
      - "127.0.0.1:8081:8080"
    environment:
      SERVER_URL: http://127.0.0.1:8081
      AUTHENTICATION_API_KEY: ${EVO_API_KEY}
      AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES: "true"
      DEL_INSTANCE: "false"
      LANGUAGE: pt-BR
      DATABASE_ENABLED: "true"
      DATABASE_PROVIDER: postgresql
      DATABASE_CONNECTION_URI: postgresql://evolution:${EVO_PG_PASS}@evolution-db:5432/evolution?schema=public
      DATABASE_SAVE_DATA_INSTANCE: "true"
      DATABASE_SAVE_DATA_NEW_MESSAGE: "true"
      DATABASE_SAVE_MESSAGE_UPDATE: "true"
      DATABASE_SAVE_DATA_CONTACTS: "true"
      DATABASE_SAVE_DATA_CHATS: "true"
      CACHE_REDIS_ENABLED: "true"
      CACHE_REDIS_URI: redis://:${EVO_REDIS_PASS}@evolution-redis:6379/0
      CACHE_REDIS_PREFIX_KEY: altflow
      CACHE_REDIS_SAVE_INSTANCES: "false"
      CACHE_LOCAL_ENABLED: "false"
      LOG_LEVEL: ERROR,WARN,INFO
      LOG_COLOR: "false"
    depends_on:
      - evolution-db
      - evolution-redis

  evolution-db:
    image: postgres:17-alpine
    container_name: altflow-evolution-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: evolution
      POSTGRES_PASSWORD: ${EVO_PG_PASS}
      POSTGRES_DB: evolution
    volumes:
      - evolution_pg:/var/lib/postgresql/data

  evolution-redis:
    image: redis:7-alpine
    container_name: altflow-evolution-redis
    restart: unless-stopped
    command: redis-server --requirepass ${EVO_REDIS_PASS} --appendonly yes
    volumes:
      - evolution_redis:/data

volumes:
  evolution_pg:
  evolution_redis:
EOF

echo "--- subindo containers ---"
docker compose up -d 2>&1 | tail -8

echo
echo "--- aguardando a API responder (ate 90s) ---"
OK=0
for i in $(seq 1 30); do
  sleep 3
  CODE=$(curl -s -o /tmp/ev_up.json -w '%{http_code}' -m 5 "http://127.0.0.1:$PORT/" -H "apikey: $EVO_API_KEY" || echo 000)
  if [ "$CODE" = "200" ]; then
    echo "PRONTO apos ~$((i*3))s"
    head -c 250 /tmp/ev_up.json; echo
    OK=1
    break
  fi
  echo "  ...${i}: http=$CODE"
done
rm -f /tmp/ev_up.json

if [ "$OK" != "1" ]; then
  echo "!!! NAO SUBIU — ultimos logs:"
  docker logs altflow-evolution --tail 25 2>&1 | tail -25
  exit 1
fi

echo
echo "--- apontando o app pra instancia dedicada ---"
ENVF=/opt/altleadflow-app/.env
sed -i '/^EVOLUTION_API_URL=/d;/^EVOLUTION_API_KEY=/d' "$ENVF"
printf 'EVOLUTION_API_URL="http://127.0.0.1:%s"\n' "$PORT" >> "$ENVF"
printf 'EVOLUTION_API_KEY="%s"\n' "$EVO_API_KEY" >> "$ENVF"
grep -E '^EVOLUTION_' "$ENVF" | sed -E 's/(KEY=").{6}.*/\1<oculto>"/'

systemctl restart altleadflow-app
sleep 4
systemctl is-active altleadflow-app
