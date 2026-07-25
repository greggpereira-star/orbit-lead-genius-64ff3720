/**
 * Resolve e guarda os nomes de anúncio, conjunto e campanha de um lead.
 *
 * O lead do Meta traz só IDs numéricos. Sem isto, a ficha mostra
 * "52525417339565" onde deveria dizer "[COALA][FORMULARIO][COSTA-DOURADA]" —
 * e não dá pra saber qual anúncio está trazendo cliente, que é a decisão mais
 * cara de quem investe em mídia.
 *
 * Funciona como cache: dezenas de leads chegam do mesmo anúncio, e sem isso
 * cada um faria uma chamada à Graph API pra buscar o mesmo nome.
 */
import { fetchAdAttribution, type MetaAdAttribution } from "./meta-graph.server";

type Admin = any;

/** Nome de anúncio muda pouco; um dia de cache evita chamada repetida à toa. */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export async function resolveAdAttribution(
  admin: Admin,
  params: { companyId: string; adId: string | null | undefined; accessToken: string },
): Promise<MetaAdAttribution | null> {
  const { companyId, adId, accessToken } = params;
  if (!adId) return null;

  try {
    const { data: cached } = await admin
      .from("meta_ad_attribution")
      .select("*")
      .eq("company_id", companyId)
      .eq("ad_id", adId)
      .maybeSingle();

    const fresh =
      cached?.refreshed_at && Date.now() - new Date(cached.refreshed_at).getTime() < STALE_AFTER_MS;

    if (cached && fresh && cached.fetch_status === "ok") {
      return {
        ad_id: cached.ad_id,
        ad_name: cached.ad_name,
        adset_id: cached.adset_id,
        adset_name: cached.adset_name,
        campaign_id: cached.campaign_id,
        campaign_name: cached.campaign_name,
      };
    }

    const fetched = await fetchAdAttribution(adId, accessToken);
    const now = new Date().toISOString();

    if (!fetched) {
      // Registra a falha pra não ficar tentando o mesmo anúncio a cada lead —
      // sem token com ads_read, por exemplo, toda tentativa falharia igual.
      const row = {
        company_id: companyId,
        ad_id: adId,
        fetch_status: "error",
        error_message: "Não foi possível ler o anúncio (verifique o escopo ads_read).",
        refreshed_at: now,
      };
      if (cached?.id) {
        await admin.from("meta_ad_attribution").update(row).eq("id", cached.id);
      } else {
        await admin.from("meta_ad_attribution").insert(row);
      }
      return null;
    }

    const row = {
      company_id: companyId,
      ad_id: fetched.ad_id,
      ad_name: fetched.ad_name,
      adset_id: fetched.adset_id,
      adset_name: fetched.adset_name,
      campaign_id: fetched.campaign_id,
      campaign_name: fetched.campaign_name,
      raw_payload: fetched,
      fetch_status: "ok",
      error_message: null,
      refreshed_at: now,
    };

    // Update/insert explícito em vez de upsert: não dependo de uma constraint
    // única em (company_id, ad_id) que pode não existir neste schema.
    if (cached?.id) {
      await admin.from("meta_ad_attribution").update(row).eq("id", cached.id);
    } else {
      await admin.from("meta_ad_attribution").insert(row);
    }

    return fetched;
  } catch {
    // Enriquecimento nunca derruba a ingestão do lead.
    return null;
  }
}
