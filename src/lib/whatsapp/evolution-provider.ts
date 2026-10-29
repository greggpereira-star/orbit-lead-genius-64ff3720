/**
 * Provedor Evolution — o ÚNICO arquivo que importa `evolution.server`.
 *
 * Um teste (`isolamentoDoProvedor.test.ts`) garante isso: se outro arquivo voltar
 * a importar a Evolution direto, a suíte quebra. É o que mantém a troca para a
 * Cloud API uma troca de provedor, e não uma caça a 7 arquivos.
 */

import {
  aplicarEtiquetaPorNome,
  createInstance,
  deleteInstance,
  getInstanceState,
  getPairingCode,
  getQrCode,
  isEvolutionConfigured,
  listarEtiquetas,
  pingEvolution,
  reassinarEventos,
  sendText,
} from "../evolution.server";
import type { CanalWhatsApp, WhatsAppProvider } from "./provider";

export const evolutionProvider: WhatsAppProvider = {
  id: "evolution",
  estaConfigurado: () => isEvolutionConfigured(),
  sendText: (canal: CanalWhatsApp, para, texto) => sendText(canal.referencia, para, texto),
  listarEtiquetas: (canal) => listarEtiquetas(canal.referencia),
  aplicarEtiqueta: (canal, telefone, nome, acao) =>
    aplicarEtiquetaPorNome(canal.referencia, telefone, nome, acao),
};

/**
 * Ciclo de vida da instância (QR, estado, exclusão).
 *
 * É específico da Evolution — a Cloud API não tem QR nem "instância": conecta-se
 * por Embedded Signup. Fica fora da interface de propósito e some junto com o
 * provedor legado.
 */
export const evolutionAdmin = {
  isConfigured: isEvolutionConfigured,
  ping: pingEvolution,
  createInstance,
  getQrCode,
  getPairingCode,
  getInstanceState,
  deleteInstance,
  reassinarEventos,
};
