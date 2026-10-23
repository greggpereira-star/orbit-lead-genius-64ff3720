import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { definirCampoDoLead, listarCampos, valoresDoLead } from "../services/customFieldService";
import {
  valorParaEdicao,
  valorParaExibir,
  type DefinicaoDeCampo,
} from "../lib/camposPersonalizados";

/** Quantos campos personalizados este lead tem preenchidos (para o resumo de uma seção fechada). */
export function useCamposDoLead(leadId: string | null, companyId: string | null) {
  const defs = useQuery({
    queryKey: ["custom-field-defs", companyId ?? ""],
    enabled: Boolean(companyId),
    queryFn: () => listarCampos(companyId as string),
    staleTime: 60_000,
  });
  const valores = useQuery({
    queryKey: ["lead-custom", leadId ?? ""],
    enabled: Boolean(leadId),
    queryFn: () => valoresDoLead(leadId as string),
  });
  return { defs, valores };
}

const NENHUM = "__nenhum__";

/** Os campos personalizados de um lead, editáveis. Grava ao sair do campo (ou ao escolher na lista). */
export function CamposDoLead({
  leadId,
  companyId,
  somenteLeitura = false,
}: {
  leadId: string;
  companyId: string;
  somenteLeitura?: boolean;
}) {
  const qc = useQueryClient();
  const { defs, valores } = useCamposDoLead(leadId, companyId);

  const gravar = useMutation({
    mutationFn: (v: { key: string; valor: string }) => definirCampoDoLead(leadId, v.key, v.valor),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["lead-custom", leadId] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      // O campo mostrou o que a pessoa digitou; volta ao valor guardado.
      void qc.invalidateQueries({ queryKey: ["lead-custom", leadId] });
    },
  });

  const lista = defs.data ?? [];
  if (defs.isLoading || valores.isLoading)
    return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (lista.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum campo personalizado ainda. Crie em Configurações → Campos personalizados.
      </p>
    );

  return (
    <div className="space-y-3">
      {lista.map((d) => (
        <Campo
          key={d.id}
          def={d}
          valor={(valores.data ?? {})[d.key]}
          somenteLeitura={somenteLeitura}
          onGravar={(valor) => gravar.mutate({ key: d.key, valor })}
        />
      ))}
    </div>
  );
}

function Campo({
  def,
  valor,
  somenteLeitura,
  onGravar,
}: {
  def: DefinicaoDeCampo;
  valor: unknown;
  somenteLeitura: boolean;
  onGravar: (valor: string) => void;
}) {
  const guardado = valorParaEdicao(def.type, valor);
  const [texto, setTexto] = useState(guardado);
  // O valor guardado mudou por fora (outra pessoa, outra tela): o campo acompanha.
  useEffect(() => setTexto(guardado), [guardado]);

  const rotulo = (
    <label
      className="mb-1 block text-xs font-medium text-muted-foreground"
      htmlFor={`cf-${def.key}`}
    >
      {def.label}
    </label>
  );

  if (somenteLeitura)
    return (
      <div>
        {rotulo}
        <p className="text-sm">{valorParaExibir(def.type, valor) || "—"}</p>
      </div>
    );

  if (def.type === "select")
    return (
      <div>
        {rotulo}
        <Select
          value={texto || NENHUM}
          onValueChange={(v) => {
            const novo = v === NENHUM ? "" : v;
            setTexto(novo);
            onGravar(novo);
          }}
        >
          <SelectTrigger id={`cf-${def.key}`} className="h-9 text-sm max-sm:h-11">
            <SelectValue placeholder="Escolher" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NENHUM}>— (limpar)</SelectItem>
            {def.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );

  return (
    <div>
      {rotulo}
      <Input
        id={`cf-${def.key}`}
        type={def.type === "date" ? "date" : "text"}
        inputMode={def.type === "number" ? "decimal" : undefined}
        value={texto}
        maxLength={500}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (texto.trim() !== guardado.trim()) onGravar(texto);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-9 text-sm max-sm:h-11"
      />
    </div>
  );
}
