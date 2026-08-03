# Webhook do Meta Lead Ads

Configuração feita **uma vez por App do Facebook**, por quem opera o sistema —
não pelo cliente que usa o CRM. Ficava numa seção recolhida da tela de
integração, mas ali só servia para confundir: o dono da clínica ou da
imobiliária não tem acesso ao Facebook Developers e nunca vai precisar disso.

## Onde apontar

No [Facebook Developers](https://developers.facebook.com/apps) → seu App →
**Webhooks** → **Page** → *Subscribe to this object*:

| Campo | Valor |
|---|---|
| Callback URL | `https://<dominio-do-app>/api/public/meta-webhook` |
| Verify Token | o valor de `META_VERIFY_TOKEN` no `.env` do servidor |
| Campo assinado | `leadgen` |

Em produção hoje: `https://altleadflow.com.br/api/public/meta-webhook`

O `META_VERIFY_TOKEN` vive em `/opt/altleadflow-app/.env`, lido pelo
`EnvironmentFile` da unidade systemd. Ele é uma senha combinada entre o Facebook
e o servidor: o Facebook a envia na verificação inicial e o endpoint só confirma
a assinatura se bater. Não é o mesmo que `META_APP_SECRET`.

## Verificando

O Facebook faz um `GET` com `hub.mode=subscribe`, `hub.verify_token` e
`hub.challenge`. O endpoint devolve o `challenge` cru quando o token confere.
Para testar sem o Facebook:

```bash
curl -s "https://altleadflow.com.br/api/public/meta-webhook?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=teste123"
```

Deve responder exatamente `teste123`. Qualquer outra coisa — vazio, erro, HTML —
significa que o token não bate ou o endpoint não está no ar.

## Assinatura das páginas

Apontar o webhook do App não basta: **cada página** precisa estar inscrita no
objeto `leadgen`. Isso o app faz sozinho pela tela de integração, no botão que
liga o recebimento automático de cada página — é o `setPageSubscription`.

Se um lead entra no Facebook mas não aparece no CRM, a ordem de investigação é:
página inscrita → webhook do App configurado → token da conexão válido.
