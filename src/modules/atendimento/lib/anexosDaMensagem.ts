/**
 * Localização e contato recebidos: o webhook guarda a mensagem inteira em `payload`, mas a conversa
 * só mostrava "[Localização]" e "[Contato]". Aqui o payload vira o que a tela precisa desenhar.
 * Tudo vem de fora (cliente), então nada é confiado: número é validado e texto é cortado.
 */

export interface TelefoneDeContato {
  numero: string;
  rotulo: string | null;
}

export interface ContatoCompartilhado {
  nome: string;
  telefones: TelefoneDeContato[];
  email: string | null;
  empresa: string | null;
}

export type AnexoDaMensagem =
  | {
      kind: "localizacao";
      latitude: number;
      longitude: number;
      nome: string | null;
      endereco: string | null;
      /** Link de mapa montado aqui, nunca o `url` que veio do cliente. */
      mapa: string;
    }
  | { kind: "contatos"; itens: ContatoCompartilhado[] };

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const texto = (v: unknown, max = 200): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim().slice(0, max) : null;
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const ROTULO_DO_TELEFONE: Record<string, string> = {
  CELL: "Celular",
  MOBILE: "Celular",
  HOME: "Casa",
  WORK: "Trabalho",
  MAIN: "Principal",
  IPHONE: "iPhone",
};

export function anexoDaMensagem(m: { type: string; payload?: unknown }): AnexoDaMensagem | null {
  const p = obj(m.payload);

  if (m.type === "location") {
    const l = obj(p.location);
    const latitude = numero(l.latitude);
    const longitude = numero(l.longitude);
    if (latitude === null || longitude === null) return null;
    if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    return {
      kind: "localizacao",
      latitude,
      longitude,
      nome: texto(l.name),
      endereco: texto(l.address),
      mapa: `https://www.google.com/maps?q=${latitude},${longitude}`,
    };
  }

  if (m.type === "contacts") {
    const itens: ContatoCompartilhado[] = [];
    for (const c of lista(p.contacts).slice(0, 10)) {
      const co = obj(c);
      const nome = texto(obj(co.name).formatted_name) ?? texto(obj(co.name).first_name);
      const telefones: TelefoneDeContato[] = [];
      for (const t of lista(co.phones).slice(0, 5)) {
        const to = obj(t);
        const n = texto(to.phone, 40) ?? (texto(to.wa_id, 40) ? `+${texto(to.wa_id, 40)}` : null);
        if (n) {
          const tipo = texto(to.type, 20)?.toUpperCase() ?? "";
          telefones.push({ numero: n, rotulo: ROTULO_DO_TELEFONE[tipo] ?? null });
        }
      }
      const email = texto(obj(lista(co.emails)[0]).email, 120);
      const empresa = texto(obj(co.org).company, 120);
      if (nome || telefones.length > 0) {
        itens.push({ nome: nome ?? "Sem nome", telefones, email, empresa });
      }
    }
    return itens.length > 0 ? { kind: "contatos", itens } : null;
  }

  return null;
}
