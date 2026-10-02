# Plano — Lead ultraqualificado via WhatsApp (CAPI + central de atendimento)

Data: 02/10/2026. Base: altleadflow (CRM), Evolution API 2.3.7 na VPS.

Tudo abaixo separa **medido** de **conclusão**. Onde está escrito "medido", eu rodei
o comando. Onde está "conclusão", é leitura minha em cima do medido.

---

## 1. O ctwa_clid CHEGA pelo Baileys — confirmado em produção

> **Histórico das duas correções.** A v1 deste plano afirmou que o `ctwa_clid`
> "se perde". Era medição incompleta (só `/evolution/dist`). A v2 disse "a
> confirmar". A v3, abaixo, é medição em tráfego real — e derruba as duas.

**Medido** no banco da instância da agência (`altagency-evolution-db`, 02/10),
que atende a MAVIMAR e tem tráfego real:

| | |
|---|---|
| Mensagens guardadas | 12.364 |
| Vindas de anúncio (`externalAdReply`) | **84** |
| Que trazem `ctwaClid` | **83** (98,8%) |
| Janela | ago/2026: 3 · set/2026: **80** |
| `ctwaClid` distintos | 82 de 83 — praticamente um por conversa |

**Medido**: as duas instâncias rodam a **mesma versão** — Evolution 2.3.7,
Baileys 7.0.0-rc.9. O que funciona na agência funciona no altleadflow.

### O que vem numa mensagem real

```json
{
  "ctwaClid":  "AfhUM2J2cR316oTS6Xh5tL6ZLqdwtCOgMwybs4Cr…",
  "sourceId":  "120255783825570221",
  "sourceApp": "instagram",
  "sourceUrl": "https://www.instagram.com/p/DdusDnEMqe9/",
  "sourceType": "ad",
  "title": "Pré-Black: Tudo por R$50,00",
  "body":  "🚨 A Pré-Black da MAVIMAR começou!…",
  "clickToWhatsappCall": true
}
```

Vem a identidade do clique, o ID do anúncio, a rede de origem e até o criativo.

### Detalhe de implementação que só apareceu na medição

**Medido**: o `externalAdReply` **não fica num caminho fixo**. Ele mora dentro do
`contextInfo` de qualquer tipo de mensagem — nas amostras apareceu sob
`audioMessage` e sob `interactiveMessage`.

**Conclusão**: a extração precisa ser por busca recursiva
(`$.**.externalAdReply`), nunca por caminho fixo tipo
`message.extendedTextMessage.contextInfo.externalAdReply`. Caminho fixo perderia
silenciosamente os leads que chegam por áudio ou por mensagem interativa.

### O que isso muda no plano

O caminho da Meta deixa de ser o fraco e passa a ser o **mais forte**:

| | Antes (suposto) | Agora (medido) |
|---|---|---|
| `action_source` | `chat` | **`business_messaging`** |
| Chave de correspondência | telefone com hash | **`ctwa_clid`** (determinística) |
| Qualidade esperada | a medir, provavelmente baixa | alta — é o caminho oficial da Meta |

A decisão do usuário de manter o nativo no Meta estava certa, e por um motivo
melhor do que o que eu tinha apresentado.

Nota: a issue #2645 da Evolution descreve a perda do `referral` no caminho **Cloud
API** — problema real, mas de outro caminho. No Baileys o dado chega.

## 2. Duas portas de entrada, um motor só

### Decisão do usuário (02/10)

Não é um caminho ou outro. É cada canal usando o que faz sentido para ele:

| Canal | Destino do anúncio | Por quê |
|---|---|---|
| **Meta** | botão nativo "Enviar mensagem" | melhor taxa de clique→conversa; o nativo existe e funciona |
| **Google** | redirect próprio com código curto | o Google **não tem** botão nativo de WhatsApp — o redirect é obrigatório ali de qualquer jeito |

**Conclusão**: a decisão paga o custo do redirect só onde ele é inevitável, e
preserva a conversão do canal que hoje traz volume.

### O que cada porta entrega

