/**
 * Texto do e-mail de convite para a equipe. Código puro: recebe dados, devolve assunto, HTML e
 * texto simples. O link com o código secreto só existe aqui dentro da mensagem — nada disto é
 * gravado nem registrado em log.
 */
import { ROTULO_DO_PAPEL } from "@/lib/equipe/regras";

export interface DadosDoConvite {
  empresa: string;
  papel: string;
  /** Nome (ou e-mail) de quem convidou. */
  convidadoPor: string;
  link: string;
  expiraEm: string | Date;
}

export const escaparHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const dataBr = (d: string | Date): string =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Sao_Paulo" }).format(
    new Date(d),
  );

/** O link só entra se for https e sem usuário/senha: nunca montamos um href a partir de texto livre. */
export function linkSeguro(link: string): string {
  const u = new URL(link);
  if (u.protocol !== "https:" || u.username || u.password) throw new Error("link de convite inválido");
  return u.toString();
}

export function montarEmailDeConvite(d: DadosDoConvite): { assunto: string; html: string; texto: string } {
  const papel = ROTULO_DO_PAPEL[d.papel as keyof typeof ROTULO_DO_PAPEL] ?? d.papel;
  const link = linkSeguro(d.link);
  const validade = dataBr(d.expiraEm);
  const quem = d.convidadoPor.trim() || "Alguém da equipe";
  const empresa = d.empresa.trim() || "a equipe";

  const assunto = `${quem} convidou você para ${empresa} no ALT Leadflow`.slice(0, 150).replace(/[\r\n]+/g, " ");

  const texto = [
    `Olá!`,
    ``,
    `${quem} convidou você para entrar na equipe de ${empresa} no ALT Leadflow, como ${papel}.`,
    ``,
    `Para aceitar, abra o link abaixo e crie a sua senha:`,
    link,
    ``,
    `O convite vale até ${validade} e só pode ser usado uma vez, com este mesmo e-mail.`,
    `Depois você vai receber um e-mail para confirmar o endereço.`,
    ``,
    `Se você não esperava este convite, ignore esta mensagem: nada acontece sem o seu aceite.`,
  ].join("\n");

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:#f4f5f7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;padding:32px;">
<tr><td>
<p style="margin:0 0 16px;font-size:20px;font-weight:700;">Você foi convidado</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.55;"><b>${escaparHtml(quem)}</b> convidou você para entrar na equipe de <b>${escaparHtml(empresa)}</b> no ALT Leadflow, como <b>${escaparHtml(papel)}</b>.</p>
<p style="margin:24px 0;"><a href="${escaparHtml(link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;">Aceitar convite</a></p>
<p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#4b5563;">O convite vale até <b>${escaparHtml(validade)}</b> e só pode ser usado uma vez, com este mesmo e-mail. Depois você receberá outra mensagem para confirmar o endereço.</p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#4b5563;">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;">${escaparHtml(link)}</span></p>
<p style="margin:16px 0 0;font-size:12px;line-height:1.5;color:#6b7280;">Se você não esperava este convite, ignore esta mensagem: nada acontece sem o seu aceite.</p>
</td></tr></table></td></tr></table></body></html>`;

  return { assunto, html, texto };
}
