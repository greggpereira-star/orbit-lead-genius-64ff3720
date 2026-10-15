/**
 * Resolve QUAL provedor e QUAL canal uma empresa usa para enviar.
 *
 * Antes cada chamador consultava `whatsapp_instances` à mão, com regras
 * levemente diferentes (um checava `status`, o do quiz derivava o nome da
 * instância sem consultar nada). Aqui é uma só.
 */

import { evolutionProvider } from "./evolution-provider";
import type { AdminDb, CanalWhatsApp, ConsultaDb, WhatsAppProvider } from "./provider";

export type CanalResolvido =
  | { ok: true; provider: WhatsAppProvider; canal: CanalWhatsApp }
  | { ok: false; motivo: "nao_configurado" | "sem_canal" | "desconectado"; texto: string };

export async function resolverCanal(admin: AdminDb, companyId: string): Promise<CanalResolvido> {
  // Hoje só há o provedor Evolution. Quando a Cloud API entrar, a escolha vem
  // de uma coluna por empresa (`wa_phone_numbers.provider`).
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
