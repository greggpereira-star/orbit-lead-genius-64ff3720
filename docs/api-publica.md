# API pública do Leadflow — v1

Integre o funil a outros sistemas: leia e crie leads, mova leads de etapa e receba
eventos em tempo real por webhook.

- **Base:** `https://www.altleadflow.com.br/api/public/v1`
- **Formato:** JSON (UTF-8). Datas em ISO 8601.
- **Disponibilidade:** recurso de plano (`api_publica` e `webhooks_assinados`). Sem o recurso
  no plano, a API responde `403 feature_not_available`.
- **Uso:** servidor para servidor. A API não tem CORS de propósito — nunca coloque a chave
  em código que roda no navegador do visitante.

## Autenticação

Crie a chave em **Configurações → API e webhooks** (só dono ou administrador). A chave
aparece **uma única vez**; o Leadflow guarda só um hash dela. Se perder, revogue e crie outra.

```
Authorization: Bearer alf_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Cada chave tem escopos, que você escolhe ao criar:

| Escopo        | Permite                                  |
| ------------- | ---------------------------------------- |
| `leads:read`  | `GET /leads`, `GET /leads/:id`, `GET /stages` |
| `leads:write` | `POST /leads`, `PATCH /leads/:id`        |

`leads:write` **não** inclui leitura. Dê só o necessário. A chave sempre enxerga apenas a
empresa em que foi criada; não existe parâmetro para escolher outra.

## Limites

120 requisições por minuto por chave. Passou disso: `429 rate_limited` com `Retry-After`
(segundos até a janela reiniciar). Corpo de requisição: até 64 KB.

## Erros

```json
{ "error": { "code": "invalid_request", "message": "email: Invalid email" } }
```

| HTTP | `code`                                            | Quando                                                  |
| ---- | ------------------------------------------------- | ------------------------------------------------------- |
| 400  | `invalid_request`, `invalid_json`, `invalid_parameter`, `invalid_cursor`, `invalid_idempotency_key` | corpo ou parâmetro inválido; campo desconhecido |
| 401  | `invalid_api_key`                                 | chave ausente, desconhecida, revogada ou vencida (mesma resposta, de propósito) |
| 403  | `insufficient_scope`, `feature_not_available`     | a chave não tem o escopo / o plano não inclui a API     |
| 404  | `not_found`                                       | lead não existe **ou é de outra empresa**               |
| 405  | `method_not_allowed`                              | método sem suporte (veja o cabeçalho `Allow`)           |
| 413  | `payload_too_large`                               | corpo acima de 64 KB                                    |
| 422  | `invalid_stage`, `invalid_custom_field`           | dado válido no formato, mas recusado pela regra do funil |
| 429  | `rate_limited`                                    | limite por minuto                                       |
| 503  | `unavailable`                                     | falha temporária; tente de novo                         |

## Objeto Lead

```json
{
  "id": "6f1c…",
  "name": "Ana Souza",
  "email": "ana@exemplo.com",
  "phone": "(27) 99999-1234",
  "city": "Vitória",
  "status": "new",
  "stage_id": "a1d3…",
  "source": "api",
  "utm_source": "google",
  "utm_medium": null,
  "utm_campaign": null,
  "utm_content": null,
  "utm_term": null,
  "landing_page": null,
  "score": 0,
  "temperature": "cold",
  "deal_value": 2500,
  "deal_currency": "BRL",
  "external_id": "crm-77",
  "custom_fields": { "cargo": "Dona", "faturamento": 1500.5 },
  "created_at": "2026-11-02T13:00:00.000000+00:00",
  "updated_at": "2026-11-02T13:00:00.000000+00:00"
}
```

Não são expostos: identificadores de clique de anúncio (`gclid`, `fbclid`…), dados do
dispositivo e da localização, responsável, `metadata` e identificadores internos.

## Endpoints

### `GET /stages`

Etapas do funil (precisa dos ids para criar ou mover leads).
`kind` é `open`, `won` ou `lost`.

### `GET /leads`

Ordem fixa: mais recentes primeiro. Paginação por cursor.

| Parâmetro       | Descrição                                              |
| --------------- | ------------------------------------------------------ |
| `limit`         | 1 a 100 (padrão 50)                                    |
| `cursor`        | o `next_cursor` da página anterior                     |
| `stage_id`      | só leads desta etapa                                   |
| `created_since` | só leads criados desde esta data (ISO 8601)            |
| `external_id`   | igualdade exata                                        |
| `email`         | igualdade, sem diferenciar maiúsculas                  |

```json
{ "data": [ { "...lead" } ], "has_more": true, "next_cursor": "MjAyNi0x…" }
```

Percorra enquanto `has_more` for `true`. O cursor é estável: lead criado durante a leitura
não repete nem pula itens.

### `POST /leads`

Cria um lead na etapa de entrada (ou em `stage_id`, que precisa ser uma etapa **aberta**).
Informe ao menos `name`, `email` ou `phone`.

Campos aceitos: `name`, `email`, `phone`, `city`, `source` (padrão `"api"`), `utm_source`,
`utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `landing_page`, `external_id`,
`deal_value`, `deal_currency`, `stage_id`, `custom_fields`. **Qualquer outro campo é
recusado** com 400 (um erro de digitação não vira lead sem dado).

`custom_fields` usa a chave definida em Configurações → Campos personalizados e é validado
pelo tipo (texto, número, data `AAAA-MM-DD`, lista de opções).

Resposta: `201` com o lead.

**Idempotência.** Envie `Idempotency-Key: <texto único por pedido>` (até 128 caracteres).
Repetir o pedido com a mesma chave devolve o **mesmo lead** (`200`, cabeçalho
`Idempotent-Replay: true`) em vez de criar outro — use sempre que houver repetição
automática em caso de timeout. O corpo da repetição é ignorado; a chave vale por empresa.

