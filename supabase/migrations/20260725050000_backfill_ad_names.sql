-- Preenche nome de anúncio/conjunto/campanha nos leads já existentes.
--
-- A coleta de atribuição parou de funcionar quando meta-attribution.server.ts
-- se perdeu, então os leads gravados desde então só têm os IDs numéricos e a
-- ficha mostra "52525417339565". Os nomes existem em meta_ad_attribution —
-- é só ligar os dois.
--
-- Aditivo de propósito: usa `||` pra acrescentar chaves ao metadata sem tocar
-- em nada que já está lá. E não reescreve utm_campaign dos leads antigos, pra
-- não mudar retroativamente número que alguém já possa ter usado em relatório.
--
-- Idempotente: rodar de novo só regrava o mesmo valor.
UPDATE public.leads l
   SET metadata = COALESCE(l.metadata, '{}'::jsonb) || jsonb_build_object(
         'meta_ad_name', a.ad_name,
         'meta_adset_name', a.adset_name,
         'meta_campaign_name', a.campaign_name
       )
  FROM public.meta_ad_attribution a
 WHERE a.company_id = l.company_id
   AND a.ad_id = l.metadata->>'meta_ad_id'
   AND a.fetch_status = 'ok'
   AND a.ad_name IS NOT NULL;