| | Meta (nativo) | Google (redirect) |
|---|---|---|
| Identidade do clique | **sim** — `ctwaClid` medido em 83 de 84 mensagens de anúncio | `gclid` capturado por nós |
| Qual anúncio trouxe | sim, via `externalAdReply.sourceId` | sim, via UTM + código |
| `action_source` | `business_messaging` + `messaging_channel: whatsapp` | conversão offline do Google |
| Chave de correspondência | `ctwa_clid` (determinístico) + telefone | `gclid` (determinístico) |

**Medido** (documentação da Meta): `chat` é um `action_source` válido — "conversão
feita por app de mensagem". É o valor correto para conversa de WhatsApp sem
`ctwa_clid`. Usar `website` nesse caso seria mentir sobre a origem.

### A consequência que precisa ser administrada

No lado da Meta, a correspondência depende de **quantos dados da pessoa** mandamos
junto. Telefone sozinho casa menos que telefone + e-mail + nome.

**Medido** (documentação da Meta): e-mail e telefone são os campos de maior peso, e
a recomendação é EMQ (Event Match Quality) **6 ou mais, de 10**.

Daí uma decisão de produto, não de código: **o fluxo de qualificação deve capturar
e-mail quando possível**. O mesmo e-mail eleva o EMQ da Meta e alimenta as
Enhanced Conversions do Google. Um campo, dois ganhos.

**A medir depois de 3 a 4 semanas no ar**: o EMQ real dos eventos `chat`. Se ficar
abaixo de 6, reabrir a conversa sobre o redirect também no Meta. Não dá para
prometer o número antes de medir.

## 3. Evento só quando o lead qualifica

Essa é a parte que gera inteligência, e é independente do caminho A ou B.

A regra: o evento de conversão **não** dispara quando a conversa começa. Dispara
quando o lead muda para a **etapa** que aquele nicho considera qualificado.

### Decisão do usuário (02/10): etiqueta e etapa são a MESMA coisa

Não são dois gatilhos. São duas portas para o mesmo estado — a etapa do funil.

- Mover o card no pipeline → aplica a etiqueta correspondente no WhatsApp
- Aplicar a etiqueta no WhatsApp → move o card no pipeline

O evento dispara na **transição de etapa**, não no mecanismo que a causou. Se as
duas portas forem acionadas em sequência, a segunda não dispara nada porque a etapa
não mudou. Zero duplicação por construção, sem depender de janela de tempo.

**Medido**: a Evolution emite `LABELS_ASSOCIATION` e `LABELS_EDIT` (`addLabel`
aparece 1.812 vezes no bundle). A porta "etiqueta → CRM" é viável hoje.

Segunda linha de defesa: `event_id` determinístico por (lead, etapa). A Meta
deduplica do lado dela mesmo se algo for enviado duas vezes.

### Decisão do usuário (02/10): nada genérico, tudo por nicho

Não existe "etapa X" fixa no código. A ligação etapa → evento é **dado**, não
código. Cada empresa configura a sua.

Tabela nova, `stage_conversion_mappings`:

| Coluna | Para que serve |
|---|---|
| `stage_id` | qual etapa dispara |
| `meta_event_name` | nome do evento na Meta (padrão ou personalizado) |
| `google_conversion_action` | ação de conversão no Google Ads |
| `send_deal_value` | manda o valor junto (venda) ou não (lead) |
| `whatsapp_label` | etiqueta espelhada no WhatsApp |
| `is_active` | liga/desliga sem apagar a configuração |

Assim uma clínica de estética configura "Avaliação agendada" e uma imobiliária
configura "Visita ao decorado" — mesmo motor, funis diferentes.

Exemplo de como DOIS nichos usariam o mesmo motor:

| Nicho | Etapa que qualifica | Evento Meta | Valor? |
|---|---|---|---|
| Clínica | Avaliação agendada | `Schedule` | não |
| Clínica | Procedimento fechado | `Purchase` | sim |
| Imobiliária | Visita agendada | `Schedule` | não |
| Imobiliária | Proposta enviada | `LeadQualificado` (personalizado) | não |
| Imobiliária | Venda | `Purchase` | sim |

Nota sobre nomes: a Meta **recusa** `Lead` em mensageria (`business_messaging`).
Para eventos `website` — que é o caso do Caminho A — os nomes padrão valem, e
eventos personalizados também, desde que criados como conversão personalizada para
poderem virar meta de otimização.

