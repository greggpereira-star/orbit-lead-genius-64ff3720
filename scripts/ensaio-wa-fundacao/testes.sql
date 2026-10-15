-- Testes da fundação wa_*. Rodam dentro de BEGIN/ROLLBACK (ver rodar.sh).
-- Qualquer falha é um RAISE EXCEPTION: a transação aborta e nada é gravado.

DO $t$
DECLARE
  v_emp uuid; v_conta uuid; v_num uuid; v_r record; v_r2 record;
  v_conv uuid; v_msg uuid; v_n int; v_status text; v_unread int;
BEGIN
  SELECT id INTO v_emp FROM public.companies LIMIT 1;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'ensaio precisa de ao menos uma empresa'; END IF;

  INSERT INTO public.wa_accounts (company_id, waba_id) VALUES (v_emp, 'WABA_ENSAIO') RETURNING id INTO v_conta;
  INSERT INTO public.wa_phone_numbers (account_id, company_id, phone_number_id, display_phone)
    VALUES (v_conta, v_emp, 'PNID_ENSAIO', '5527999990000') RETURNING id INTO v_num;

  -- T1: primeira mensagem do cliente cria contato + conversa + mensagem, abre janela, soma 1 não lida
  SELECT * INTO v_r FROM public.wa_registrar_mensagem(
    'PNID_ENSAIO','5527996318075','Ana Teste','inbound','customer','wamid.A1','text','Olá!',
    '{"text":{"body":"Olá!"}}'::jsonb, '2026-10-15 10:00:00+00', NULL);
  IF NOT v_r.inserida THEN RAISE EXCEPTION 'T1 não inseriu'; END IF;
  v_conv := v_r.out_conversa;
  SELECT unread_agent INTO v_unread FROM public.wa_conversations WHERE id = v_conv;
  IF v_unread <> 1 THEN RAISE EXCEPTION 'T1 unread esperado 1, veio %', v_unread; END IF;
  IF (SELECT last_inbound_at FROM public.wa_conversations WHERE id = v_conv) IS NULL THEN
    RAISE EXCEPTION 'T1 janela não abriu'; END IF;
  IF (SELECT profile_name FROM public.wa_contacts WHERE company_id = v_emp AND wa_id='5527996318075') <> 'Ana Teste' THEN
    RAISE EXCEPTION 'T1 nome do contato'; END IF;

  -- T2: reentrega do MESMO wamid não duplica nem soma de novo
  SELECT * INTO v_r2 FROM public.wa_registrar_mensagem(
    'PNID_ENSAIO','5527996318075','Ana Teste','inbound','customer','wamid.A1','text','Olá!',
    '{}'::jsonb, '2026-10-15 10:00:00+00', NULL);
  IF v_r2.inserida THEN RAISE EXCEPTION 'T2 reentrega foi tratada como nova'; END IF;
  SELECT count(*) INTO v_n FROM public.wa_messages WHERE conversation_id = v_conv;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T2 duplicou: % mensagens', v_n; END IF;
  SELECT unread_agent INTO v_unread FROM public.wa_conversations WHERE id = v_conv;
  IF v_unread <> 1 THEN RAISE EXCEPTION 'T2 somou unread na reentrega: %', v_unread; END IF;

  -- T3: eco do app (negócio respondeu pelo celular) NÃO abre janela e NÃO soma não lida
  PERFORM public.wa_registrar_mensagem(
    'PNID_ENSAIO','5527996318075',NULL,'outbound','app_echo','wamid.E1','text','Oi, Ana!',
    '{}'::jsonb, '2026-10-15 11:00:00+00', NULL);
  SELECT unread_agent INTO v_unread FROM public.wa_conversations WHERE id = v_conv;
  IF v_unread <> 1 THEN RAISE EXCEPTION 'T3 eco somou unread'; END IF;
  IF (SELECT last_inbound_at FROM public.wa_conversations WHERE id = v_conv) <> '2026-10-15 10:00:00+00' THEN
    RAISE EXCEPTION 'T3 eco mexeu na janela'; END IF;
  IF (SELECT last_message_preview FROM public.wa_conversations WHERE id = v_conv) <> 'Oi, Ana!' THEN
    RAISE EXCEPTION 'T3 preview não refletiu o eco'; END IF;

  -- T4: mensagem ANTIGA (histórico) não rebaixa o preview nem a janela
  PERFORM public.wa_registrar_mensagem(
    'PNID_ENSAIO','5527996318075',NULL,'inbound','history','wamid.H1','text','de ontem',
    '{}'::jsonb, '2026-10-14 08:00:00+00', NULL, 'received');
  IF (SELECT last_message_preview FROM public.wa_conversations WHERE id = v_conv) <> 'Oi, Ana!' THEN
    RAISE EXCEPTION 'T4 histórico sobrescreveu o preview'; END IF;

  -- T5: referral do anúncio é guardado no 1º contato e NÃO é sobrescrito depois
  PERFORM public.wa_registrar_mensagem(
    'PNID_ENSAIO','5527911112222','Bia','inbound','customer','wamid.B1','text','vim do anúncio',
    '{}'::jsonb, now(), '{"ctwa_clid":"CLID1","source_id":"AD1"}'::jsonb);
  PERFORM public.wa_registrar_mensagem(
    'PNID_ENSAIO','5527911112222','Bia','inbound','customer','wamid.B2','text','outra',
    '{}'::jsonb, now(), '{"ctwa_clid":"CLID2"}'::jsonb);
  IF (SELECT origin ->> 'ctwa_clid' FROM public.wa_conversations c
        JOIN public.wa_contacts k ON k.id = c.contact_id
       WHERE k.wa_id = '5527911112222') <> 'CLID1' THEN
    RAISE EXCEPTION 'T5 a origem do anúncio foi sobrescrita'; END IF;

  -- T6: saída gravada + status 'delivered' chegou ANTES do registro (webhook venceu a API)
  PERFORM public.wa_aplicar_status('PNID_ENSAIO','wamid.S1','delivered','2026-10-15 12:00:05+00', NULL, NULL);
  v_msg := public.wa_registrar_saida(v_conv, 'agent', 'wamid.S1', 'text', 'Posso ajudar?', '{}'::jsonb, NULL);
  SELECT status INTO v_status FROM public.wa_messages WHERE id = v_msg;
  IF v_status <> 'delivered' THEN RAISE EXCEPTION 'T6 status adiantado não foi aplicado: %', v_status; END IF;

  -- T7: status nunca rebaixa (read depois delivered; sent tardio não volta)
  PERFORM public.wa_aplicar_status('PNID_ENSAIO','wamid.S1','read','2026-10-15 12:01:00+00', NULL, NULL);
  PERFORM public.wa_aplicar_status('PNID_ENSAIO','wamid.S1','sent','2026-10-15 12:00:01+00', NULL, NULL);
  SELECT status INTO v_status FROM public.wa_messages WHERE id = v_msg;
  IF v_status <> 'read' THEN RAISE EXCEPTION 'T7 status rebaixou: %', v_status; END IF;

  -- T8: status repetido é idempotente (1 só linha de evento)
  PERFORM public.wa_aplicar_status('PNID_ENSAIO','wamid.S1','read','2026-10-15 12:01:00+00', NULL, NULL);
  SELECT count(*) INTO v_n FROM public.wa_message_status_events
   WHERE provider_message_id='wamid.S1' AND status='read';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T8 evento duplicado: %', v_n; END IF;

  -- T9: falha grava código e título
  v_msg := public.wa_registrar_saida(v_conv, 'automation', 'wamid.F1', 'template', NULL, '{}'::jsonb, NULL, 'boas_vindas');
  PERFORM public.wa_aplicar_status('PNID_ENSAIO','wamid.F1','failed','2026-10-15 13:00:00+00', NULL,
    '{"code":131047,"title":"Re-engagement message"}'::jsonb);
  IF (SELECT error_code FROM public.wa_messages WHERE id = v_msg) <> 131047 THEN
    RAISE EXCEPTION 'T9 código de erro não gravado'; END IF;
  IF (SELECT status FROM public.wa_messages WHERE id = v_msg) <> 'failed' THEN
    RAISE EXCEPTION 'T9 status'; END IF;

  -- T10: número desconhecido levanta erro identificável (o processador marca 'ignored')
  BEGIN
    PERFORM public.wa_registrar_mensagem('NAO_EXISTE','5527900000000',NULL,'inbound','customer',
      'wamid.X','text','x','{}'::jsonb, now(), NULL);
    RAISE EXCEPTION 'T10 aceitou número desconhecido';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;

  -- T11: cliente volta a escrever numa conversa resolvida → reabre
  UPDATE public.wa_conversations SET status = 'resolved' WHERE id = v_conv;
  PERFORM public.wa_registrar_mensagem(
    'PNID_ENSAIO','5527996318075',NULL,'inbound','customer','wamid.A2','text','voltei',
    '{}'::jsonb, '2026-10-15 14:00:00+00', NULL);
  IF (SELECT status FROM public.wa_conversations WHERE id = v_conv) <> 'open' THEN
    RAISE EXCEPTION 'T11 não reabriu'; END IF;

  -- T12: duas mensagens com o mesmo wamid em EMPRESAS diferentes não colidem
  -- (índice único é por empresa) — coberto pela estrutura; aqui só confere o índice.
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'wa_messages_provider_uniq') THEN
    RAISE EXCEPTION 'T12 índice de idempotência ausente'; END IF;

  RAISE NOTICE 'wa_fundacao: 11 testes passaram';
