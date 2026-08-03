#!/usr/bin/env bash
# Publica o Alt Flow Lead a partir do git.
#
# Existe porque a publicação era feita copiando arquivo solto por cima da
# árvore. Isso já custou caro: o escopo `ads_read` do OAuth do Meta vivia só no
# arquivo do servidor, nunca chegou ao versionamento, e uma cópia posterior o
# apagou em silêncio. A atribuição de anúncio ficou semanas devolvendo vazio sem
# nenhum erro. Publicar a partir do git torna o repositório a única fonte da
# verdade — o que está no servidor passa a ser sempre um commit conhecido.
#
# Uso: altflow-deploy [branch]      (padrão: altleadflow)
set -euo pipefail

BRANCH="${1:-altleadflow}"
BUILD=/opt/altleadflow-build
APP=/opt/altleadflow-app

echo "==> Publicando ${BRANCH}"
cd "$BUILD"

# O .env daqui alimenta as variáveis VITE_ na compilação e NÃO está no git com
# os valores reais — a versão versionada tem só placeholders públicos. Um
# `reset --hard` o devolveria a essa versão e o build sairia apontando para o
# lugar errado, em silêncio. Guardar e devolver não é zelo excessivo: é a única
# coisa entre o deploy e um app compilado contra o banco errado.
PRESERVADO="$(mktemp)"
trap 'rm -f "$PRESERVADO"' EXIT
cp -a .env "$PRESERVADO"

git fetch --quiet origin "$BRANCH"
ANTES="$(git rev-parse --short HEAD)"
git reset --hard --quiet "origin/${BRANCH}"
cp -a "$PRESERVADO" .env
DEPOIS="$(git rev-parse --short HEAD)"
echo "    ${ANTES} -> ${DEPOIS}"

# Conferência explícita antes de compilar. Se o .env voltou errado, o build sobe
# quebrado e só se descobre em produção, com lead deixando de entrar.
if ! grep -q "SUPABASE_SERVICE_ROLE_KEY" .env; then
  echo "!!! .env perdeu SUPABASE_SERVICE_ROLE_KEY — abortando antes de compilar" >&2
  exit 1
fi

# --legacy-peer-deps é obrigatório: @tremor/react pede React 18 e o projeto usa
# 19. Sem a flag o npm ci aborta.
#
# E nada de --silent aqui. A primeira versão deste script silenciava o npm; ele
# falhou exatamente nesse conflito, o set -e matou tudo sem imprimir uma linha,
# e o deploy "passou" deixando o build antigo no ar. Silenciar o comando que
# mais falha é como tirar a bateria do alarme de incêndio.
npm ci --legacy-peer-deps

rm -rf .output
NITRO_PRESET=node-server npm run build

# Troca com rede de segurança: o build anterior vira .output.old e só é
# descartado no deploy seguinte, então há sempre um caminho de volta.
rm -rf "${APP}/.output.old"
mv "${APP}/.output" "${APP}/.output.old"
cp -a .output "${APP}/.output"

systemctl restart altleadflow-app
sleep 6

# Reverter sozinho importa: um deploy que derruba o app e vai embora deixa o
# cliente sem captação até alguém perceber.
if ! systemctl is-active --quiet altleadflow-app; then
  echo "!!! serviço não subiu — revertendo para o build anterior" >&2
  rm -rf "${APP}/.output"
  mv "${APP}/.output.old" "${APP}/.output"
  systemctl restart altleadflow-app
  exit 1
fi

CODIGO="$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3010/)"
if [ "$CODIGO" != "200" ]; then
  echo "!!! app respondeu HTTP ${CODIGO} — revertendo" >&2
  rm -rf "${APP}/.output"
  mv "${APP}/.output.old" "${APP}/.output"
  systemctl restart altleadflow-app
  exit 1
fi

# Conferência de que o que subiu é REALMENTE o build novo. Sem isto, um build
# que não rodou passa despercebido: o serviço responde 200 com o bundle velho e
# tudo parece bem.
if [ ! -d "${APP}/.output" ] || [ "${APP}/.output" -ot "${BUILD}/package.json" ]; then
  echo "!!! .output publicado parece mais antigo que o código — verifique" >&2
  exit 1
fi

echo "==> no ar em ${DEPOIS} (HTTP ${CODIGO})"
