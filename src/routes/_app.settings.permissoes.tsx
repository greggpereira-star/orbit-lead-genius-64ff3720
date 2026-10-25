import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { salvarPermissoesDaEmpresa } from "@/lib/permissoes.functions";
import { chavePermissoes, usePermissoesDaEmpresa } from "@/modules/permissoes/usePermissoes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/settings/permissoes")({
  head: () => ({ meta: [{ title: "Permissões da equipe — Configurações" }] }),
  component: PermissoesPage,
});

function PermissoesPage() {
  const { company, membership } = useAuth();
  const companyId = company?.id;
  const podeEditar = membership?.role === "owner" || membership?.role === "admin";
  const qc = useQueryClient();
  const salvarFn = useServerFn(salvarPermissoesDaEmpresa);
  const atual = usePermissoesDaEmpresa();

  const [excluem, setExcluem] = useState(false);
  const [exportam, setExportam] = useState(false);
  const [etapas, setEtapas] = useState(false);
  const [etiquetas, setEtiquetas] = useState(true);
  const [campos, setCampos] = useState(false);
  useEffect(() => {
    if (atual.carregando) return;
    setExcluem(atual.membrosExcluemLeads);
    setExportam(atual.membrosExportam);
    setEtapas(atual.membrosGerenciamEtapas);
    setEtiquetas(atual.membrosCriamEtiquetas);
    setCampos(atual.membrosCriamCampos);
  }, [
    atual.carregando,
    atual.membrosExcluemLeads,
    atual.membrosExportam,
    atual.membrosGerenciamEtapas,
    atual.membrosCriamEtiquetas,
    atual.membrosCriamCampos,
  ]);

  const mudou =
    !atual.carregando &&
    (excluem !== atual.membrosExcluemLeads ||
      exportam !== atual.membrosExportam ||
      etapas !== atual.membrosGerenciamEtapas ||
      etiquetas !== atual.membrosCriamEtiquetas ||
      campos !== atual.membrosCriamCampos);
  const salvar = useMutation({
    mutationFn: () => salvarFn({
        data: {
          membrosExcluemLeads: excluem,
          membrosExportam: exportam,
          membrosGerenciamEtapas: etapas,
          membrosCriamEtiquetas: etiquetas,
          membrosCriamCampos: campos,
        },
      }),
    onSuccess: () => {
      toast.success("Permissões salvas.");
      void qc.invalidateQueries({ queryKey: chavePermissoes(companyId) });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!companyId || atual.carregando)
    return <div className="text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <ShieldCheck className="h-5 w-5" /> Permissões da equipe
        </h2>
        <p className="text-sm text-muted-foreground">
          O que cada atendente pode fazer. Dono e administrador sempre podem tudo; quem só
          visualiza nunca altera nada.
        </p>
      </div>

      {!podeEditar && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Só administradores alteram as permissões. Você pode ver como estão configuradas.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Leads, funil e dados</CardTitle>
          <CardDescription>Vale na hora para todos os atendentes da empresa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="perm-excluir-leads" className="text-sm font-medium">
                Atendentes podem excluir leads
              </Label>
              <p className="text-sm text-muted-foreground">
                A exclusão é definitiva: apaga o lead, as anotações, os anexos, as etiquetas e o
                histórico dele. Desligado, só dono e administrador veem o botão de excluir.
              </p>
            </div>
            <Switch
              id="perm-excluir-leads"
              checked={excluem}
              onCheckedChange={setExcluem}
              disabled={!podeEditar}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="perm-exportar" className="text-sm font-medium">
                Atendentes podem exportar dados (CSV)
              </Label>
              <p className="text-sm text-muted-foreground">
                Leads, respostas de formulários e quiz, e conversas do WhatsApp. Desligado, só dono e
                administrador veem os botões de exportar. Nas telas de leads, formulários e quiz isto
                tira o botão, mas não impede quem já consulta o banco por conta própria; a
                exportação de conversa do WhatsApp é barrada no servidor.
              </p>
            </div>
            <Switch
              id="perm-exportar"
              checked={exportam}
              onCheckedChange={setExportam}
              disabled={!podeEditar}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="perm-etapas" className="text-sm font-medium">
                Atendentes podem criar, reordenar e apagar etapas do funil
              </Label>
              <p className="text-sm text-muted-foreground">
                Mexer nas etapas muda o funil de todo mundo. Desligado, só dono e administrador veem
                "Gerenciar etapas" no Pipeline.
              </p>
            </div>
            <Switch
              id="perm-etapas"
              checked={etapas}
              onCheckedChange={setEtapas}
              disabled={!podeEditar}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="perm-etiquetas" className="text-sm font-medium">
                Atendentes podem criar etiquetas novas
              </Label>
              <p className="text-sm text-muted-foreground">
                Etiqueta pode mover o lead de etapa e gerar conversão. Desligado, o atendente ainda
                aplica as etiquetas que a empresa já usa, mas não inventa uma nova.
              </p>
            </div>
            <Switch
              id="perm-etiquetas"
              checked={etiquetas}
              onCheckedChange={setEtiquetas}
              disabled={!podeEditar}
            />
          </div>

          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <div>
              <Label htmlFor="perm-campos" className="text-sm font-medium">
                Atendentes podem criar e editar campos personalizados
              </Label>
              <p className="text-sm text-muted-foreground">
                Define quais campos existem em todo lead. Desligado (como já era), só dono e
                administrador mexem nas definições; o atendente continua preenchendo os valores.
              </p>
            </div>
            <Switch
              id="perm-campos"
              checked={campos}
              onCheckedChange={setCampos}
              disabled={!podeEditar}
            />
          </div>

          {podeEditar && (
            <Button onClick={() => salvar.mutate()} disabled={!mudou || salvar.isPending}>
              {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