## 4. O que já existe (medido)

Cerca de 60% do encanamento está pronto:

| Peça | Estado |
|---|---|
| `meta-capi.server.ts` com `fbc`/`fbp`/`fbclid` | existe |
| Eventos já disparados | `Lead`, `Contact`, `CompleteRegistration`, `ViewContent`, `PageView` |
| `gclid` por lead + upload de conversão offline | existe (`google-ads.functions.ts`) |
| Valor da venda na ficha do lead | existe (`DealValueCard`) |
| Integração Evolution (instância, QR, envio) | existe (`evolution.server.ts`) |
| Central de atendimento | existe em `/inbox` |
| Etapas de pipeline + etapa de entrada | existe (`stageService`, `entry-stage.server.ts`) |
| Automação por WhatsApp | existe (`whatsapp-automation.server.ts`) |

**Falta**: o redirect com código curto, a captura do `externalAdReply`, o disparo
por etapa/etiqueta, e a camada de qualidade de conversa para o gestor.

**Defeito encontrado de passagem**: `meta-capi.server.ts:81` monta o `fbc` com
`Math.floor(Date.now()/1000)` — o **horário do envio**, não o do clique. Para um
evento de qualificação que sai dias depois, o carimbo fica errado e a qualidade de
correspondência cai. O timestamp do clique precisa ser guardado no redirect.

---

## 5. Fases

**Fase 1 — Amarrar o clique à conversa**
Redirect com código curto; tabela de cliques (`fbclid`, `gclid`, UTM, timestamp
real); casamento do código na primeira mensagem; captura do `externalAdReply` como
reforço. Entrega: todo lead do WhatsApp sabe de qual anúncio veio.

**Fase 2 — Disparo por etapa e por etiqueta**
Configuração por empresa de qual etapa/etiqueta dispara qual evento; envio para
Meta CAPI e Google Ads; deduplicação por `event_id`; registro de cada envio com o
retorno da Meta. Entrega: o algoritmo passa a aprender com lead qualificado.

**Fase 3 — Central de atendimento de verdade**
Evoluir o `/inbox`: fila por atendente, atribuição, tempo de primeira resposta,
histórico ligado ao card do lead, visão do gestor com qualidade de conversa.

**Fase 4 — Inteligência**
Qual criativo traz lead que qualifica (não só que conversa); custo por lead
qualificado por anúncio; tempo médio até qualificar; alerta de conversa parada.

---

## 6. Riscos

- **Anúncio fora do padrão**: se alguém subir CTWA nativo, o lead entra sem código.
  Precisa de convenção de nomenclatura e conferência.
- **Janela da CAPI**: evento precisa ser enviado em até 7 dias do `event_time`. Se o
  lead qualifica depois, usar o instante da qualificação como `event_time`, com o
  `fbc` do clique original.
- **Volume baixo no começo**: a Meta precisa de massa para aprender. Conclusão:
  manter o evento de conversa como secundário enquanto o qualificado não tem volume.
- **Baileys é não oficial**: risco de banimento do número existe e não é zero.

---

## 7. Decidido

1. **Destino dos anúncios**: Meta no nativo, Google no redirect. (02/10)
2. **Etapas por nicho**: nada fixo no código; `stage_conversion_mappings` por empresa. (02/10)
3. **Etiqueta e etapa**: a mesma coisa, duas portas para o mesmo estado. Evento na
   transição, não no mecanismo. (02/10)

## 8. A medir, não a supor

- EMQ real dos eventos `chat` depois de 3-4 semanas
- Taxa de casamento do código curto no caminho do Google
- **Teste decisivo**: subir um anúncio CTWA de R$ 10, clicar nele com um celular,
  e capturar o payload cru do webhook `messages.upsert`. Isso responde de uma vez
  se `externalAdReply.ctwaClid` e `sourceId` chegam. Se o `ctwaClid` chegar, o
  caminho da Meta ganha identidade de clique de verdade e a CAPI de mensageria
  (`business_messaging`) passa a ser possível — o que muda a arquitetura para
  melhor. Custo do teste: uma diária de anúncio.
