-- Renomeia as etapas para o vocabulário de imobiliária.
--
-- Os nomes atuais vieram de um seed genérico de CRM ("Reunião", "Venda"). Numa
-- imobiliária o que acontece entre qualificar e propor não é uma reunião: é a
-- VISITA ao imóvel ou ao decorado, e é o evento que o corretor agenda, cobra e
-- reagenda. Chamar pelo nome certo é o que faz o corretor reconhecer o próprio
-- processo no board.
--
-- Só troca rótulo: `stage_id` não muda, então os 106 leads continuam exatamente
-- onde estão. Idempotente — casa pelo nome antigo, então rodar de novo não faz
-- nada.
UPDATE public.stages SET name = 'Novo lead'       WHERE name = 'Novo Lead';
UPDATE public.stages SET name = 'Primeiro contato' WHERE name = 'Contato';
UPDATE public.stages SET name = 'Visita agendada'  WHERE name = 'Reunião';
UPDATE public.stages SET name = 'Proposta enviada' WHERE name = 'Proposta';
UPDATE public.stages SET name = 'Venda fechada'    WHERE name = 'Venda';

-- "Qualificado" fica: o termo já é corrente no mercado imobiliário para o lead
-- com renda e intenção confirmadas, e trocá-lo por sinônimo não ganharia nada.
