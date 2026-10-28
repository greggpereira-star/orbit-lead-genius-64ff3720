/**
 * Pergunta ao servidor se quem abriu o link é um robô.
 *
 * É uma server function (e não um import direto) porque a importação do pedido em
 * andamento é proibida no código que chega ao navegador, e uma rota é sempre
 * analisada para os dois lados. O corpo do handler fica só no servidor.
 */
import { createServerFn } from "@tanstack/react-start";
import { ehRobo } from "./robos";

export const visitanteEhRobo = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    return ehRobo(getRequest()?.headers.get("user-agent"));
  } catch {
    // Sem acesso ao pedido ou sem User-Agent: conta como pessoa.
    return false;
  }
});
