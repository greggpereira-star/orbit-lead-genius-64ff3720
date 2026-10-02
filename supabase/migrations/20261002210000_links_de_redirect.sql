-- Redirect com código curto — a metade do Google da Fase 1.
--
-- O Google Ads não tem botão nativo de WhatsApp. Sem um redirect próprio, não
-- existe caminho de atribuição nenhum: o lead chega na conversa e ninguém sabe
-- de qual campanha veio. A página captura o `gclid`, gera um código curto, e
-- manda a pessoa para o WhatsApp com esse código na mensagem.

CREATE TABLE IF NOT EXISTS public.redirect_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- O que vai na URL do anúncio: /ir/<slug>
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,

  -- Para onde manda. Separado da instância do CRM de propósito: a campanha pode
  -- apontar para o número de um corretor, não para o número central.
  destino_phone text NOT NULL,

  -- A mensagem que já vem digitada. `{{codigo}}` é trocado na hora.
  mensagem text NOT NULL DEFAULT 'Olá! Vim pelo anúncio. [{{codigo}}]',

  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS redirect_links_empresa ON public.redirect_links (company_id);

ALTER TABLE public.redirect_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS redirect_links_membro ON public.redirect_links;
CREATE POLICY redirect_links_membro ON public.redirect_links
  FOR ALL USING (public.check_membership(company_id))
  WITH CHECK (public.check_membership(company_id));

-- A mesma tabela de cliques atende as duas portas.
--
-- Duas tabelas responderiam a mesma pergunta — "de onde veio essa conversa" — e
-- todo relatório teria que unir as duas e lembrar de nunca esquecer uma. Uma
-- tabela com a coluna `origem` dizendo qual porta foi usada é mais honesta.
ALTER TABLE public.whatsapp_ad_clicks
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'ctwa'
    CHECK (origem IN ('ctwa','redirect')),
  ADD COLUMN IF NOT EXISTS short_code text,
  ADD COLUMN IF NOT EXISTS gclid text,
  ADD COLUMN IF NOT EXISTS fbclid text,
  ADD COLUMN IF NOT EXISTS utm_source text,
  ADD COLUMN IF NOT EXISTS utm_medium text,
  ADD COLUMN IF NOT EXISTS utm_campaign text,
  ADD COLUMN IF NOT EXISTS utm_content text,
  ADD COLUMN IF NOT EXISTS utm_term text,
  ADD COLUMN IF NOT EXISTS link_id uuid REFERENCES public.redirect_links(id) ON DELETE SET NULL;

-- O clique do redirect nasce SEM telefone: a pessoa ainda não mandou mensagem.
-- Por isso a coluna deixa de ser obrigatória — o telefone chega depois, quando o
-- código curto aparecer na primeira mensagem.
ALTER TABLE public.whatsapp_ad_clicks ALTER COLUMN phone DROP NOT NULL;

-- O código é a chave de casamento. Único por empresa, e índice parcial porque o
-- clique de CTWA não tem código nenhum.
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_ad_clicks_codigo_unico
  ON public.whatsapp_ad_clicks (company_id, short_code)
  WHERE short_code IS NOT NULL;
