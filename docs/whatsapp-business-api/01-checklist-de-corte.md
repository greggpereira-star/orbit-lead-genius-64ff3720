# Checklist de corte da Evolution (por cliente)

Decisão de 15/10/2026: **corte seco por cliente**, sem contingência. Desligar a
instância da Evolution é irreversível — a sessão pareada por QR some, e voltar
exige o celular na mão. Este roteiro existe para o corte ser uma decisão
informada, e não um clique.

A tela **Configurações › WhatsApp oficial › "Desligar a conexão antiga"** mostra
os mesmos itens e só libera com os obrigatórios em ordem. O servidor reavalia
tudo na hora de executar — o que a tela mostrou não vale como prova.

## Antes de combinar a janela com o cliente (você, fora do sistema)

- [ ] Número do cliente no **app WhatsApp Business** há ≥ 7 dias, app ≥ v2.24.17
      (pré-requisito da coexistência — fonte: referência COEXISTENCE.md).
- [ ] Cliente sabe que precisa **abrir o app a cada ~13 dias** (coexistência).
- [ ] Cliente sabe que **mensagens fora da janela de 24h exigem template** e que
      cada template passa por aprovação da Meta.
- [ ] Meio de pagamento do cliente cadastrado na Meta (WABA própria, decisão 4).
- [ ] Verificação do negócio e permissões do app concluídas na Meta.

## Obrigatórios — o sistema bloqueia sem eles

| Item | Como conferir |
|---|---|
| Servidor com `WA_TOKEN_KEY` e `WA_WEBHOOK_VERIFY_TOKEN` | cartão "Requisitos" na tela |
| Número oficial conectado e **ativo** | status "Ativo" no cartão do número |
| Webhook inscrito (`webhook_subscribed_at`) | "Recebimento: ativo" |
| ≥ 1 mensagem **recebida** de cliente na semana, pelo canal oficial | peça a alguém que escreva para o número |
| ≥ 1 mensagem **enviada e entregue** (✓✓) na semana | responda pelo atendimento |
| ≥ 1 **template aprovado** | lista de templates |

## Avisos — não bloqueiam, mas leia

- Saudação/alerta **antigos** (texto livre) serão **desligados** pelo corte.
  Substitua por regras com "Enviar template" **antes**.
- Regras com "Enviar texto" serão **puladas** fora da janela de 24h.
- A faixa do quiz sem template só chega com a janela aberta (quase nunca).

## O que o corte faz (e só isso)

1. Desliga `greeting_enabled` e `broker_alert_enabled` da empresa.
2. Remove a instância na Evolution (`logout` + `delete`).
3. Marca `whatsapp_instances` como `disconnected` com o motivo.

Não apaga mensagens, leads, nem o histórico da tabela `whatsapp_messages`.

## Depois do corte

- [ ] Mandar uma mensagem de teste pelo atendimento e confirmar a entrega.
- [ ] Escrever para o número e confirmar que a conversa aparece.
- [ ] Observar `wa_webhook_events` por 7 dias: `failed` deve ser 0.
- [ ] Só depois que **todas** as empresas migraram: remover QR e
      `whatsapp_instances` da tela legada (`/whatsapp` sem número oficial).
