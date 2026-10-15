/**
 * Interpreta o corpo de um webhook da WhatsApp Cloud API em EVENTOS planos.
 *
 * Um POST traz vários `entry[].changes[]`, cada um com várias mensagens/status.
 * Aqui tudo vira uma lista de eventos independentes, cada um com sua chave de
 * deduplicação — assim reentrega e reprocessamento acontecem por evento, não por
 * requisição. Pura e tolerante: campo ausente nunca lança.
 *
 * Fontes dos formatos: documentação oficial da Meta e o repositório de
 * referência (WEBHOOKS.md, COEXISTENCE.md).
 */

export interface Referral {
  ctwa_clid?: string;
  source_id?: string;
  source_type?: string;
  source_url?: string;
  headline?: string;
  body?: string;
  media_type?: string;
  [k: string]: unknown;
}

export type EventoWa =
  | {
      kind: "message";
      dedupKey: string;
      phoneNumberId: string;
      waId: string;
      profileName: string | null;
      wamid: string;
      type: string;
      body: string | null;
      payload: Record<string, unknown>;
      ts: string;
      referral: Referral | null;
      /** `wamid` da mensagem citada, quando é uma resposta. */
      replyToWamid: string | null;
    }
  | {
      kind: "echo";
      dedupKey: string;
      phoneNumberId: string;
      waId: string;
      wamid: string;
      type: string;
      body: string | null;
      payload: Record<string, unknown>;
      ts: string;
    }
  | {
      kind: "status";
      dedupKey: string;
      phoneNumberId: string;
      wamid: string;
      status: "sent" | "delivered" | "read" | "failed";
      ts: string;
      pricing: Record<string, unknown> | null;
      error: { code: number | null; title: string | null; details: string | null } | null;
    }
  | {
      kind: "history_message";
      dedupKey: string;
      phoneNumberId: string;
      waId: string;
      wamid: string;
      /** `true` quando quem escreveu foi o negócio. */
      doNegocio: boolean;
      type: string;
      body: string | null;
      payload: Record<string, unknown>;
      ts: string;
    }
  | {
      kind: "template_status";
      dedupKey: string;
      wabaId: string;
      name: string;
      language: string;
      status: string;
      reason: string | null;
      providerTemplateId: string | null;
    }
  | {
      kind: "conta";
      dedupKey: string;
      wabaId: string;
      /** PARTNER_REMOVED | ACCOUNT_OFFBOARDED | ACCOUNT_RECONNECTED | outro. */
      evento: string;
      displayPhone: string | null;
      motivo: string | null;
    }
  | {
      kind: "historico_progresso";
      dedupKey: string;
      phoneNumberId: string;
      progress: number;
      phase: number | null;
    }
  | {
      kind: "ignorado";
      dedupKey: string;
      phoneNumberId: string | null;
      field: string;
      payload: unknown;
    };

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const txt = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Unix (segundos, como string) → ISO. Inválido → agora (nunca lança). */
export function tsParaIso(v: unknown): string {
  const n = typeof v === "number" ? v : Number(typeof v === "string" ? v : NaN);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(n * 1000).toISOString();
}

/** O texto que a conversa mostra para cada tipo de mensagem. */
export function corpoDaMensagem(m: Record<string, unknown>): string | null {
  const tipo = String(m.type ?? "");
  switch (tipo) {
    case "text":
      return txt(obj(m.text).body);
    case "image":
    case "video":
    case "document":
      return txt(obj(m[tipo]).caption);
    case "button":
      return txt(obj(m.button).text);
    case "interactive": {
      const i = obj(m.interactive);
      return txt(obj(i.button_reply).title) ?? txt(obj(i.list_reply).title);
    }
    case "reaction":
      return txt(obj(m.reaction).emoji);
    case "location": {
      const l = obj(m.location);
      return txt(l.name) ?? txt(l.address);
    }
    default:
      return null;
  }
}

