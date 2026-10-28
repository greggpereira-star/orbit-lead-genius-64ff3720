# Recon: Leaper (leaper.com.br) × Altleadflow

Data: 27/10/2026. Método: só fontes públicas (site, central de ajuda, referência da API, termos), lidas por página, sem login, sem crawler, sem JS/rede do app. Do lado do Altleadflow, leitura do código e do banco de produção (somente consulta). Sem capturas de tela: o app da Leaper fica atrás de login e não há conta do usuário nela, então as telas abaixo são **inferidas dos títulos da central de ajuda**, não vistas.

Rótulos: **[medido]** = li na fonte nomeada. **[inferido]** = conclusão minha, não confirmada.

## 1. Escopo

- **App:** Leaper, web (app.leaper.com.br). **Fatia:** o ciclo central, "origem do anúncio → lead → conversa → etapa → venda → devolução da conversão para Meta/Google". **Para quem:** o próprio Altleadflow (agências e gestores de tráfego com clientes locais que vendem por WhatsApp).
- **Posição da Leaper [medido, site]:** "não é plataforma de atendimento", lê as conversas em modo só leitura, "não se posiciona como substituta universal de CRM". Preço: Essencial R$147/mês, Professional R$197/mês (acrescenta classificação por IA), uma conta = um número de WhatsApp, usuários ilimitados, 30 dias de garantia.
- **Consequência para nós:** a Leaper é uma camada de **mensuração pós-lead**. O Altleadflow já é CRM + caixa de entrada + captura. A comparação certa não é "copiar a Leaper", é "quais peças de mensuração e abertura ela tem que a gente não tem".

## 2. Fontes

| fonte | URL | o que deu |
|---|---|---|
| Site | https://leaper.com.br/ | módulos, planos, integrações |
| Rastreamento | /recursos/rastreamento-de-leads-whatsapp/ | fluxo em 3 passos, dados por lead |
| API | /desenvolvedores/ | endpoints, modelo de dados, limites (fonte mais rica) |
| Ajuda: leads | /ajuda/leads/ | dashboard, lista, kanban, cadastro |
| Ajuda: rastreamento | /ajuda/rastreamento/ | links rastreáveis, origens por mensagem, formulários |
| Ajuda: IA | /ajuda/ia/ | IA, frase-gatilho, modos de automação |
| Ajuda: mídia | /ajuda/midia/ | Meta, Google, Ads Insights, histórico de envios |
| Ajuda: integrações | /ajuda/integracoes/ | API, webhooks, sync de status |
| Artigo IA | /conteudos/classificacao-leads-ia-conversas/ | regras de autonomia, confiança |
| Artigo Google | /conteudos/conversoes-offline-google-ads/ | eventos, gclid/wbraid/gbraid |
| Artigo auditoria | /conteudos/como-auditar-atendimento-comercial-leads/ | o que a Leaper NÃO mede |
| Parceiros | /parceiros/ | modelo para agências |
| Termos | /termos/ | cláusulas relevantes (ver §9) |

Não lidos: os ~100 artigos individuais da ajuda (só os índices e 2 artigos de conteúdo), e os artigos de Meta (`/conteudos/como-enviar-leads-qualificados-vendas-meta-ads/`). Há detalhe que falta.

## 3. Inventário de telas [inferido dos títulos da ajuda]

