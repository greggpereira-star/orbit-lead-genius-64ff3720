-- Atribuição de clique do WhatsApp (CTWA) — Fase 1
--
-- Guarda a identidade do clique que a Meta injeta quando alguém chega por um
-- anúncio de Click-to-WhatsApp. Medido em tráfego real da instância da agência
-- em 02/10/2026: de 84 mensagens vindas de anúncio, 83 traziam `ctwaClid`.
--
-- Tabela separada em vez de colunas em `leads` por dois motivos. A mensagem
-- chega ANTES do lead existir — é o primeiro contato — então precisa de um lugar
-- que não dependa do lead. E a mesma pessoa pode voltar por outro anúncio depois:
-- cada clique é um fato próprio, com data própria, e sobrescrever perderia o
-- histórico de qual criativo trouxe qual conversa.

CREATE TABLE IF NOT EXISTS public.whatsapp_ad_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Preenchido quando dá pra casar com um lead. Fica nulo no primeiro contato e
  -- é ligado depois — por isso não é NOT NULL.
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,

  -- O telefone é o que permite ligar ao lead mais tarde. Guardado só com dígitos.
  phone text NOT NULL,

  -- A identidade do clique. É ela que a Meta usa para casar a conversão de volta
  -- com a pessoa que viu o anúncio. Sem ela a atribuição vira probabilística.
  ctwa_clid text,

  -- Qual anúncio, em que rede, com qual criativo. Serve ao NOSSO relatório:
  -- "qual criativo traz lead que qualifica" é inteligência que a Meta não devolve.
  source_id text,
  source_app text,
  source_url text,
  source_type text,
  ad_title text,
  ad_body text,

  -- O objeto cru, para quando aparecer um campo novo que hoje não lemos.
  raw jsonb,

  -- Momento do clique, não da gravação. A CAPI precisa do instante real do
  -- evento, e usar now() no envio carimbaria a hora errada.
  clicked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Um mesmo ctwa_clid não deve entrar duas vezes: a Evolution reentrega webhook,
-- e sem isto o mesmo clique viraria dois. Índice parcial porque `ctwa_clid` pode
-- ser nulo (anúncio sem clid, 1 em 84 na medição) e nulos não colidem.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_ad_clicks_clid_unico
  ON public.whatsapp_ad_clicks (company_id, ctwa_clid)
  WHERE ctwa_clid IS NOT NULL;

CREATE INDEX IF NOT EXISTS whatsapp_ad_clicks_lead ON public.whatsapp_ad_clicks (lead_id);
CREATE INDEX IF NOT EXISTS whatsapp_ad_clicks_phone ON public.whatsapp_ad_clicks (company_id, phone);

ALTER TABLE public.whatsapp_ad_clicks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_ad_clicks_membro ON public.whatsapp_ad_clicks;
CREATE POLICY whatsapp_ad_clicks_membro ON public.whatsapp_ad_clicks
  FOR SELECT USING (public.check_membership(company_id));

-- Escrita só pelo servidor (service role). O webhook é público e não autenticado;
-- deixar o anon escrever aqui permitiria forjar atribuição de anúncio.
