import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { destinoDoAviso, naoLidos, rotuloDaContagem, tempoDecorrido, type Aviso } from "./avisos";

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => supabase as any;

/**
 * O sino do topo. Antes era um ícone com um ponto vermelho FIXO: avisava de nada, sempre. Agora
 * lê `team_notifications` (as linhas são da própria pessoa, por RLS) e relê a cada 30 s e ao
 * voltar para a aba.
 */
export function CentroDeAvisos() {
  const { company, user } = useAuth();
  const companyId = company?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const chave = ["avisos-da-equipe", companyId ?? "", user?.id ?? ""] as const;

  const avisos = useQuery({
    queryKey: chave,
    enabled: Boolean(companyId && user?.id),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<Aviso[]> => {
      const { data, error } = await db()
        .from("team_notifications")
        .select("id,title,body,conversation_id,lead_id,created_at,read_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as Aviso[];
    },
  });

  const marcar = useMutation({
    mutationFn: async (ids: string[]) => {
      if (!ids.length) return;
      const { error } = await db()
        .from("team_notifications")
        .update({ read_at: new Date().toISOString() })
        .in("id", ids)
        .is("read_at", null);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: chave }),
  });

  const lista = avisos.data ?? [];
  const pendentes = naoLidos(lista);
  const rotulo = rotuloDaContagem(pendentes);

  const abrir = (a: Aviso) => {
    if (!a.read_at) marcar.mutate([a.id]);
    const destino = destinoDoAviso(a);
    setAberto(false);
    if (destino.tipo === "conversa")
      void navigate({ to: "/whatsapp", search: { conversa: destino.id } });
    else if (destino.tipo === "lead")
      void navigate({ to: "/leads/$id", params: { id: destino.id } });
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative max-sm:h-11 max-sm:w-11"
          aria-label={pendentes > 0 ? `Avisos: ${pendentes} não lidos` : "Avisos"}
        >
          <Bell className="h-5 w-5 text-muted-foreground" />
          {rotulo && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-none text-destructive-foreground">
              {rotulo}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <span className="text-sm font-semibold">Avisos</span>
          {pendentes > 0 && (
            <button
              type="button"
              onClick={() => marcar.mutate(lista.filter((a) => !a.read_at).map((a) => a.id))}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Marcar todos como lidos
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {avisos.isLoading && <p className="p-4 text-sm text-muted-foreground">Carregando…</p>}
          {!avisos.isLoading && lista.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhum aviso. Eles aparecem aqui quando uma regra de automação com a ação “Notificar
              equipe” disparar.
            </p>
          )}
          {lista.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => abrir(a)}
              className={cn(
                "flex w-full items-start gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/50",
                !a.read_at && "bg-primary/5",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                  a.read_at ? "bg-transparent" : "bg-destructive",
                )}
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className={cn("text-sm", !a.read_at ? "font-semibold" : "font-medium")}>
                    {a.title}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {tempoDecorrido(a.created_at)}
                  </span>
                </span>
                {a.body && (
                  <span className="mt-0.5 block text-[13px] text-muted-foreground">{a.body}</span>
                )}
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
