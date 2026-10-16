import { Link } from "@tanstack/react-router";
import { ATUALIZADO_EM, PRODUTO, type Pagina } from "./conteudo";

/** Página pública de texto: sem login, legível e com links entre as três. */
export function PaginaLegal({ pagina }: { pagina: Pagina }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-foreground">
      <p className="text-sm text-muted-foreground">{PRODUTO}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight">{pagina.titulo}</h1>
      <p className="mt-2 text-muted-foreground">{pagina.resumo}</p>
      <p className="mt-1 text-xs text-muted-foreground">Atualizado em {ATUALIZADO_EM}</p>

      <div className="mt-8 space-y-8">
        {pagina.secoes.map((s) => (
          <section key={s.titulo} className="space-y-2">
            <h2 className="text-lg font-semibold">{s.titulo}</h2>
            {s.paragrafos.map((p, i) => (
              <p key={i} className="leading-relaxed text-foreground/90">
                {p}
              </p>
            ))}
          </section>
        ))}
      </div>

      <nav
        aria-label="Documentos legais"
        className="mt-12 flex flex-wrap gap-4 border-t pt-6 text-sm"
      >
        <Link to="/privacy" className="underline-offset-4 hover:underline">
          Política de Privacidade
        </Link>
        <Link to="/terms" className="underline-offset-4 hover:underline">
          Termos de Serviço
        </Link>
        <Link to="/data-deletion" className="underline-offset-4 hover:underline">
          Exclusão de dados
        </Link>
      </nav>
    </main>
  );
}
