import { createFileRoute } from "@tanstack/react-router";
import { PaginaInicial } from "@/modules/landing/PaginaInicial";
import { DESCRICAO_DA_PAGINA, TITULO_DA_PAGINA } from "@/modules/landing/conteudo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITULO_DA_PAGINA },
      { name: "description", content: DESCRICAO_DA_PAGINA },
      { property: "og:title", content: TITULO_DA_PAGINA },
      { property: "og:description", content: DESCRICAO_DA_PAGINA },
    ],
  }),
  component: PaginaInicial,
});
