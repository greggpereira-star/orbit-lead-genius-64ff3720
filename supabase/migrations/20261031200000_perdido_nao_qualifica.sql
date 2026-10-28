-- Lead perdido não conta como qualificado.
--
-- A régua era "etapa com order_index >= corte". "Perdido" fica no fim da ordem,
-- então todo lead perdido passava no corte e entrava em `qualificados` e em
-- `valor_total`, inflando a taxa dos anúncios que mais perdem lead.
--
-- Limite conhecido: a conta olha a etapa ATUAL. Um lead que qualificou e depois
-- foi perdido deixa de contar; separar os dois exigiria o histórico de etapas.
-- Aqui preferimos subcontar a contar lead perdido como qualificado.
--
-- Patch sobre a definição real da função, com asserção: se o trecho esperado não
-- estiver lá, a migration aborta em vez de gravar uma função diferente da prevista.
DO $$
DECLARE
  def text := pg_get_functiondef('public.relatorio_anuncios(uuid,timestamptz)'::regprocedure);
  ancora text := 'st.order_index >= (SELECT corte FROM regua))';
  nova text;
BEGIN
  IF position(ancora in def) = 0 THEN
    RAISE EXCEPTION 'relatorio_anuncios: trecho da régua não encontrado, nada foi alterado';
  END IF;
  IF position('st.kind' in def) > 0 THEN
    RETURN; -- já aplicada
  END IF;
  nova := replace(def, ancora, 'st.order_index >= (SELECT corte FROM regua) AND st.kind <> ''lost'')');
  EXECUTE nova;
END $$;