| ID | tela | propósito | componentes-chave |
|---|---|---|---|
| S01 | Dashboard | contatos, vendas, perdidos, valor total; funil; origem; não rastreados | cards, funil, distribuição por origem, exportar PDF |
| S02 | Lista de leads | busca/filtros, pré-visualização com histórico e tracking, CSV | tabela, drawer de lead |
| S03 | Kanban | colunas = status, arrastar, filtros origem/tag/data | board |
| S04 | Cadastro/edição de lead | campos, valor em negociação, tags, campos personalizados, troca de status | formulário |
| S05 | Conversa (leitura) | mensagens ao lado de origem e etapa | thread só leitura |
| S06 | Links rastreáveis | criar, tipos (botão no site, anúncio direto, orgânico), estatísticas, params TikTok | lista + estatísticas |
| S07 | Origens por mensagem | código/mensagem padrão que reconhece a origem | lista + regra |
| S08 | Formulários | criar, incorporar, ver envios | builder simples |
| S09 | WhatsApp | conexão (Coexistence, QR), status, chat integrado | wizard |
| S10 | Meta | conectar conta, pixel/IDs, eventos por status, ver conversões, params de URL | wizard |
| S11 | Google Ads | conectar, gatilhos, categorias de conversão, incluir nas métricas, termos | wizard |
| S12 | Ads Insights | métricas unificadas Meta+Google (impressões, cliques, gasto, CPL, leads rastreados) | abas Geral/Meta/Google, filtros |
| S13 | Histórico de envios | conversões enviadas a Meta/Google/webhooks, status, tentativas, falhas | tabela de logs |
| S14 | IA e automação | contexto do negócio, instrução por status, notificações, filtro de leads, modos, frase-gatilho, palavras-chave | configuração |
| S15 | API e Webhooks | chave, webhooks (HMAC), eventos | config |
| S16 | Integrações de status | ChatGuru, Trinks, Agilize, Polichat enviam mudança de status | guias |
| S17 | Conta e equipe | usuários, permissões, empresas | configurações |

Estados (vazio, erro, mobile): **não observados**. Não há como saber sem a conta.

## 4. Fluxos [medido nos três passos da página de rastreamento; o resto inferido]

- **F01 Anúncio → venda → mídia:** conecta WhatsApp → cada conversa é ligada a origem (Meta Ads / Google Ads / orgânico) e a campanha/conjunto/anúncio → lead anda no funil → status "qualificado" ou "venda" dispara conversão para Meta e Google. Ponto de falha citado: lead "não rastreado".
- **F02 Link rastreável:** gera link → usa em botão do site, anúncio ou rede social → clique gravado → mensagem chega → ligada ao clique.
- **F03 Origem por mensagem:** sem clique, reconhece pela mensagem padrão/código que o lead envia.
- **F04 Classificação por IA:** instrução por status → IA lê a conversa 1–2×/dia → acima do limite de confiança aplica, abaixo sugere → pessoa confirma (pode ser pelo WhatsApp) → fica registrada justificativa + resumo.
- **F05 Frase-gatilho/palavra-chave:** frase digitada no WhatsApp muda o status (ciclo ~30 min). Tem prioridade sobre a IA.
- **F06 Sistema externo move o status:** helpdesk (ChatGuru, Trinks, Agilize, Polichat) avisa a Leaper por webhook → status muda → conversão sai.

## 5. Componentes

Cards de métrica, funil, tabela com filtros, drawer de lead, kanban, wizard de conexão, indicador de status de conexão, editor de regra por status, histórico com status/tentativas/ação de reenvio. Nada fora do comum; o diferencial não é UI, é o **encadeamento de dados**.

## 6. Modelo de dados [medido: página /desenvolvedores/]

- **Lead:** id, name, phone, email, address, custom_fields(key/value), source, tags, created_at, updated_at, created_from (external_api | whatsapp | forms), lead_value.
- **Status (etapa do funil):** id estável (não muda ao renomear), code, name, position, is_funnel. Convertido = status `END_WON`.
- **Passagem por status:** id, code, name, changed_at (histórico cronológico, com `current` e `previous`).
- **Tracking:** source, source_app, source_url, source_type, UTMs, referer, page_url, device, browser, os, click_id, click_id_type, click_date, campaign_data(ad, ad_set, campaign), form_data, journey.
- **Envio de formulário:** form_name, answers(field,label,value), tracking, submitted_at.
- **Mensagem:** from_me, message, received_at; idempotência por `message_id` (≤255).
- **Origens (21 valores):** PHONE, EMAIL, WEBSITE, WHATSAPP, WHATSAPPBOT, METAADS_MSG, METAADS_SITE, GOOGLE_SITE, TIKTOK_ADS, GOOGLE_ORGANIC, INSTAGRAM_ORGANIC, TIKTOK_ORGANIC, FACEBOOK_ORGANIC, YOUTUBE_ORGANIC, OTHER_ORGANIC, OTHER, REFERRAL, IN_PERSON, EVENT, NO_TRACKING, TRACKING_LOST.
- **Endpoints (14):** POST /v1/message (cria lead se não existe), GET/POST /v1/leads, GET/PUT /v1/leads/{id}, GET /conversation, GET/PUT /status, GET /v1/statuses(+id), GET /v1/company, GET /v1/reports/{summary, leads-by-status, leads-by-source}.
- **Regras:** `X-API-Key`; 401/403/422/429 com `Retry-After`; `limit` 1–200 (50 com `include`); relatórios até 92 dias; telefone 8–15 dígitos com DDI; `lead_value` com ponto decimal; datas no horário de Brasília; PUT mescla `custom_fields` por key e **substitui** `tags`; mudar status só pelo endpoint próprio, que dispara conversão e webhook.

