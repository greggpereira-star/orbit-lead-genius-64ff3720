-- Modo de ensaio: exercitar a conversão por etapa sem tocar na campanha.
--
-- O problema concreto: o pixel configurado é o de produção do cliente. Mover
-- um cartão para conferir se a corrente funciona manda conversão de verdade
-- para dentro do aprendizado da campanha — e aprendizado sujo não tem
-- desfazer. O código de teste da Meta resolve metade (só a Meta, e o valor é
-- gerado na aba Testar eventos, fora do nosso alcance); o Google Ads não tem
-- equivalente nenhum.
--
-- Com o ensaio ligado, o despachante monta o MESMO payload, grava o que teria
-- enviado e não chama ninguém. A etiqueta no WhatsApp continua sendo aplicada:
-- ela é parte do que se quer ver funcionando e não afeta anúncio.

alter table public.companies
  add column if not exists conversion_dry_run boolean not null default false;

comment on column public.companies.conversion_dry_run is
  'Ligado: conversões de etapa são montadas e registradas, nunca enviadas à Meta ou ao Google. Para conferir a corrente sem sujar a otimização.';

-- O status precisa ser distinguível de `sent`. Contar ensaio como envio é a
-- mesma classe de erro do token que morreu e seguiu dizendo "Ativo": o número
-- no relatório diria que a conversão chegou quando ela nunca saiu daqui.
alter table public.conversion_dispatches
  drop constraint if exists conversion_dispatches_status_check;

alter table public.conversion_dispatches
  add constraint conversion_dispatches_status_check
  check (status in ('pending', 'sent', 'failed', 'skipped', 'rehearsal'));