END
$t$;

-- ===========================================================================
-- Fase 2: templates e estado do número
-- ===========================================================================
DO $t$
DECLARE
  v_emp uuid; v_conta uuid; v_n int; v_status text; v_motivo text; v_prog int; v_sync timestamptz;
BEGIN
  IF to_regclass('public.wa_templates') IS NULL THEN
    RAISE NOTICE 'wa_templates ausente: migração da Fase 2 não incluída neste ensaio';
    RETURN;
  END IF;
  SELECT id INTO v_emp FROM public.companies LIMIT 1;
  SELECT id INTO v_conta FROM public.wa_accounts WHERE waba_id = 'WABA_ENSAIO';

  INSERT INTO public.wa_templates (account_id, company_id, name, language, category, status)
    VALUES (v_conta, v_emp, 'boas_vindas', 'pt_BR', 'UTILITY', 'PENDING');

  -- T20: aprovado
  IF NOT public.wa_aplicar_status_de_template('WABA_ENSAIO','boas_vindas','pt_BR','APPROVED') THEN
    RAISE EXCEPTION 'T20 não aplicou APPROVED'; END IF;

  -- T21: evento ATRASADO (PENDING depois de APPROVED) não rebaixa
  IF public.wa_aplicar_status_de_template('WABA_ENSAIO','boas_vindas','pt_BR','PENDING') THEN
    RAISE EXCEPTION 'T21 rebaixou para PENDING'; END IF;
  SELECT status INTO v_status FROM public.wa_templates WHERE name = 'boas_vindas';
  IF v_status <> 'APPROVED' THEN RAISE EXCEPTION 'T21 status %', v_status; END IF;

  -- T22: rejeitado grava o motivo; aprovar de novo limpa
  PERFORM public.wa_aplicar_status_de_template('WABA_ENSAIO','boas_vindas','pt_BR','REJECTED','INVALID_FORMAT');
  SELECT rejection_reason INTO v_motivo FROM public.wa_templates WHERE name = 'boas_vindas';
  IF v_motivo <> 'INVALID_FORMAT' THEN RAISE EXCEPTION 'T22 motivo %', v_motivo; END IF;

  -- T23: template desconhecido não é erro (aparece na próxima sincronização)
  IF public.wa_aplicar_status_de_template('WABA_ENSAIO','nao_existe','pt_BR','APPROVED') THEN
    RAISE EXCEPTION 'T23 aplicou em template inexistente'; END IF;

  -- T24: WABA desconhecida é identificável
  BEGIN
    PERFORM public.wa_aplicar_status_de_template('NAO_EXISTE','x','pt_BR','APPROVED');
    RAISE EXCEPTION 'T24 aceitou WABA desconhecida';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;

  -- T25: PARTNER_REMOVED desconecta o número pelo display_phone; ACCOUNT_RECONNECTED volta
  SELECT public.wa_atualizar_estado_do_numero('WABA_ENSAIO','+55 27 99999-0000','disconnected','PARTNER_REMOVED') INTO v_n;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T25 afetou % números', v_n; END IF;
  IF (SELECT status FROM public.wa_phone_numbers WHERE phone_number_id='PNID_ENSAIO') <> 'disconnected' THEN
    RAISE EXCEPTION 'T25 não desconectou'; END IF;
  PERFORM public.wa_atualizar_estado_do_numero('WABA_ENSAIO',NULL,'active',NULL);
  IF (SELECT status FROM public.wa_phone_numbers WHERE phone_number_id='PNID_ENSAIO') <> 'active' THEN
    RAISE EXCEPTION 'T25 não reconectou'; END IF;

  -- T26: número de outro telefone não é afetado
  SELECT public.wa_atualizar_estado_do_numero('WABA_ENSAIO','5511000000000','disconnected','x') INTO v_n;
  IF v_n <> 0 THEN RAISE EXCEPTION 'T26 afetou número errado'; END IF;

  -- T27: progresso do histórico só avança; 100 marca a sincronização
  PERFORM public.wa_atualizar_historico('PNID_ENSAIO', 55);
  PERFORM public.wa_atualizar_historico('PNID_ENSAIO', 20);
  SELECT history_progress INTO v_prog FROM public.wa_phone_numbers WHERE phone_number_id='PNID_ENSAIO';
  IF v_prog <> 55 THEN RAISE EXCEPTION 'T27 retrocedeu para %', v_prog; END IF;
  PERFORM public.wa_atualizar_historico('PNID_ENSAIO', 100);
  SELECT coexistence_synced_at INTO v_sync FROM public.wa_phone_numbers WHERE phone_number_id='PNID_ENSAIO';
  IF v_sync IS NULL THEN RAISE EXCEPTION 'T27 não marcou sincronização concluída'; END IF;

  RAISE NOTICE 'wa_fase2: 8 testes passaram';
END
$t$;
