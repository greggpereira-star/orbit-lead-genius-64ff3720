import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { listMetaPageCandidates, saveMetaPages } from "@/lib/meta-oauth.functions";

/**
 * Quais páginas do Facebook são DESTA empresa.
 *
 * A conta do Facebook de quem conecta enxerga as páginas de todos os clientes que já passaram por
 * ali. Aqui a pessoa marca só as do cliente atual: o que não for marcado não entra na empresa, e
 * página que já é de outra empresa aparece bloqueada.
 */
export function EscolherPaginasMeta({
  aberto,
  aoMudar,
  obrigatorio = false,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  /** Ainda não há nenhuma página escolhida: a tela pede a escolha em vez de ficar vazia. */
  obrigatorio?: boolean;
}) {
  const qc = useQueryClient();
  const listar = useServerFn(listMetaPageCandidates);
  const salvar = useServerFn(saveMetaPages);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");

  const candidatas = useQuery({
    queryKey: ["meta-paginas-candidatas"],
    queryFn: () => listar(),
    enabled: aberto,
    staleTime: 0,
    gcTime: 0,
  });

  useEffect(() => {
    if (candidatas.data) {
      setMarcadas(new Set(candidatas.data.filter((p) => p.selecionada).map((p) => p.page_id)));
    }
  }, [candidatas.data]);

  const gravar = useMutation({
    mutationFn: () => salvar({ data: { pageIds: [...marcadas] } }),
    onSuccess: (r) => {
      toast.success(
        r.adicionadas + r.removidas === 0
          ? "Nenhuma mudança nas páginas"
          : `Páginas atualizadas (${r.adicionadas} adicionada(s), ${r.removidas} removida(s))`,
      );
      qc.invalidateQueries({ queryKey: ["meta-connection"] });
      qc.invalidateQueries({ queryKey: ["meta-forms"] });
      aoMudar(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const lista = (candidatas.data ?? []).filter((p) =>
    p.nome.toLowerCase().includes(busca.trim().toLowerCase()),
  );

  const alternar = (id: string, valor: boolean) =>
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (valor) novo.add(id);
      else novo.delete(id);
      return novo;
    });

  return (
    <Dialog open={aberto} onOpenChange={(v) => (obrigatorio && gravar.isPending ? undefined : aoMudar(v))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Escolha as páginas desta empresa</DialogTitle>
          <DialogDescription>
            Sua conta do Facebook enxerga as páginas de vários clientes. Marque só as que
            pertencem a esta empresa: as outras não entram aqui, e os leads delas não chegam
            para esta conta.
          </DialogDescription>
        </DialogHeader>

        {candidatas.isLoading && (
          <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando as páginas no Facebook…
          </div>
        )}

        {candidatas.isError && (
          <p role="alert" className="py-4 text-sm text-destructive">
            {(candidatas.error as Error).message}
          </p>
        )}

        {candidatas.data && (
          <div className="space-y-3">
            {candidatas.data.length > 6 && (
              <Input
                placeholder="Buscar página…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="h-11 md:h-10"
                aria-label="Buscar página"
              />
            )}
            {candidatas.data.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                Nenhuma página liberada por esta conta do Facebook. Reconecte e marque a página
                do cliente na tela do Facebook.
              </p>
            ) : (
              <ul className="max-h-72 space-y-1 overflow-y-auto" aria-label="Páginas do Facebook">
                {lista.map((p) => (
                  <li key={p.page_id}>
                    <label
                      className={`flex min-h-11 items-center gap-3 rounded-md border px-3 py-2 ${
                        p.deOutraEmpresa ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-muted/50"
                      }`}
                    >
                      <Checkbox
                        checked={marcadas.has(p.page_id)}
                        disabled={p.deOutraEmpresa}
                        onCheckedChange={(v) => alternar(p.page_id, v === true)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.nome}</span>
                        {p.deOutraEmpresa && (
                          <span className="block text-xs text-muted-foreground">
                            Já vinculada a outra empresa
                          </span>
                        )}
                        {!p.deOutraEmpresa && p.categoria && (
                          <span className="block truncate text-xs text-muted-foreground">{p.categoria}</span>
                        )}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => aoMudar(false)} disabled={gravar.isPending}>
            {obrigatorio ? "Escolher depois" : "Cancelar"}
          </Button>
          <Button
            onClick={() => gravar.mutate()}
            disabled={gravar.isPending || !candidatas.data || candidatas.data.length === 0}
          >
            {gravar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar ({marcadas.size})
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