export function extrairEventos(corpo: unknown): EventoWa[] {
  const eventos: EventoWa[] = [];
  const raiz = obj(corpo);
  if (raiz.object !== "whatsapp_business_account") return eventos;

  for (const entrada of lista(raiz.entry)) {
    for (const mudanca of lista(obj(entrada).changes)) {
      const campo = String(obj(mudanca).field ?? "");
      const valor = obj(obj(mudanca).value);
      const phoneNumberId = txt(obj(valor.metadata).phone_number_id);

      if (campo === "messages") {
        const nomes = new Map<string, string>();
        for (const c of lista(valor.contacts)) {
          const co = obj(c);
          const wa = txt(co.wa_id);
          const nome = txt(obj(co.profile).name);
          if (wa && nome) nomes.set(wa, nome);
        }

        for (const mm of lista(valor.messages)) {
          const m = obj(mm);
          const wamid = txt(m.id);
          const de = txt(m.from);
          if (!wamid || !de || !phoneNumberId) continue;
          const ref = obj(m.referral);
          eventos.push({
            kind: "message",
            dedupKey: `msg:${wamid}`,
            phoneNumberId,
            waId: de,
            profileName: nomes.get(de) ?? null,
            wamid,
            type: String(m.type ?? "unknown"),
            body: corpoDaMensagem(m),
            payload: m,
            ts: tsParaIso(m.timestamp),
            referral: Object.keys(ref).length ? (ref as Referral) : null,
            replyToWamid: txt(obj(m.context).id),
          });
        }

        for (const ss of lista(valor.statuses)) {
          const s = obj(ss);
          const wamid = txt(s.id);
          const st = String(s.status ?? "");
          if (!wamid || !phoneNumberId) continue;
          if (!["sent", "delivered", "read", "failed"].includes(st)) continue;
          const erro = lista(s.errors)[0];
          const ts = tsParaIso(s.timestamp);
          eventos.push({
            kind: "status",
            dedupKey: `st:${wamid}:${st}:${ts}`,
            phoneNumberId,
            wamid,
            status: st as "sent" | "delivered" | "read" | "failed",
            ts,
            pricing: Object.keys(obj(s.pricing)).length ? obj(s.pricing) : null,
            error: erro
              ? {
                  code: typeof obj(erro).code === "number" ? (obj(erro).code as number) : null,
                  title: txt(obj(erro).title),
                  details: txt(obj(obj(erro).error_data).details),
                }
              : null,
          });
        }
        continue;
      }

      if (campo === "smb_message_echoes") {
        for (const ee of lista(valor.message_echoes)) {
          const e = obj(ee);
          const wamid = txt(e.id);
          const para = txt(e.to);
          if (!wamid || !para || !phoneNumberId) continue;
          eventos.push({
            kind: "echo",
            dedupKey: `echo:${wamid}`,
            phoneNumberId,
            waId: para,
            wamid,
            type: String(e.type ?? "unknown"),
            body: corpoDaMensagem(e),
            payload: e,
            ts: tsParaIso(e.timestamp),
          });
        }
        continue;
      }

      if (campo === "message_template_status_update") {
        const nome = txt(valor.message_template_name);
        const idioma = txt(valor.message_template_language);
        const estado = txt(valor.event);
        const waba = txt(obj(entrada).id);
        if (nome && idioma && estado && waba) {
          eventos.push({
            kind: "template_status",
            dedupKey: `tpl:${waba}:${nome}:${idioma}:${estado}:${String(obj(entrada).time ?? "")}`,
            wabaId: waba,
            name: nome,
            language: idioma,
            status: estado.toUpperCase(),
            reason: txt(valor.reason),
            providerTemplateId:
              valor.message_template_id === undefined || valor.message_template_id === null
                ? null
                : String(valor.message_template_id),
          });
        }
        continue;
      }

      if (campo === "account_update") {
        const waba = txt(obj(entrada).id);
        const evento = txt(valor.event);
        if (waba && evento) {
          eventos.push({
            kind: "conta",
            dedupKey: `conta:${waba}:${evento}:${String(obj(entrada).time ?? "")}`,
            wabaId: waba,
            evento: evento.toUpperCase(),
            displayPhone: txt(valor.phone_number),
            motivo: txt(obj(valor.disconnection_info).reason),
          });
        }
        continue;
      }

      if (campo === "history") {
        const negocio = txt(obj(valor.metadata).display_phone_number)?.replace(/\D/g, "") ?? "";
        for (const bloco of lista(valor.history)) {
          const mb = obj(obj(bloco).metadata);
          if (typeof mb.progress === "number" && phoneNumberId) {
            eventos.push({
              kind: "historico_progresso",
              dedupKey: `histp:${phoneNumberId}:${String(mb.phase ?? "")}:${String(mb.chunk_order ?? "")}:${mb.progress}`,
              phoneNumberId,
              progress: mb.progress,
              phase: typeof mb.phase === "number" ? mb.phase : null,
            });
          }
          for (const fio of lista(obj(bloco).threads)) {
            const cliente = txt(obj(fio).id);
            for (const mm of lista(obj(fio).messages)) {
              const m = obj(mm);
              const wamid = txt(m.id);
              if (!wamid || !cliente || !phoneNumberId) continue;
              const de = (txt(m.from) ?? "").replace(/\D/g, "");
              eventos.push({
                kind: "history_message",
                dedupKey: `hist:${wamid}`,
                phoneNumberId,
                waId: cliente,
                wamid,
                doNegocio: negocio !== "" && de === negocio,
                type: String(m.type ?? "unknown"),
                body: corpoDaMensagem(m),
                payload: m,
                ts: tsParaIso(m.timestamp),
              });
            }
          }
        }
        continue;
      }

      // Campos que a Fase 1 reconhece mas não trata (templates, contatos, qualidade…).
      eventos.push({
        kind: "ignorado",
        dedupKey: `ign:${campo}:${JSON.stringify(valor).length}:${String(obj(entrada).id ?? "")}:${String(obj(entrada).time ?? "")}`,
        phoneNumberId,
        field: campo,
        payload: valor,
      });
    }
  }
  return eventos;
}
