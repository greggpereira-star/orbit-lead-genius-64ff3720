import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { usePodeGerenciar } from "@/modules/permissoes/usePermissoes";
import {
  addLeadTag,
  listCompanyTagNames,
  listLeadTags,
  removeLeadTag,
} from "../services/leadNotesService";

/**
 * Etiquetas de um lead, com sugestão das já usadas na empresa (pra não virar "Investidor" e
 * "investidor"). É o mesmo editor na ficha do CRM e no painel da conversa do WhatsApp: a etiqueta
 * pode mover o lead de etapa e gerar conversão (feito no banco), então quem a aplica precisa ver o
 * efeito no lugar onde está.
 */
export function EtiquetasDoLead({
  leadId,
  companyId,
  somenteLeitura = false,
  compacto = false,
  aoAlterar,
}: {
  leadId: string;
  companyId: string | null;
  /** Visualizador vê as etiquetas, mas não mexe nelas. */
  somenteLeitura?: boolean;
  /** Painel estreito da conversa: menos espaço, no máximo 6 sugestões. */
  compacto?: boolean;
  /** Depois de adicionar ou remover: a etapa pode ter mudado, quem abriu relê o lead. */
  aoAlterar?: () => void;
}) {
  const qc = useQueryClient();
  const podeCriar = usePodeGerenciar("etiquetas");
  const [input, setInput] = useState("");

  const tagsQuery = useQuery({
    queryKey: ["lead-tags", leadId],
    queryFn: () => listLeadTags(leadId),
  });
  const suggestionsQuery = useQuery({
    queryKey: ["company-tags", companyId],
    enabled: Boolean(companyId) && !somenteLeitura,
    queryFn: () => listCompanyTagNames(companyId as string),
  });

  // Etiqueta do CRM → etapa (gatilho no banco): recarrega o kanban, o caminho no funil e o painel
  // da conversa, que mostra a etapa do lead.
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ["lead-tags", leadId] });
    qc.invalidateQueries({ queryKey: ["leads"] });
    qc.invalidateQueries({ queryKey: ["caminho-do-lead", leadId] });
    qc.invalidateQueries({ queryKey: ["wa-lead-painel", leadId] });
    aoAlterar?.();
  };

  const addMutation = useMutation({
    mutationFn: (name: string) => addLeadTag(leadId, name),
    onSuccess: () => {
      setInput("");
      qc.invalidateQueries({ queryKey: ["company-tags", companyId] });
      recarregar();
    },
    // Sem a permissão de criar, só a etiqueta que a empresa já usa passa: o banco recusa a nova.
    onError: (e: Error) =>
      toast.error(
        !podeCriar
          ? "Você só pode usar etiquetas que a empresa já tem. Peça a um administrador para criar uma nova."
          : e.message,
      ),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => removeLeadTag(id),
    onSuccess: recarregar,
    onError: (e: Error) => toast.error(e.message),
  });

  const current = tagsQuery.data ?? [];
  const currentNames = new Set(current.map((t) => t.tag_name.toLowerCase()));
  const suggestions = (suggestionsQuery.data ?? [])
    .filter((s) => !currentNames.has(s.toLowerCase()))
    .slice(0, compacto ? 6 : 12);

  return (
    <div className={cn(compacto ? "space-y-3" : "space-y-5")}>
      {!somenteLeitura && (
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && input.trim()) {
                e.preventDefault();
                addMutation.mutate(input);
              }
            }}
            placeholder={
              !podeCriar
                ? "Escolha uma etiqueta existente"
                : compacto
                  ? "Nova etiqueta"
                  : "Ex: Investidor, Primeira compra, Urgente"
            }
            className="h-9 text-sm max-sm:h-11"
            aria-label="Nova etiqueta"
          />
          <Button
            onClick={() => addMutation.mutate(input)}
            disabled={addMutation.isPending || !input.trim()}
            className="h-9 max-sm:h-11 max-sm:w-12"
            aria-label="Adicionar etiqueta"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {current.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tagsQuery.isLoading ? "Carregando…" : "Nenhuma etiqueta neste lead."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {current.map((t) => (
            <Badge
              key={t.id}
              variant="secondary"
              className={cn("gap-1 py-1 pl-2.5 text-sm", somenteLeitura ? "pr-2.5" : "pr-1")}
            >
              {t.tag_name}
              {!somenteLeitura && (
                <button
                  type="button"
                  onClick={() => removeMutation.mutate(t.id)}
                  disabled={removeMutation.isPending}
                  className="rounded-full p-0.5 hover:bg-background max-sm:p-2"
                  title={`Remover ${t.tag_name}`}
                  aria-label={`Remover etiqueta ${t.tag_name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {!somenteLeitura && suggestions.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Já usadas nesta empresa</p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addMutation.mutate(s)}
                disabled={addMutation.isPending}
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground max-sm:min-h-10 max-sm:px-3.5"
              >
                + {s}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
