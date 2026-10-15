-- Testes da mesclagem. Rodam DENTRO de BEGIN/ROLLBACK (ver rodar.sh).
-- Cada falha é um RAISE EXCEPTION: a transação aborta e nada é gravado.

-- molde: uma linha real, para respeitar colunas e defaults do schema de verdade
CREATE TEMP TABLE _molde AS SELECT * FROM public.leads LIMIT 1;

DO $t$
DECLARE
  v_ant uuid := gen_random_uuid();
  v_rec uuid := gen_random_uuid();
  v_fone_a uuid := gen_random_uuid();
  v_fone_b uuid := gen_random_uuid();
  v_dif uuid := gen_random_uuid();
  v_n int;
  v_emp uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM _molde) THEN
    RAISE EXCEPTION 'ensaio precisa de ao menos um lead na base para servir de molde';
  END IF;
  SELECT company_id INTO v_emp FROM _molde;

  -- 1) mesmo e-mail (caixa e espaço diferentes): o mais ANTIGO ganha
  UPDATE _molde SET id = v_ant, email = '  Ana@Ensaio.invalid ', phone = NULL, name = NULL,
                    created_at = now() - interval '3 days';
  INSERT INTO public.leads SELECT * FROM _molde;
  UPDATE _molde SET id = v_rec, email = 'ana@ensaio.invalid', name = 'Ana',
                    created_at = now() - interval '1 day';
  INSERT INTO public.leads SELECT * FROM _molde;

  -- 2) mesmo telefone escrito de dois jeitos
  UPDATE _molde SET id = v_fone_a, email = NULL, phone = '(11) 99999-0001', name = 'Bia',
                    created_at = now() - interval '2 days';
  INSERT INTO public.leads SELECT * FROM _molde;
  UPDATE _molde SET id = v_fone_b, phone = '+55 11 99999-0001', name = NULL,
                    created_at = now() - interval '1 day';
  INSERT INTO public.leads SELECT * FROM _molde;

  -- 3) a armadilha: mesmo final de número, DDD diferente => pessoas diferentes
  UPDATE _molde SET id = v_dif, phone = '(21) 99999-0001', name = 'Caio',
                    created_at = now();
  INSERT INTO public.leads SELECT * FROM _molde;

  -- relatório não grava nada
  SELECT count(*) INTO v_n FROM public.mesclar_leads_duplicados(false)
   WHERE absorvido_id IN (v_rec, v_fone_b);
  IF v_n <> 2 THEN RAISE EXCEPTION 'T1 relatório: esperava 2 absorvidos, veio %', v_n; END IF;
  IF (SELECT count(*) FROM public.leads WHERE id IN (v_ant, v_rec, v_fone_a, v_fone_b, v_dif)) <> 5 THEN
    RAISE EXCEPTION 'T1 relatório gravou algo';
  END IF;

  -- tabelas dependentes: mesma etiqueta nos dois (unicidade) + uma só do recente
  INSERT INTO public.lead_tags (lead_id, tag_name) VALUES
    (v_ant, 'quente'), (v_rec, 'quente'), (v_rec, 'so-do-recente');
  INSERT INTO public.lead_events (lead_id, d) VALUES (v_rec, 'evento do recente');

  -- aplica
  PERFORM public.mesclar_leads_duplicados(true);

  -- o recente sumiu, o antigo ficou e herdou o nome que lhe faltava
  IF EXISTS (SELECT 1 FROM public.leads WHERE id = v_rec) THEN RAISE EXCEPTION 'T2 recente não foi absorvido'; END IF;
  IF (SELECT name FROM public.leads WHERE id = v_ant) IS DISTINCT FROM 'Ana' THEN
    RAISE EXCEPTION 'T2 vencedor não herdou o nome';
  END IF;
  IF EXISTS (SELECT 1 FROM public.leads WHERE id = v_fone_b) THEN RAISE EXCEPTION 'T3 telefone igual não foi absorvido'; END IF;

  -- a armadilha sobrevive
  IF NOT EXISTS (SELECT 1 FROM public.leads WHERE id = v_dif) THEN
    RAISE EXCEPTION 'T4 lead de outro DDD foi absorvido por engano';
  END IF;

  -- nada se perde: cópia do absorvido guardada, com o vencedor
  IF (SELECT vencedor_id FROM public.leads_mesclados WHERE lead_id = v_rec) IS DISTINCT FROM v_ant THEN
    RAISE EXCEPTION 'T5 sem cópia do absorvido';
  END IF;

  -- etiqueta repetida não duplica nem derruba; a exclusiva do absorvido migra
  IF (SELECT count(*) FROM public.lead_tags WHERE lead_id = v_ant) <> 2 THEN
    RAISE EXCEPTION 'T7 etiquetas: esperava 2 no vencedor, veio %',
      (SELECT count(*) FROM public.lead_tags WHERE lead_id = v_ant);
  END IF;
  IF (SELECT count(*) FROM public.lead_events WHERE lead_id = v_ant AND d = 'evento do recente') <> 1 THEN
    RAISE EXCEPTION 'T7 evento não foi repontado para o vencedor';
  END IF;

  -- idempotente: rodar de novo não acha nada deles
  IF EXISTS (SELECT 1 FROM public.mesclar_leads_duplicados(false) WHERE absorvido_id IN (v_rec, v_fone_b)) THEN
    RAISE EXCEPTION 'T6 não é idempotente';
  END IF;

  RAISE NOTICE 'mesclagem: 7 testes passaram';
END
$t$;
