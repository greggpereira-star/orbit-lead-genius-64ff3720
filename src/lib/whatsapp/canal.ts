/**
 * Resolve QUAL provedor e QUAL canal uma empresa usa para enviar.
 *
 * Antes cada chamador consultava `whatsapp_instances` à mão, com regras
 * levemente diferentes (um checava `status`, o do quiz derivava o nome da
 * instância sem consultar nada). Aqui é uma só.
 */

import { criarCloudProvider } from "./cloud/cloud-provider";
import { evolutionProvider } from "./evolution-provider";
import type { AdminDb, CanalWhatsApp, ConsultaDb, WhatsAppProvider } from "./provider";

export type CanalResolvido =
  | { ok: true; provider: WhatsAppProvider; canal: CanalWhatsApp }
  | { ok: false; motivo: "nao_configurado" | "sem_canal" | "desconectado"; texto: string };

export async function resolverCanal(admin: AdminDb, companyId: string): Promise<CanalResolvido> {
  /* A Cloud API tem PRIORIDADE: empresa com número oficial conectado usa ele,
     e a instância da Evolution deixa de ser consultada (corte seco por cliente,
     decisão de 15/10/2026). Erro na consulta — por exemplo, a migração `wa_*`
     ainda não aplicada — cai na Evolution, que é o comportamento de antes. */
  const { data: numeros, error: erroNumero } = await (admin.from("wa_phone_numbers") as ConsultaDb)
    .select("phone_number_id")
    .eq("company_id", companyId)
    .limit(1);
  const oficial =
    !erroNumero && Array.isArray(numeros)
      ? (numeros[0] as { phone_number_id?: string } | undefined)
      : undefined;
  if (oficial?.phone_number_id) {
    const cloud = criarCloudProvider(admin);
    if (!cloud.estaConfigurado()) {
      return {
        ok: false,
        motivo: "nao_configurado",
        texto: "Chave de cifra do WhatsApp (WA_TOKEN_KEY) não configurada",
      };
    }
    return {
      ok: true,
      provider: cloud,
      canal: { provider: "cloud", referencia: oficial.phone_number_id },
    };
  }

  const provider = evolutionProvider;

  if (!provider.estaConfigurado()) {
    return { ok: false, motivo: "nao_configurado", texto: "WhatsApp não configurado no servidor" };
  }

  const { data } = await (admin.from("whatsapp_instances") as ConsultaDb)
    .select("instance_name, status")
    .eq("company_id", companyId)
    .maybeSingle();
  const instancia = data as { instance_name?: string | null; status?: string | null } | null;

  if (!instancia?.instance_name) {
    return { ok: false, motivo: "sem_canal", texto: "WhatsApp não conectado" };
  }
  if (instancia.status !== "connected") {
    return { ok: false, motivo: "desconectado", texto: "WhatsApp não conectado" };
  }

  return {
    ok: true,
    provider,
    canal: { provider: provider.id, referencia: String(instancia.instance_name) },
  };
}
