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

-- ===========================================================================
-- Fase 4: automação
-- ===========================================================================
DO $t$
DECLARE
  v_emp uuid; v_conv uuid; v_regra uuid; v_regra2 uuid; v_n int; v_lead uuid;
  v_payload jsonb; v_r record; v_conv2 uuid;
BEGIN
  IF to_regclass('public.automation_rules') IS NULL OR to_regprocedure('public.wa_obter_ou_criar_conversa(uuid,text,uuid,text)') IS NULL THEN
    RAISE NOTICE 'fase 4 ausente (motor ou migração): pulando';
    RETURN;
  END IF;
  SELECT id INTO v_emp FROM public.companies LIMIT 1;
  SELECT id INTO v_lead FROM public.leads WHERE company_id = v_emp LIMIT 1;
  IF v_lead IS NULL THEN
    -- base sem lead nenhum: cria um descartável (a transação é desfeita)
    INSERT INTO public.leads (company_id) VALUES (v_emp) RETURNING id INTO v_lead;
  END IF;

  -- T30: o vocabulário aceita o evento e as ações novas
  INSERT INTO public.automation_rules (company_id, name, trigger_event, conditions)
    VALUES (v_emp, 'Primeira mensagem', 'whatsapp_message_received',
            '[{"campo":"primeira_mensagem","operador":"igual","valor":"true"}]'::jsonb)
    RETURNING id INTO v_regra;
  INSERT INTO public.automation_actions (rule_id, company_id, action_type, config, sort_order)
    VALUES (v_regra, v_emp, 'enviar_template', '{"template":"boas_vindas"}'::jsonb, 0),
           (v_regra, v_emp, 'atribuir_conversa', '{}'::jsonb, 1);

  -- e continua recusando o que não existe
  BEGIN
    INSERT INTO public.automation_actions (rule_id, company_id, action_type) VALUES (v_regra, v_emp, 'enviar_email');
    RAISE EXCEPTION 'T30 aceitou ação inexistente';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- regra por palavra-chave
  INSERT INTO public.automation_rules (company_id, name, trigger_event, conditions)
    VALUES (v_emp, 'Pediu orçamento', 'whatsapp_message_received',
            '[{"campo":"texto","operador":"contem","valor":"orçamento"}]'::jsonb)
    RETURNING id INTO v_regra2;
  INSERT INTO public.automation_actions (rule_id, company_id, action_type, config)
    VALUES (v_regra2, v_emp, 'atribuir_conversa', '{}'::jsonb);

  -- T31: mensagem do cliente enfileira só as regras cujas condições passam
  PERFORM public.wa_registrar_mensagem('PNID_ENSAIO','5527911110001','Duda','inbound','customer',
    'wamid.AUT1','text','Olá, tudo bem?','{}'::jsonb, now(), NULL);
  SELECT count(*) INTO v_n FROM public.automation_jobs WHERE trigger_event = 'whatsapp_message_received';
  IF v_n <> 1 THEN RAISE EXCEPTION 'T31 esperava 1 job (primeira mensagem), veio %', v_n; END IF;

  -- T32: o payload leva a conversa, o texto e a primeira mensagem
  SELECT payload INTO v_payload FROM public.automation_jobs
   WHERE trigger_event = 'whatsapp_message_received' ORDER BY created_at LIMIT 1;
  IF v_payload ->> 'primeira_mensagem' <> 'true' OR v_payload ->> 'texto' <> 'Olá, tudo bem?'
     OR v_payload ->> 'conversation_id' IS NULL OR v_payload ->> 'wa_id' <> '5527911110001' THEN
    RAISE EXCEPTION 'T32 payload incompleto: %', v_payload; END IF;

  -- T33: a segunda mensagem NÃO é "primeira"; a palavra-chave dispara a outra regra
  PERFORM public.wa_registrar_mensagem('PNID_ENSAIO','5527911110001','Duda','inbound','customer',
    'wamid.AUT2','text','Quero um orçamento','{}'::jsonb, now(), NULL);
  SELECT count(*) INTO v_n FROM public.automation_jobs j
   WHERE j.rule_id = v_regra2;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T33 regra por palavra-chave: % jobs', v_n; END IF;
  SELECT count(*) INTO v_n FROM public.automation_jobs j WHERE j.rule_id = v_regra;
  IF v_n <> 1 THEN RAISE EXCEPTION 'T33 primeira-mensagem disparou de novo: % jobs', v_n; END IF;

  -- T34: REENTREGA do mesmo wamid não enfileira de novo
  PERFORM public.wa_registrar_mensagem('PNID_ENSAIO','5527911110001','Duda','inbound','customer',
    'wamid.AUT2','text','Quero um orçamento','{}'::jsonb, now(), NULL);
  SELECT count(*) INTO v_n FROM public.automation_jobs WHERE trigger_event = 'whatsapp_message_received';
  IF v_n <> 2 THEN RAISE EXCEPTION 'T34 reentrega enfileirou: % jobs', v_n; END IF;

  -- T35: eco do app e histórico NÃO disparam automação
  PERFORM public.wa_registrar_mensagem('PNID_ENSAIO','5527911110001',NULL,'outbound','app_echo',
    'wamid.AUT3','text','orçamento enviado','{}'::jsonb, now(), NULL);
  PERFORM public.wa_registrar_mensagem('PNID_ENSAIO','5527911110001',NULL,'inbound','history',
    'wamid.AUT4','text','orçamento antigo','{}'::jsonb, now() - interval '30 days', NULL, 'received');
  SELECT count(*) INTO v_n FROM public.automation_jobs WHERE trigger_event = 'whatsapp_message_received';
  IF v_n <> 2 THEN RAISE EXCEPTION 'T35 eco/histórico dispararam: % jobs', v_n; END IF;

  -- T36: conversa garantida para quem nunca escreveu (lead de formulário)
  v_conv := public.wa_obter_ou_criar_conversa(v_emp, '5527922220002', v_lead, 'Lead do Form');
  IF v_conv IS NULL THEN RAISE EXCEPTION 'T36 sem conversa'; END IF;
  -- idempotente: a segunda chamada devolve a MESMA conversa
  v_conv2 := public.wa_obter_ou_criar_conversa(v_emp, '5527922220002', NULL, NULL);
  IF v_conv2 <> v_conv THEN RAISE EXCEPTION 'T36 criou conversa duplicada'; END IF;
  -- e não abre a janela de 24h (nenhuma mensagem do cliente)
  IF (SELECT last_inbound_at FROM public.wa_conversations WHERE id = v_conv) IS NOT NULL THEN
    RAISE EXCEPTION 'T36 abriu a janela sem mensagem do cliente'; END IF;
  -- o vínculo com o lead fica
  IF (SELECT lead_id FROM public.wa_conversations WHERE id = v_conv) IS DISTINCT FROM v_lead THEN
    RAISE EXCEPTION 'T36 lead não vinculado'; END IF;

  -- T37: sem número ativo é erro identificável
  UPDATE public.wa_phone_numbers SET status = 'disconnected' WHERE phone_number_id = 'PNID_ENSAIO';
  BEGIN
    PERFORM public.wa_obter_ou_criar_conversa(v_emp, '5527933330003', NULL, NULL);
    RAISE EXCEPTION 'T37 aceitou empresa sem número ativo';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL; END;

  RAISE NOTICE 'wa_fase4: 8 testes passaram';
END
$t$;
