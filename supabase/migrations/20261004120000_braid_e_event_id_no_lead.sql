-- Clique do Google no iOS: `wbraid` e `gbraid` no lugar do `gclid`
--
-- Quando o clique vem do Safari/app no iOS, o Google não entrega `gclid` — ele
-- entrega `wbraid` (clique na Rede de Pesquisa) ou `gbraid` (Display/YouTube).
-- A tabela `whatsapp_ad_clicks` já guardava os dois desde 05/2026; `leads` não,
-- então todo lead de iOS chegava sem identificador de clique e a conversão
-- offline caía na correspondência probabilística por contato.
--
-- Medido em 04/10/2026: a coluna não existia em `public.leads` — só `gclid`,
-- `fbclid` e `event_id`.

alter table public.leads
  add column if not exists wbraid text,
  add column if not exists gbraid text;

comment on column public.leads.wbraid is
  'Identificador de clique da Rede de Pesquisa quando o iOS não entrega gclid.';
comment on column public.leads.gbraid is
  'Identificador de clique de Display/YouTube quando o iOS não entrega gclid.';
