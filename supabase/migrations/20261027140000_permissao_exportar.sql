-- Permissão "exportar dados (CSV)".
--
-- Dono e administrador sempre exportam; o atendente (`member`) só se a empresa
-- liberar (padrão FALSO); o visualizador nunca.
--
-- Atenção ao que isto é: a exportação de conversa do WhatsApp passa por servidor
-- e é barrada de verdade. As de leads, formulários e quiz montam o arquivo no
-- navegador a partir de dados que todo membro já pode ler — ali a permissão tira
-- o botão e fecha o caminho fácil, mas não é uma barreira contra quem consulta o
-- banco por conta própria.
ALTER TABLE public.company_permissoes
  ADD COLUMN IF NOT EXISTS membros_exportam boolean NOT NULL DEFAULT false;
