import { createFileRoute } from "@tanstack/react-router";
import { PaginaLegal } from "@/modules/legal/PaginaLegal";
import { PRIVACIDADE } from "@/modules/legal/conteudo";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Política de Privacidade | ALT Leadflow" }] }),
  component: () => <PaginaLegal pagina={PRIVACIDADE} />,
});
