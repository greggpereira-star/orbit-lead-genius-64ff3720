-- A conversa que a automação abre pode nascer num número ESCOLHIDO, e não só no mais antigo.
--
-- `wa_obter_ou_criar_conversa` sempre usava "o primeiro número ativo da empresa" (o comentário
-- dizia: "hoje o produto conecta um por empresa"). Com dois números, a conversa de um lead novo
-- nascia no mais antigo, e o envio de template procurava o template na conta DESSE número —
-- "Template não encontrado" quando o template era de outra conta (caso medido em 23/10/2026).
--
-- Agora o chamador pode dizer em qual número (wa_phone_numbers.id). Sem o parâmetro, nada muda.
-- A assinatura antiga (4 argumentos) é removida: manter as duas deixaria a chamada por nome
-- ambígua. Quem chama com 4 argumentos continua funcionando, porque o novo tem DEFAULT.

DROP FUNCTION IF EXISTS public.wa_obter_ou_criar_conversa(uuid, text, uuid, text);

CREATE OR REPLACE FUNCTION public.wa_obter_ou_criar_conversa(
  p_company_id uuid,
  p_wa_id text,
  p_lead_id uuid DEFAULT NULL,
  p_profile_name text DEFAULT NULL,
  p_phone_number_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_num public.wa_phone_numbers%ROWTYPE;
  v_contato uuid;
  v_conversa uuid;
BEGIN
  IF p_phone_number_id IS NOT NULL THEN
    -- O número pedido tem de ser DA EMPRESA e estar ativo: o id vem do chamador, e uma empresa
    -- nunca abre conversa no número de outra.
    SELECT * INTO v_num FROM public.wa_phone_numbers
     WHERE id = p_phone_number_id AND company_id = p_company_id AND status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'numero_indisponivel' USING ERRCODE = 'P0002';
    END IF;
  ELSE
    -- Sem escolha: o primeiro número ativo da empresa (comportamento de sempre).
    SELECT * INTO v_num FROM public.wa_phone_numbers
     WHERE company_id = p_company_id AND status = 'active'
     ORDER BY created_at LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'sem_numero_ativo' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  INSERT INTO public.wa_contacts (company_id, wa_id, profile_name, lead_id)
  VALUES (p_company_id, p_wa_id, nullif(btrim(p_profile_name), ''), p_lead_id)
  ON CONFLICT (company_id, wa_id) DO UPDATE
    SET lead_id = coalesce(public.wa_contacts.lead_id, EXCLUDED.lead_id)
  RETURNING id INTO v_contato;

  INSERT INTO public.wa_conversations (company_id, phone_number_id, contact_id, lead_id)
  VALUES (p_company_id, v_num.id, v_contato, p_lead_id)
  ON CONFLICT (phone_number_id, contact_id) DO UPDATE
    SET lead_id = coalesce(public.wa_conversations.lead_id, EXCLUDED.lead_id)
  RETURNING id INTO v_conversa;

  RETURN v_conversa;
END;
$$;

REVOKE ALL ON FUNCTION public.wa_obter_ou_criar_conversa(uuid, text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_obter_ou_criar_conversa(uuid, text, uuid, text, uuid)
  TO service_role;
