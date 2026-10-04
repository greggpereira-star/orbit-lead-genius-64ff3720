-- Idempotência do lead pela mesma chave que a Meta e o Google usam
--
-- Medido em 04/10/2026: `leads` e `form_submissions` têm APENAS a chave
-- primária. Nenhuma restrição de unicidade em lugar nenhum. O botão de envio é
-- travado por `isSubmitting` dentro da página, mas um recarregamento e reenvio
-- criava dois leads, duas submissões e dois eventos `Lead`.
--
-- O `event_id` passou a ser gravado no lead em 441c019. Ele já é a chave de
-- deduplicação da Meta (navegador + servidor contam um só) e o `orderId` do
-- Google Ads. Usá-lo aqui alinha os três: o mesmo evento é um lead, uma
-- conversão na Meta e uma conversão no Google.
--
-- Índice PARCIAL de propósito: os 489 leads existentes têm `event_id` nulo, e
-- nulo não conflita — nenhum deles é afetado.

create unique index if not exists leads_company_event_id_uniq
  on public.leads (company_id, event_id)
  where event_id is not null;

comment on index public.leads_company_event_id_uniq is
  'Um evento de conversão, um lead. Mesma chave usada pela Meta e pelo Google Ads.';

-- A submissão de formulário é identificada pela sessão dentro do formulário.
-- `form_submit_publico` já procura por esta chave antes de inserir; o índice
-- torna a corrida impossível e acelera a busca.
create unique index if not exists form_submissions_form_session_uniq
  on public.form_submissions (form_id, (tracking ->> 'session_id'))
  where (tracking ->> 'session_id') is not null;

comment on index public.form_submissions_form_session_uniq is
  'Uma submissão por sessão em cada formulário.';
