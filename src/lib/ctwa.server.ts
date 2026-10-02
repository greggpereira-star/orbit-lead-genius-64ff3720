/**
 * Atribuição de clique do WhatsApp (Click-to-WhatsApp).
 *
 * Quando alguém chega por um anúncio, a Meta injeta um `externalAdReply` na
 * primeira mensagem, com a identidade do clique (`ctwaClid`) e o anúncio de
 * origem. É esse `ctwaClid` que permite devolver a conversão para a Meta de forma
 * determinística mais tarde, em vez de torcer para ela casar por telefone.
 *
 * Medido em 02/10/2026 no tráfego real da instância da agência: 84 mensagens
 * vindas de anúncio, 83 com `ctwaClid` (98,8%), todas em Evolution 2.3.7 com
 * Baileys 7.0.0-rc.9 — a mesma versão que o altleadflow roda.
 */

/** O que interessa de um `externalAdReply`, já normalizado. */
export interface CliqueDeAnuncio {
  ctwaClid: string | null;
  sourceId: string | null;
  sourceApp: string | null;
  sourceUrl: string | null;
  sourceType: string | null;
  title: string | null;
  body: string | null;
  raw: Record<string, unknown>;
}

const texto = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
};

/**
 * Procura o `externalAdReply` em QUALQUER profundidade da mensagem.
 *
 * Caminho fixo não serve, e isso não é zelo: na medição o objeto apareceu sob
 * `audioMessage.contextInfo` e sob `interactiveMessage`, não só no
 * `extendedTextMessage` que a documentação costuma mostrar. Quem chega mandando
 * áudio — que no WhatsApp é muita gente — sumiria em silêncio.
 *
 * A profundidade é limitada porque a mensagem é entrada externa: um payload
 * aninhado de propósito não pode virar estouro de pilha num endpoint público.
 */
export function acharCliqueDeAnuncio(no: unknown, profundidade = 0): CliqueDeAnuncio | null {
  if (profundidade > 12 || no === null || typeof no !== "object") return null;

  if (Array.isArray(no)) {
    for (const item of no) {
      const achado = acharCliqueDeAnuncio(item, profundidade + 1);
      if (achado) return achado;
    }
    return null;
  }

  const obj = no as Record<string, unknown>;

  const alvo = obj.externalAdReply;
  if (alvo && typeof alvo === "object" && !Array.isArray(alvo)) {
    const a = alvo as Record<string, unknown>;
    return {
      ctwaClid: texto(a.ctwaClid),
      sourceId: texto(a.sourceId),
      sourceApp: texto(a.sourceApp),
      sourceUrl: texto(a.sourceUrl),
      sourceType: texto(a.sourceType),
      title: texto(a.title),
      body: texto(a.body),
      // A miniatura em base64 vem junto e pesa dezenas de KB. Guardar isso em
      // toda linha incharia a tabela sem servir a nada — o thumbnailUrl basta.
      raw: Object.fromEntries(
        Object.entries(a).filter(([k]) => k !== "thumbnail" && k !== "jpegThumbnail"),
      ),
    };
  }

  for (const valor of Object.values(obj)) {
    const achado = acharCliqueDeAnuncio(valor, profundidade + 1);
    if (achado) return achado;
  }
  return null;
}

/**
 * Grava o clique. Idempotente pelo `ctwa_clid`: a Evolution reentrega webhook, e
 * sem isso o mesmo clique viraria duas linhas e, na Fase 2, dois eventos.
 *
 * Best-effort de propósito — isto roda dentro do webhook, e falhar em registrar
 * atribuição não pode impedir a mensagem do lead de ser gravada.
 */
export async function registrarCliqueDeAnuncio(
  admin: { from: (t: string) => any },
  entrada: {
    companyId: string;
    leadId: string | null;
    phone: string;
    clique: CliqueDeAnuncio;
    /** Em segundos (como a Evolution manda). Ausente = agora. */
    messageTimestamp?: number | null;
  },
): Promise<void> {
  const { companyId, leadId, phone, clique, messageTimestamp } = entrada;

  // O instante do clique, não o da gravação: a CAPI carimba o evento com ele.
  const clickedAt = messageTimestamp
    ? new Date(messageTimestamp * 1000).toISOString()
    : new Date().toISOString();

  try {
    const linha = {
      company_id: companyId,
      lead_id: leadId,
      phone,
      ctwa_clid: clique.ctwaClid,
      source_id: clique.sourceId,
      source_app: clique.sourceApp,
      source_url: clique.sourceUrl,
      source_type: clique.sourceType,
      ad_title: clique.title,
      ad_body: clique.body,
      raw: clique.raw as never,
      clicked_at: clickedAt,
    };

    if (clique.ctwaClid) {
      await admin
        .from("whatsapp_ad_clicks")
        .upsert(linha, { onConflict: "company_id,ctwa_clid", ignoreDuplicates: true });
    } else {
      // Sem clid não há chave de conflito; 1 em 84 na medição. Entra mesmo assim
      // porque o `sourceId` ainda diz qual anúncio trouxe a conversa.
      await admin.from("whatsapp_ad_clicks").insert(linha);
    }

    console.info(
      JSON.stringify({
        scope: "ctwa",
        msg: "clique_registrado",
        company_id: companyId,
        tem_clid: Boolean(clique.ctwaClid),
        source_id: clique.sourceId,
        source_app: clique.sourceApp,
        ligado_a_lead: Boolean(leadId),
      }),
    );
  } catch (err) {
    console.error(
      JSON.stringify({
        scope: "ctwa",
        msg: "falha_ao_registrar_clique",
        company_id: companyId,
        erro: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
