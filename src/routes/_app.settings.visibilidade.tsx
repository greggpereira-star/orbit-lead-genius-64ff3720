import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { salvarVisibilidadeWhatsApp } from "@/lib/whatsapp-atendimento.functions";
import { normalizarConfig, type ModoDeVisibilidade } from "@/lib/whatsapp/visibilidade";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/_app/settings/visibilidade")({
  head: () => ({ meta: [{ title: "Quem vê as conversas — Configurações" }] }),
  component: VisibilidadePage,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => supabase as any;

function VisibilidadePage() {
  const { company, membership } = useAuth();
  const companyId = company?.id;
  const podeEditar = membership?.role === "owner" || membership?.role === "admin";
  const qc = useQueryClient();
  const salvarFn = useServerFn(salvarVisibilidadeWhatsApp);

  const atual = useQuery({
    queryKey: ["wa-visibilidade", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await db()
        .from("wa_visibilidade")
        .select("modo,ver_fila")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return normalizarConfig(data);
    },
  });

  const [modo, setModo] = useState<ModoDeVisibilidade>("todas");
  const [verFila, setVerFila] = useState(true);
  useEffect(() => {
    if (!atual.data) return;
    setModo(atual.data.modo);
    setVerFila(atual.data.verFila);
  }, [atual.data]);

  const mudou = !!atual.data && (atual.data.modo !== modo || atual.data.verFila !== verFila);
  const salvar = useMutation({
    mutationFn: () => salvarFn({ data: { modo, verFila } }),
    onSuccess: () => {
      toast.success("Visibilidade das conversas salva.");
      void qc.invalidateQueries({ queryKey: ["wa-visibilidade", companyId] });
      // A lista do atendimento precisa reler: o que cada pessoa enxerga acabou de mudar.
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!companyId || atual.isLoading)
    return <div className="text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <EyeOff className="h-5 w-5" /> Quem vê as conversas
        </h2>
        <p className="text-sm text-muted-foreground">
          Define o que cada atendente enxerga na tela de Atendimento do WhatsApp. Dono e
          administrador sempre veem todas as conversas.
        </p>
      </div>

      {!podeEditar && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Só administradores alteram esta regra. Você pode ver como está configurada.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Modo</CardTitle>
          <CardDescription>Vale na hora para todos os atendentes da empresa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <RadioGroup
            value={modo}
            onValueChange={(v) => setModo(v as ModoDeVisibilidade)}
            disabled={!podeEditar}
            className="space-y-3"
          >
            <div className="flex items-start gap-3">
              <RadioGroupItem value="todas" id="vis-todas" className="mt-1" />
              <Label htmlFor="vis-todas" className="space-y-0.5">
                <span className="block text-sm font-medium">Todos veem todas as conversas</span>
                <span className="block text-sm font-normal text-muted-foreground">
                  Como funciona hoje.
                </span>
              </Label>
            </div>
            <div className="flex items-start gap-3">
              <RadioGroupItem value="so_minhas" id="vis-minhas" className="mt-1" />
              <Label htmlFor="vis-minhas" className="space-y-0.5">
                <span className="block text-sm font-medium">Atendente vê só as dele</span>
                <span className="block text-sm font-normal text-muted-foreground">
                  Cada atendente vê as conversas atribuídas a ele, as que ele segue e as de notas
                  em que foi mencionado.
                </span>
              </Label>
            </div>
          </RadioGroup>

          {modo === "so_minhas" && (
            <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <Label htmlFor="vis-fila" className="text-sm font-medium">
                  Ver também a fila (conversas sem responsável)
                </Label>
                <p className="text-sm text-muted-foreground">
                  Ligado, qualquer atendente pode pegar uma conversa nova ao responder. Desligado,
                  conversa sem responsável só aparece para administradores — alguém precisa
                  atribuí-la, à mão ou por automação.
                </p>
              </div>
              <Switch
                id="vis-fila"
                checked={verFila}
                onCheckedChange={setVerFila}
                disabled={!podeEditar}
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Vale para conversas, mensagens, notas e mensagens agendadas do WhatsApp. O cadastro do
            lead (nome, telefone, etapa) continua visível a quem acessa o CRM.
          </p>

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
