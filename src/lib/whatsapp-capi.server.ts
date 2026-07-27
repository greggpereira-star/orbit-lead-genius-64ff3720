/**
 * Evento `Contact` do Meta para cliques no widget de WhatsApp.
 *
 * O envio em si mora em `meta-capi.server.ts`, compartilhado com os eventos de
 * quiz e formulário. Aqui fica só o que é específico do WhatsApp: o nome do
 * evento e a origem que aparece no Gerenciador de Eventos.
 */

import { sendMetaCapiEvent, type CapiTracking, type MetaCapiResult } from './meta-capi.server';

export interface WaCapiInput {
  companyId: string;
  eventId: string;
  traceId: string;
  eventTime?: number; // unix seconds
  email?: string | null;
  phone?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  pageUrl?: string | null;
  tracking?: CapiTracking | null;
}

export type WaCapiResult = MetaCapiResult;

export async function sendWhatsAppCapi(input: WaCapiInput): Promise<WaCapiResult> {
  return sendMetaCapiEvent({
    companyId: input.companyId,
    eventName: 'Contact',
    eventId: input.eventId,
    eventTime: input.eventTime,
    email: input.email,
    phone: input.phone,
    clientIp: input.clientIp,
    userAgent: input.userAgent,
    pageUrl: input.pageUrl,
    tracking: input.tracking,
    customData: {
      lead_event_source: 'whatsapp_widget',
      content_name: 'whatsapp_click',
    },
  });
}
