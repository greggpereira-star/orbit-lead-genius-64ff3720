-- ===========================================================================
-- WhatsApp: número "apenas receptivo"
-- ===========================================================================
-- Com a opção ligada o número só responde a quem escreveu: não envia mensagem
-- ATIVA (template, que é o que abre conversa fora da janela de 24h) e não é
-- usado por automações/campanhas. Resposta livre do atendente DENTRO da janela
-- continua valendo.
--
-- A regra é aplicada no servidor, no mesmo ponto das demais políticas de envio.
ALTER TABLE public.wa_phone_numbers
  ADD COLUMN IF NOT EXISTS receive_only boolean NOT NULL DEFAULT false;