Não documentado na página: obtenção da chave, lista completa de eventos de webhook e payload, quota do 429.

## 7. Comparação com o Altleadflow

Base: leitura do código e do banco de produção em 27/10. Onde a coluna do Altleadflow diz "tem", conferi tabela ou arquivo.

| capacidade | Leaper | Altleadflow hoje | veredicto |
|---|---|---|---|
| Lead, kanban, lista, campos personalizados, tags, valor | sim | **tem** (`leads.deal_value`, `custom_fields`, `lead_tags`, `stages`) | igual |
| Caixa de entrada WhatsApp completa, templates, automações, roteamento | **não** (só leitura) | **tem** (`wa_*`, `automation_rules`, `routing_configs`) | **nós à frente** |
| Formulários e quiz com pontuação | formulários simples | **tem**, bem mais rico | **nós à frente** |
| Permissões, convites, visibilidade por atendente, auditoria | "usuários e permissões" | **tem** (feito nesta semana) | igual ou à frente |
| Link de redirecionamento com código curto (clique→mensagem) | sim | **tem parcial** (`redirect_links`, `/ir/$slug`) | falta estatística e tipos |
| Etapa → evento Meta/Google com valor | sim | **tem** (`stage_conversion_mappings`, `send_deal_value`, `conversion_dispatches`) | igual |
| Atribuição de campanha/conjunto/anúncio | sim | **tem** (`meta_ad_attribution`, `ctwa.server.ts`, `whatsapp_ad_clicks`) | igual |
| Relatório por anúncio (qualificados, valor, dias até qualificar) | sim | **tem** (`relatorio_anuncios`) | igual |
| **Gasto, CPL, ROAS (Ads Insights)** | sim | **não tem**: nenhum código lê gasto da Meta/Google | **lacuna** |
| **Histórico de envios com status, tentativas e reenvio na UI** | sim | tabela existe; **nenhuma tela** a usa | **lacuna** |
| **API pública com chave + webhooks de saída (HMAC)** | sim | **não tem** (`integration_webhooks` existe, 0 linhas, sem uso no código) | **lacuna** |
| **Classificação de lead por IA lendo a conversa** | sim (plano Professional) | **não tem**: nenhum chamado a LLM no código; `modules/ai` é simulado (comentário "Mock data find") | **lacuna** |
| **Frase-gatilho / palavra-chave na mensagem muda a etapa** | sim | só etiqueta→etapa (`etiqueta-para-etapa.server.ts`); sem leitura do texto | **lacuna parcial** |
| **Origem por mensagem/código sem clique** | sim | **não tem** | **lacuna** |
| Sincronizar etapa vinda de outro sistema (ChatGuru, Kommo, RD, Trinks...) | sim | só CV CRM | **lacuna** |
| Origem "não rastreado / perdido" explícita + painel | sim | origem em texto livre; sem taxonomia nem painel | **lacuna** |
| Parâmetros TikTok Ads, integração Typeform | sim | quase nada | lacuna menor |
| Exportar dashboard em PDF | sim | não | lacuna menor |
| Programa de parceiros (preço por conta, multi-conta) | sim | usuário pode ter várias empresas; sem painel de agência | decisão de negócio |
| **Auditoria de atendimento** (1ª resposta, sem resposta, por vendedor) | **admite que não tem** | existe `avgResponseSeconds`, só no chat do site; não no WhatsApp | **oportunidade de ficar à frente** |

## 8. O que vale implementar (ordem de valor)

