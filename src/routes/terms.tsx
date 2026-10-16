import { createFileRoute } from "@tanstack/react-router";
import { PaginaLegal } from "@/modules/legal/PaginaLegal";
import { TERMOS } from "@/modules/legal/conteudo";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Termos de Serviço | ALT Leadflow" }] }),
  component: () => <PaginaLegal pagina={TERMOS} />,
});
