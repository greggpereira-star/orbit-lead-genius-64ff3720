-- Testes da migração de deduplicação de lead.
--
-- NÃO rodar sozinho: este arquivo pressupõe que a migração já foi aplicada na
-- MESMA transação. Use o `rodar.sh` ao lado, que junta os dois entre BEGIN e
-- ROLLBACK — nada do que acontece aqui fica gravado.
--
-- Usa um quiz PUBLICADO de verdade como apoio, porque `quiz_capture_lead` só
-- trabalha com quiz publicado. Os leads criados pelo ensaio usam e-mails em
-- `@ensaio.invalid`, um domínio que por norma não existe, e somem no ROLLBACK.

DO $ensaio$
DECLARE
  v_quiz uuid;
  v_empresa uuid;
  v_leads_antes bigint;
  v_leads_depois bigint;
  a uuid; b uuid; c uuid; d uuid; e uuid; f uuid;
  v_nome text;
  v_erros int := 0;
BEGIN
  SELECT id, company_id INTO v_quiz, v_empresa
    FROM quiz_funnels WHERE status = 'published' LIMIT 1;

  IF v_quiz IS NULL THEN
    RAISE EXCEPTION 'O ensaio precisa de pelo menos um quiz PUBLICADO para rodar.';
  END IF;

  SELECT count(*) INTO v_leads_antes FROM leads;
  RAISE NOTICE '--- ensaio começando. quiz %, leads na base: % ---', v_quiz, v_leads_antes;

  ----------------------------------------------------------------------------
  -- 1. O que já funcionava precisa continuar funcionando.
  ----------------------------------------------------------------------------
  a := quiz_capture_lead(v_quiz, 'ensaio-sessao-1', 'ana@ensaio.invalid', '11999990001', 'Ana');
  b := quiz_capture_lead(v_quiz, 'ensaio-sessao-1', 'ana@ensaio.invalid', '11999990001', 'Ana');

  IF a IS NULL THEN
    RAISE EXCEPTION 'FALHOU 1: a captura não criou lead nenhum.';
  END IF;
  IF a IS DISTINCT FROM b THEN
    RAISE WARNING 'FALHOU 1: a MESMA sessão criou dois leads (% e %).', a, b;
    v_erros := v_erros + 1;
  ELSE
    RAISE NOTICE 'ok 1 — mesma sessão continua sendo um lead só';
  END IF;

  ----------------------------------------------------------------------------
  -- 2. O conserto: sessão nova, mesmo e-mail (com outra caixa) → mesmo lead.
  --    Era aqui que nascia a duplicata.
  ----------------------------------------------------------------------------
  c := quiz_capture_lead(v_quiz, 'ensaio-sessao-2', 'ANA@Ensaio.Invalid', NULL, NULL);
  IF c IS DISTINCT FROM a THEN
    RAISE WARNING 'FALHOU 2: o mesmo e-mail em outra sessão criou lead novo.';
    v_erros := v_erros + 1;
  ELSE
    RAISE NOTICE 'ok 2 — mesmo e-mail, sessão nova: continua o mesmo lead';
  END IF;

  ----------------------------------------------------------------------------
  -- 3. Telefone escrito de outro jeito também é a mesma pessoa.
  ----------------------------------------------------------------------------
  d := quiz_capture_lead(v_quiz, 'ensaio-sessao-3', NULL, '+55 (11) 99999-0001', NULL);
  IF d IS DISTINCT FROM a THEN
    RAISE WARNING 'FALHOU 3: "+55 (11) 99999-0001" não casou com "11999990001".';
    v_erros := v_erros + 1;
  ELSE
    RAISE NOTICE 'ok 3 — telefone em outro formato: continua o mesmo lead';
  END IF;

  ----------------------------------------------------------------------------
  -- 4. A ARMADILHA. Mesmo número com DDD diferente é outra pessoa.
  --    Se a regra fosse "últimos 10 dígitos", isto juntaria São Paulo com Rio.
  --    Juntar duas pessoas perde o contato de uma e não tem desfazer.
  ----------------------------------------------------------------------------
  e := quiz_capture_lead(v_quiz, 'ensaio-sessao-4', NULL, '21 99999-0001', 'Pessoa do Rio');
  IF e = a THEN
    RAISE WARNING 'FALHOU 4: juntou (11) com (21) — pessoas DIFERENTES viraram um lead.';
    v_erros := v_erros + 1;
  ELSE
    RAISE NOTICE 'ok 4 — DDD diferente continua sendo outra pessoa';
  END IF;

  ----------------------------------------------------------------------------
  -- 5. Quem é realmente novo continua entrando.
  ----------------------------------------------------------------------------
  f := quiz_capture_lead(v_quiz, 'ensaio-sessao-5', 'bruno@ensaio.invalid', '11988887777', 'Bruno');
  IF f IS NULL OR f = a THEN
    RAISE WARNING 'FALHOU 5: pessoa nova não virou lead novo.';
    v_erros := v_erros + 1;
  ELSE
    RAISE NOTICE 'ok 5 — pessoa nova entra normalmente';
  END IF;

  ----------------------------------------------------------------------------
  -- 6. Normalização do telefone, caso a caso.
  ----------------------------------------------------------------------------
  IF normalizar_telefone_br('+55 11 3333-4444') IS DISTINCT FROM normalizar_telefone_br('(11) 3333-4444') THEN
    RAISE WARNING 'FALHOU 6a: fixo com código de país não bate com o mesmo fixo sem ele.';
    v_erros := v_erros + 1;
  ELSIF normalizar_telefone_br('11999998888') = normalizar_telefone_br('21999998888') THEN
    RAISE WARNING 'FALHOU 6b: DDD 11 e DDD 21 deram o mesmo resultado.';
    v_erros := v_erros + 1;
  ELSIF normalizar_telefone_br('99998888') IS NOT NULL THEN
    RAISE WARNING 'FALHOU 6c: número incompleto deveria devolver NULL.';
    v_erros := v_erros + 1;
  ELSE
    RAISE NOTICE 'ok 6 — normalização do telefone consistente';
  END IF;

  ----------------------------------------------------------------------------
  -- 7. Contagem: as cinco sessões acima devem ter gerado 3 leads, não 5.
  --    (Ana, a pessoa do Rio e o Bruno.)
  ----------------------------------------------------------------------------
  SELECT count(*) INTO v_leads_depois FROM leads;
  IF v_leads_depois - v_leads_antes <> 3 THEN
    RAISE WARNING 'FALHOU 7: esperava 3 leads novos, vieram %.', v_leads_depois - v_leads_antes;
    v_erros := v_erros + 1;
  ELSE
    RAISE NOTICE 'ok 7 — 5 submissões viraram 3 leads (era isso que faltava)';
  END IF;

  ----------------------------------------------------------------------------
  -- 8. O nome já gravado não pode ser trocado pela submissão seguinte.
  --
  -- Quem corrige nome à mão no CRM está consertando o que o visitante digitou
  -- errado. Deixar a próxima resposta vencer anularia esse trabalho — e sem
  -- aviso, o que é pior: ninguém vai conferir se o nome continua certo.
  ----------------------------------------------------------------------------
  PERFORM quiz_capture_lead(v_quiz, 'ensaio-sessao-6', 'ana@ensaio.invalid', NULL, 'ANA (digitado torto)');
  SELECT name INTO v_nome FROM leads WHERE id = a;
  IF v_nome IS DISTINCT FROM 'Ana' THEN
    RAISE WARNING 'FALHOU 8: o nome gravado era "Ana" e virou "%".', v_nome;
    v_erros := v_erros + 1;
  ELSE
    RAISE NOTICE 'ok 8 — nome já gravado resistiu à submissão seguinte';
  END IF;

  ----------------------------------------------------------------------------
  -- 9. Mas lead SEM nome continua recebendo o nome que chegar. É o caso da
  --    captura antecipada: o e-mail entra antes de existir nome.
  ----------------------------------------------------------------------------
  PERFORM quiz_capture_lead(v_quiz, 'ensaio-sessao-7', 'carla@ensaio.invalid', NULL, NULL);
  PERFORM quiz_capture_lead(v_quiz, 'ensaio-sessao-7', 'carla@ensaio.invalid', NULL, 'Carla');
  SELECT name INTO v_nome FROM leads WHERE email = 'carla@ensaio.invalid';
  IF v_nome IS DISTINCT FROM 'Carla' THEN
    RAISE WARNING 'FALHOU 9: lead sem nome deveria receber "Carla", ficou "%".', coalesce(v_nome, '(vazio)');
    v_erros := v_erros + 1;
  ELSE
    RAISE NOTICE 'ok 9 — lead sem nome continua sendo preenchido';
  END IF;

  ----------------------------------------------------------------------------
  RAISE NOTICE '--- fim do ensaio: % falha(s) ---', v_erros;
  IF v_erros > 0 THEN
    RAISE EXCEPTION 'Ensaio reprovou em % ponto(s). NÃO aplique a migração em produção.', v_erros;
  END IF;
  RAISE NOTICE 'ENSAIO PASSOU. Nada foi gravado: a transação será desfeita.';
END
$ensaio$;
