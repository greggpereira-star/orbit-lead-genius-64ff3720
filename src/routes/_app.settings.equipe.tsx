import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Loader2, Trash2, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/core/auth/hooks/useAuth";
import {
  alterarPapelDoMembro,
  criarConvite,
  listarEquipe,
  removerMembro,
  revogarConvite,
} from "@/lib/equipe.functions";
import {
  ROTULO_DO_PAPEL,
  diasParaVencer,
  papeisQueEuPossoConceder,
  podeAlterarPapel,
  podeRemover,
  type PapelConvidavel,
} from "@/lib/equipe/regras";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_app/settings/equipe")({
  head: () => ({ meta: [{ title: "Equipe — Configurações" }] }),
  component: EquipePage,
});

const rotulo = (p: string) => ROTULO_DO_PAPEL[p as keyof typeof ROTULO_DO_PAPEL] ?? p;

function EquipePage() {
  const { company, membership } = useAuth();
  const companyId = company?.id;
  const souAdmin = membership?.role === "owner" || membership?.role === "admin";
  const qc = useQueryClient();
  const listarFn = useServerFn(listarEquipe);
  const criarFn = useServerFn(criarConvite);
  const revogarFn = useServerFn(revogarConvite);
  const papelFn = useServerFn(alterarPapelDoMembro);
  const removerFn = useServerFn(removerMembro);

  const chave = ["equipe", companyId];
  const equipe = useQuery({
    queryKey: chave,
    enabled: Boolean(companyId) && souAdmin,
    queryFn: () => listarFn(),
  });
  const recarregar = () => void qc.invalidateQueries({ queryKey: chave });

  const [convidando, setConvidando] = useState(false);
  const [email, setEmail] = useState("");
  const [papel, setPapel] = useState<PapelConvidavel>("member");
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [aRemover, setARemover] = useState<{ userId: string; nome: string } | null>(null);

  const meuPapel = equipe.data?.meuPapel ?? membership?.role ?? "viewer";
  const posso = papeisQueEuPossoConceder(meuPapel);

  const criar = useMutation({
    mutationFn: () => criarFn({ data: { email, papel } }),
    onSuccess: (r) => {
      setLink({ url: `${window.location.origin}/convite/${r.token}`, email: r.email });
      setEmail("");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const revogar = useMutation({
    mutationFn: (id: string) => revogarFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Convite revogado.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mudarPapel = useMutation({
    mutationFn: (v: { userId: string; papel: PapelConvidavel }) => papelFn({ data: v }),
    onSuccess: () => {
      toast.success("Papel alterado.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: (userId: string) => removerFn({ data: { userId } }),
    onSuccess: () => {
      setARemover(null);
      toast.success("Membro removido.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copiar = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não consegui copiar. Selecione o link e copie à mão.");
    }
  };
  const fechar = () => {
    setConvidando(false);
    setLink(null);
    setEmail("");
    setCopiado(false);
  };

  if (!companyId) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  if (!souAdmin)
    return (
      <div className="space-y-2">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Users className="h-5 w-5" /> Equipe
        </h2>
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Só dono e administrador gerenciam a equipe.
        </p>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            <Users className="h-5 w-5" /> Equipe
          </h2>
          <p className="text-sm text-muted-foreground">
            Quem tem acesso à empresa e com qual papel. O que cada papel pode fazer está em
            Permissões da equipe.
          </p>
        </div>
        <Button onClick={() => setConvidando(true)} className="gap-2">
          <UserPlus className="h-4 w-4" /> Convidar pessoa
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Membros</CardTitle>
          <CardDescription>
            {equipe.isLoading ? "Carregando…" : `${equipe.data?.membros.length ?? 0} pessoa(s) com acesso.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(equipe.data?.membros ?? []).map((m) => {
            const euMesmo = m.userId === equipe.data?.euId;
            const podeTrocar = podeAlterarPapel({ quem: meuPapel, ehEuMesmo: euMesmo, papelAtual: m.papel, novoPapel: "member" });
            const podeTirar = podeRemover({ quem: meuPapel, ehEuMesmo: euMesmo, papelAtual: m.papel });
            return (
              <div key={m.userId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.nome || m.email || "Sem nome"} {euMesmo && <span className="text-muted-foreground">(você)</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {podeTrocar ? (
                    <Select
                      value={m.papel}
                      onValueChange={(v) => mudarPapel.mutate({ userId: m.userId, papel: v as PapelConvidavel })}
                      disabled={mudarPapel.isPending}
                    >
                      <SelectTrigger className="h-9 w-40" aria-label={`Papel de ${m.nome || m.email}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {posso.map((p) => (
                          <SelectItem key={p} value={p}>
                            {rotulo(p)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="secondary">{rotulo(m.papel)}</Badge>
                  )}
                  {podeTirar && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-muted-foreground hover:text-destructive"
                      title="Remover da equipe"
                      onClick={() => setARemover({ userId: m.userId, nome: m.nome || m.email })}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Remover {m.nome || m.email}</span>
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Convites pendentes</CardTitle>
          <CardDescription>Valem por 7 dias e só podem ser usados uma vez.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(equipe.data?.convites ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum convite pendente.</p>
          )}
          {(equipe.data?.convites ?? []).map((c) => {
            const dias = diasParaVencer(c.expiraEm);
            return (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {rotulo(c.papel)} · {dias > 0 ? `vence em ${dias} dia${dias === 1 ? "" : "s"}` : "vencido"}
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => revogar.mutate(c.id)} disabled={revogar.isPending}>
                  Revogar
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={convidando} onOpenChange={(o) => (o ? setConvidando(true) : fechar())}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{link ? "Convite criado" : "Convidar pessoa"}</DialogTitle>
            <DialogDescription>
              {link
                ? `Envie este link para ${link.email}. Ele aparece só agora e vale por 7 dias.`
                : "A pessoa se cadastra com este e-mail e já entra na empresa com o papel escolhido."}
            </DialogDescription>
          </DialogHeader>

          {link ? (
            <div className="space-y-3">
              <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} aria-label="Link do convite" />
              <Button onClick={copiar} className="w-full gap-2">
                {copiado ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copiado ? "Copiado" : "Copiar link"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="convite-email">E-mail</Label>
                <Input
                  id="convite-email"
                  type="email"
                  placeholder="pessoa@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="convite-papel">Papel</Label>
                <Select value={papel} onValueChange={(v) => setPapel(v as PapelConvidavel)}>
                  <SelectTrigger id="convite-papel">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {posso.map((p) => (
                      <SelectItem key={p} value={p}>
                        {rotulo(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            {link ? (
              <Button variant="outline" onClick={fechar}>
                Fechar
              </Button>
            ) : (
              <Button onClick={() => criar.mutate()} disabled={!email.trim() || criar.isPending}>
                {criar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar convite
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(aRemover)} onOpenChange={(o) => !o && setARemover(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remover {aRemover?.nome}?</DialogTitle>
            <DialogDescription>
              A pessoa perde o acesso à empresa agora. Os leads e conversas dela continuam aqui.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setARemover(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => aRemover && remover.mutate(aRemover.userId)}
              disabled={remover.isPending}
            >
              {remover.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
