/**
 * Saúde de um número, lida do campo `health_status` da Graph API (WABA, número e template).
 *
 * Documentação da Meta (lida em 22/10/2026): `can_send_message` é AVAILABLE, LIMITED (com
 * `additional_info`) ou BLOCKED (com `errors[]`, cada um com `error_description` e
 * `possible_solution`); `entities[]` diz QUAL nó causa o limite. O texto desses detalhes vem
 * da Meta, em inglês: a tela o mostra como "mensagem da Meta" em vez de fingir que traduziu.
 */
import { situacaoDoNumeroNaMeta, type SituacaoDoNumero } from "./situacaoDoNumero";

export type NivelDeEnvio = "ok" | "limitado" | "bloqueado" | "desconhecido";

export interface PontoDeSaude {
  /** Quem causa: Número, Conta do WhatsApp, Empresa, App ou Template. */
  origem: string;
  /** O que a Meta disse (em inglês, como veio). */
  texto: string;
  solucao: string | null;
}

export interface SaudeDaConexao {
  envio: { nivel: NivelDeEnvio; rotulo: string; descricao: string; pontos: PontoDeSaude[] };
  status: SituacaoDoNumero;
  qualidade: {
    nivel: "alta" | "media" | "baixa" | "desconhecida";
    rotulo: string;
    descricao: string;
  };
  /** "250 contatos novos por 24 h", ou `null` se a Meta não informou. */
  limite: string | null;
}

const ORIGENS: Record<string, string> = {
  PHONE_NUMBER: "Número",
  WABA: "Conta do WhatsApp",
  BUSINESS: "Empresa (portfólio)",
  APP: "App",
  MESSAGE_TEMPLATE: "Template",
};

const LIMITES: Record<string, string> = {
  TIER_50: "50 contatos novos por 24 h",
  TIER_250: "250 contatos novos por 24 h",
  TIER_1K: "1.000 contatos novos por 24 h",
  TIER_2K: "2.000 contatos novos por 24 h",
  TIER_10K: "10.000 contatos novos por 24 h",
  TIER_100K: "100.000 contatos novos por 24 h",
  TIER_UNLIMITED: "Sem limite de contatos novos por 24 h",
};

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const texto = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

function pontosDe(entidades: unknown, nivel: "LIMITED" | "BLOCKED"): PontoDeSaude[] {
  if (!Array.isArray(entidades)) return [];
  const saida: PontoDeSaude[] = [];
  for (const e of entidades) {
    const ent = obj(e);
    if (!ent || ent.can_send_message !== nivel) continue;
    const origem = ORIGENS[String(ent.entity_type)] ?? "Outro item";
    if (nivel === "LIMITED") {
      const infos = Array.isArray(ent.additional_info) ? ent.additional_info : [];
      for (const i of infos) {
        const t = texto(i);
        if (t) saida.push({ origem, texto: t, solucao: null });
      }
    } else {
      const erros = Array.isArray(ent.errors) ? ent.errors : [];
      for (const er of erros) {
        const o = obj(er);
        const t = texto(o?.error_description);
        if (t) saida.push({ origem, texto: t, solucao: texto(o?.possible_solution) });
      }
    }
  }
  return saida;
}

export function interpretarSaudeDaMeta(bruto: unknown): SaudeDaConexao {
  const r = obj(bruto) ?? {};
  const hs = obj(r.health_status);
  const pode = typeof hs?.can_send_message === "string" ? hs.can_send_message : "";

  let envio: SaudeDaConexao["envio"];
  if (pode === "AVAILABLE") {
    envio = {
      nivel: "ok",
      rotulo: "Pode enviar",
      descricao: "A conta atende a todos os requisitos para enviar mensagens.",
      pontos: [],
    };
  } else if (pode === "LIMITED") {
    envio = {
      nivel: "limitado",
      rotulo: "Alcance limitado",
      descricao: "A conta atende aos requisitos, mas tem restrições que podem afetar o envio.",
      pontos: pontosDe(hs?.entities, "LIMITED"),
    };
  } else if (pode === "BLOCKED") {
    envio = {
      nivel: "bloqueado",
      rotulo: "Envio bloqueado",
      descricao: "A conta não atende a um ou mais requisitos e não consegue enviar mensagens.",
      pontos: pontosDe(hs?.entities, "BLOCKED"),
    };
  } else {
    envio = {
      nivel: "desconhecido",
      rotulo: "Sem informação da Meta",
      descricao: "A Meta não devolveu a situação de envio desta conta agora.",
      pontos: [],
    };
  }

  const q = typeof r.quality_rating === "string" ? r.quality_rating.toUpperCase() : "";
  const qualidade: SaudeDaConexao["qualidade"] =
    q === "GREEN"
      ? { nivel: "alta", rotulo: "Alta", descricao: "Qualidade alta: o engajamento é positivo." }
      : q === "YELLOW"
        ? {
            nivel: "media",
            rotulo: "Média",
            descricao: "Qualidade média: atenção a bloqueios e denúncias.",
          }
        : q === "RED"
          ? {
              nivel: "baixa",
              rotulo: "Baixa",
              descricao: "Qualidade baixa: há risco de limitação do envio.",
            }
          : {
              nivel: "desconhecida",
              rotulo: "Ainda sem avaliação",
              descricao: "A Meta ainda não avaliou a qualidade deste número.",
            };

  const tier = typeof r.messaging_limit_tier === "string" ? r.messaging_limit_tier : "";
  return {
    envio,
    status: situacaoDoNumeroNaMeta(typeof r.status === "string" ? r.status : null),
    qualidade,
    limite: LIMITES[tier] ?? null,
  };
}