> O Leadflow **não** deduplica por e-mail ou telefone nesta API. Duas chamadas sem
> `Idempotency-Key` criam dois leads.

### `GET /leads/:id`

Um lead. `404` se não existir ou for de outra empresa.

### `PATCH /leads/:id`

Atualiza só o que você enviar. `null` limpa o campo. Campos: `name`, `email`, `phone`,
`city`, `deal_value`, `deal_currency`, `external_id`, `stage_id`, `custom_fields`
(mescla com os atuais; `null` em uma chave a remove).

Origem e UTM não mudam depois de criado, e `status` não é definido direto: ele acompanha a etapa.

**Mover de etapa** (`stage_id`) tem o mesmo efeito de mover no funil do app: grava o
histórico de etapas, ajusta o `status` e dispara as automações e as conversões
configuradas para a etapa. Ao entrar em uma etapa de **ganho**, o Leadflow também tenta
enviar a conversão de venda ao Google Ads; o resultado (enviada ou o motivo de não ter
sido) aparece na linha do tempo do lead.

Não existe `DELETE` — apagar lead é feito só pela interface.

## Webhooks de saída

Cadastre o destino em **Configurações → API e webhooks**. A URL precisa ser `https` e
pública; endereços internos são recusados (na criação **e** a cada envio).

### Eventos

| Evento               | Quando                                  |
| -------------------- | --------------------------------------- |
| `lead.created`       | um lead é criado (por qualquer canal)   |
| `lead.stage_changed` | um lead muda de etapa                   |

### Envelope

```json
{
  "id": "0c9e…",                 // identifica o EVENTO; igual em reenvios
  "type": "lead.stage_changed",
  "created_at": "2026-11-02T13:00:00.000000+00:00",
  "data": {
    "lead": { "...objeto Lead" },
    "from_stage": { "id": "…", "name": "Novo", "kind": "open" },
    "to_stage":   { "id": "…", "name": "Proposta", "kind": "open" }
  }
}
```

`lead.created` traz só `data.lead`. O lead é um retrato do **momento do evento**.

### Cabeçalhos

| Cabeçalho              | Conteúdo                                        |
| ---------------------- | ----------------------------------------------- |
| `X-Leadflow-Event`     | tipo do evento                                  |
| `X-Leadflow-Event-Id`  | mesmo `id` do corpo                             |
| `X-Leadflow-Delivery`  | id desta tentativa de entrega                   |
| `X-Leadflow-Attempt`   | número da tentativa (1, 2, …)                   |
| `X-Leadflow-Signature` | `t=<segundos>,v1=<hex>`                         |

### Conferindo a assinatura

`v1` é o HMAC-SHA256, em hexadecimal, da string `"<t>.<corpo cru>"`, com o **segredo do
destino** (`whsec_…`, mostrado uma vez ao criar). Use o corpo **cru**, antes de qualquer
`JSON.parse`, e recuse se `t` estiver a mais de 5 minutos do relógio atual (evita reenvio
de uma entrega capturada).

```js
// Node.js (Express: use express.raw({ type: "application/json" }) nesta rota)
import { createHmac, timingSafeEqual } from "node:crypto";

export function confere(cabecalho, corpoCru, segredo, agora = Date.now() / 1000) {
  const p = Object.fromEntries(cabecalho.split(",").map((x) => x.split("=")));
  if (Math.abs(agora - Number(p.t)) > 300) return false;
  const esperado = createHmac("sha256", segredo).update(`${p.t}.${corpoCru}`).digest("hex");
  const a = Buffer.from(esperado), b = Buffer.from(p.v1 ?? "");
  return a.length === b.length && timingSafeEqual(a, b);
}
```

```python
# Python
import hmac, hashlib, time

def confere(cabecalho: str, corpo_cru: bytes, segredo: str) -> bool:
    p = dict(x.split("=", 1) for x in cabecalho.split(","))
    if abs(time.time() - int(p["t"])) > 300:
        return False
    esperado = hmac.new(segredo.encode(), p["t"].encode() + b"." + corpo_cru, hashlib.sha256).hexdigest()
    return hmac.compare_digest(esperado, p.get("v1", ""))
```

### Entrega e novas tentativas

- Responda com **2xx em até 8 segundos**. Redirecionamentos **não** são seguidos.
- Falhou (timeout, erro de rede ou status fora de 2xx): nova tentativa após 1 min, 5 min,
  30 min, 2 h e 6 h — **6 tentativas no total**.
- A entrega é **"pelo menos uma vez"**: o mesmo evento pode chegar repetido. Guarde o `id`
  dos eventos já processados e ignore repetições.
- A ordem entre eventos **não é garantida**; use `created_at` e o `updated_at` do lead.
- Depois de **8 entregas seguidas esgotadas**, o destino é desativado (com o motivo na
  tela). Corrija e use **Reativar**.
- Histórico das últimas entregas por destino na própria tela, guardado por 30 dias.
- **Testar** envia um evento `webhook.test` assinado, para validar sua verificação.
- **Novo segredo** invalida o anterior na hora: atualize seu sistema antes.

## Segurança e privacidade

- O webhook entrega dados pessoais do lead (nome, e-mail, telefone). Cadastre apenas
  destinos sob seu controle e com base legal para o tratamento (LGPD).
- Trate chave de API e segredo de webhook como senha: variável de ambiente, nunca no
  repositório. Revogue na hora se houver suspeita de vazamento (o efeito é imediato).
- Todas as criações, revogações e trocas de segredo ficam no registro de auditoria da empresa.
