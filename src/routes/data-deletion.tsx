import { createFileRoute } from "@tanstack/react-router";
import { PaginaLegal } from "@/modules/legal/PaginaLegal";
import { EXCLUSAO } from "@/modules/legal/conteudo";

export const Route = createFileRoute("/data-deletion")({
  head: () => ({ meta: [{ title: "Exclusão de dados | ALT Leadflow" }] }),
  component: () => <PaginaLegal pagina={EXCLUSAO} />,
});
