-- Quiz que captura só e-mail (ou só telefone) não conseguia criar lead.
--
-- `leads.name` era NOT NULL, resquício de quando todo lead vinha de formulário
-- com nome obrigatório. O quiz manda `name: null` quando não existe bloco de
-- nome, o insert morria com 23502, e o visitante via a tela de obrigado
-- normalmente — a submissão ficava gravada, o lead não nascia, e ninguém
-- descobria. Foi assim que 3 respostas do quiz de estética não viraram lead.
--
-- A aplicação inteira já convive com lead sem nome: `getLeadDisplayName` cai
-- para e-mail, depois telefone, depois "Lead sem nome". A lista, os cards do
-- pipeline e a ficha usam essa função. Quem estava fora do combinado era a
-- coluna.
--
-- Preferimos soltar a coluna a inventar um nome a partir do e-mail: mostrar
-- "qa-fluxo" como se fosse o nome da pessoa é pior que mostrar o e-mail.

ALTER TABLE public.leads ALTER COLUMN name DROP NOT NULL;