1. **Histórico de envios com reenvio** (tela sobre `conversion_dispatches`). Os dados já existem. Responde a pergunta mais comum de quem usa conversão offline: "por que não apareceu no Meta?". Tamanho **S**.
2. **Gasto, CPL e ROAS reais** (ler gasto da Meta e do Google por anúncio/dia; cruzar com `relatorio_anuncios`). Fecha o que o cliente da agência quer ver: custo por lead qualificado e por venda. A conexão Meta e Google já existe. Tamanho **M**.
3. **Origem por mensagem + painel de "não rastreado"**. Hoje um lead que chega sem clique fica sem origem e some dos relatórios. Código/mensagem padrão recupera parte; o painel mostra o resto. Tamanho **M**.
4. **Estatísticas dos links de redirecionamento** (cliques, conversas, qualificados, vendas por link; tipos site/anúncio/orgânico; parâmetros TikTok). Tamanho **S**.
5. **API pública com chave + webhooks de saída assinados.** Permite integração com o resto do ecossistema do cliente e é pré-requisito do item 7. Cuidado de segurança: chave por empresa guardada só como hash, limite de taxa, escopo, auditoria. Tamanho **M**.
6. **Frase-gatilho/palavra-chave sobre o texto da conversa** (regra determinística, sem IA). Valor alto, custo baixo. Tamanho **S–M**.
7. **Classificação por IA com modos de autonomia** (sempre confirmar / confirmar se confiança baixa / automático), justificativa e resumo gravados, limite de confiança, escopo por rastreados. **Exige decisão de produto antes** (§10). Tamanho **L**.
8. **Auditoria de atendimento no WhatsApp** (1ª resposta, leads sem resposta, abandono após qualificado, por atendente). É a lacuna que a própria Leaper admite, e o Altleadflow tem as mensagens com direção e horário. Tamanho **M**.
9. **Sincronização de etapa por webhook de entrada** de outros helpdesks. Só se houver cliente real usando outro sistema. Tamanho **M**.

Não vale copiar: o modo "só leitura de conversa" (temos coisa melhor), o posicionamento de não-CRM, e o plano de preço por número.

## 9. Limites éticos e legais

- Terms da Leaper [medido, /termos/]: **sem** cláusula contra produto concorrente. Proíbem "engenharia reversa não autorizada" (seção 18) e reservam software, interface e APIs (seção 19). Este trabalho ficou em texto público de marketing e documentação, e **não** copia interface, texto, nome de campo da API como contrato, nem código. Se formos oferecer API, desenhar o nosso contrato próprio; **não** reutilizar os nomes e os 21 códigos de origem como estão.
- Nada de conta da Leaper foi acessada.
- Não clonável: a base de clientes e integrações homologadas com parceiros (Kommo, RD, ChatGuru), o Programa de Parceiros e o conteúdo da Academy.

## 10. Decisões abertas (precisam do dono do produto)

1. **IA de classificação:** que modelo, custo por lead e quem paga? Nenhum chamado a LLM existe hoje no código. Lembrar que mandar conversa de lead para um provedor de IA é tratamento de dado pessoal: vai exigir texto de privacidade/consentimento e opção de desligar por empresa (o Altleadflow já tem `lead_consents`).
2. **Taxonomia de origem:** adotar um conjunto fechado (como a Leaper) ou manter texto livre? Fechado melhora relatório e filtro.
3. **API pública:** abrir para todos os planos ou só para um?
4. **Gasto de mídia:** qual a fonte de verdade quando Meta e Google divergem do que o cliente vê?

## 11. Tamanho

- Telas novas: ~5 (histórico de envios, Ads Insights, estatísticas de link, painel não rastreado, chaves/webhooks). Fluxos novos: 5. Entidades novas: `api_keys`, `webhook_endpoints`, `webhook_deliveries`, `ad_spend_daily`, `link_clicks`, `classificacoes_ia`.
- Partes difíceis: (1) **gasto de mídia** (duas APIs, moeda, fuso, atribuição de janela), (2) **IA** (custo, privacidade, avaliação de qualidade, reprocessamento), (3) **API pública** (segurança e limite de taxa).
- Tamanho total da lista priorizada (itens 1–6 e 8): **L** (cerca de um trimestre com uma pessoa), mas entrega valor desde a primeira semana (itens 1 e 4).
