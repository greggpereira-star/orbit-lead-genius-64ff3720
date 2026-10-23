import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  atualizarCampo,
  criarCampo,
  listarCampos,
} from "@/modules/crm/services/customFieldService";
import {
  TIPOS,
  chaveUnica,
  erroDaDefinicao,
  opcoesDeTexto,
  variavelDaAutomacao,
  type DefinicaoDeCampo,
  type TipoDeCampo,
} from "@/modules/crm/lib/camposPersonalizados";

export const Route = createFileRoute("/_app/settings/campos")({
  head: () => ({ meta: [{ title: "Campos personalizados — Configurações" }] }),
  component: CamposPage,
});

function CamposPage() {
  const { company, membership } = useAuth();
  const companyId = company?.id;
  const podeEditar = membership?.role === "owner" || membership?.role === "admin";
  const qc = useQueryClient();

  const campos = useQuery({
    queryKey: ["custom-field-defs-todos", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listarCampos(companyId as string, true),
  });
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["custom-field-defs-todos", companyId] });
    void qc.invalidateQueries({ queryKey: ["custom-field-defs", companyId] });
  };

  const [rotulo, setRotulo] = useState("");
  const [tipo, setTipo] = useState<TipoDeCampo>("text");
  const [opcoesTexto, setOpcoesTexto] = useState("");

  const criar = useMutation({
    mutationFn: async () => {
      const opcoes = opcoesDeTexto(opcoesTexto);
      const erro = erroDaDefinicao({ label: rotulo, type: tipo, options: opcoes });
      if (erro) throw new Error(erro);
      const existentes = (campos.data ?? []).map((c) => c.key);
      await criarCampo({
        companyId: companyId as string,
        key: chaveUnica(rotulo, existentes),
        label: rotulo,
        type: tipo,
        options: opcoes,
        position: (campos.data ?? []).length,
      });
    },
    onSuccess: () => {
      setRotulo("");
      setOpcoesTexto("");
      setTipo("text");
      recarregar();
      toast.success("Campo criado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const atualizar = useMutation({
    mutationFn: (v: { id: string; patch: Parameters<typeof atualizarCampo>[1] }) =>
      atualizarCampo(v.id, v.patch),
    onSuccess: recarregar,
    onError: (e: Error) => toast.error(e.message),
  });

  if (!companyId) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <SlidersHorizontal className="h-5 w-5" /> Campos personalizados
        </h2>
        <p className="text-sm text-muted-foreground">
          Dados que só o seu negócio tem (curso de interesse, orçamento, turno…). Aparecem na ficha
          do lead e no painel da conversa, e servem de condição e de texto nas automações.
        </p>
      </div>

      {!podeEditar && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Só administradores criam ou mudam campos. Qualquer atendente preenche os campos nos leads.
        </p>
      )}

      {podeEditar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo campo</CardTitle>
            <CardDescription>O tipo e a chave não mudam depois de criados.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
              <div className="space-y-1">
                <Label htmlFor="campo-nome" className="text-xs">
                  Nome
                </Label>
                <Input
                  id="campo-nome"
                  value={rotulo}
                  maxLength={60}
                  onChange={(e) => setRotulo(e.target.value)}
                  placeholder="Ex.: Curso de interesse"
                  className="h-10"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={tipo} onValueChange={(v) => setTipo(v as TipoDeCampo)}>
                  <SelectTrigger className="h-10" aria-label="Tipo do campo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS.map((t) => (
                      <SelectItem key={t.valor} value={t.valor}>
                        {t.rotulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {tipo === "select" && (
              <div className="space-y-1">
                <Label htmlFor="campo-opcoes" className="text-xs">
                  Opções (uma por linha)
                </Label>
                <Textarea
                  id="campo-opcoes"
                  rows={4}
                  value={opcoesTexto}
                  onChange={(e) => setOpcoesTexto(e.target.value)}
                  placeholder={"Manhã\nTarde\nNoite"}
                />
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {rotulo.trim() ? (
                  <>
                    Nas automações:{" "}
                    <code>
                      {variavelDaAutomacao(
                        chaveUnica(
                          rotulo,
                          (campos.data ?? []).map((c) => c.key),
                        ),
                      )}
                    </code>
                  </>
                ) : (
                  "A chave para as automações aparece aqui."
                )}
              </p>
              <Button
                className="h-10"
                disabled={criar.isPending || !rotulo.trim()}
                onClick={() => criar.mutate()}
              >
                {criar.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-1.5 h-4 w-4" />
                )}
                Criar campo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Campos da empresa</CardTitle>
        </CardHeader>
        <CardContent>
          {campos.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (campos.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum campo criado ainda.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {(campos.data ?? []).map((c) => (
                <LinhaDoCampo
                  key={c.id}
                  campo={c}
                  podeEditar={podeEditar}
                  onRenomear={(label) => atualizar.mutate({ id: c.id, patch: { label } })}
                  onAtivar={(active) => atualizar.mutate({ id: c.id, patch: { active } })}
                  onOpcoes={(options) => atualizar.mutate({ id: c.id, patch: { options } })}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LinhaDoCampo({
  campo,
  podeEditar,
  onRenomear,
  onAtivar,
  onOpcoes,
}: {
  campo: DefinicaoDeCampo;
  podeEditar: boolean;
  onRenomear: (label: string) => void;
  onAtivar: (ativo: boolean) => void;
  onOpcoes: (opcoes: string[]) => void;
}) {
  const [nome, setNome] = useState(campo.label);
  const [opcoes, setOpcoes] = useState(campo.options.join("\n"));
  const tipo = TIPOS.find((t) => t.valor === campo.type)?.rotulo ?? campo.type;
  return (
    <li className="space-y-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {podeEditar ? (
          <Input
            value={nome}
            maxLength={60}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => nome.trim() && nome.trim() !== campo.label && onRenomear(nome)}
            className="h-10 min-w-0 flex-1"
            aria-label={`Nome do campo ${campo.label}`}
          />
        ) : (
          <span className="min-w-0 flex-1 text-sm font-medium">{campo.label}</span>
        )}
        <Badge variant="secondary">{tipo}</Badge>
        {podeEditar && (
          <div className="flex items-center gap-2">
            <Switch
              checked={campo.active}
              onCheckedChange={onAtivar}
              aria-label={`${campo.label}: ${campo.active ? "ativo" : "inativo"}`}
            />
            <span className="w-14 text-xs text-muted-foreground">
              {campo.active ? "Ativo" : "Inativo"}
            </span>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        Nas automações: <code>{variavelDaAutomacao(campo.key)}</code>
      </p>
      {campo.type === "select" && podeEditar && (
        <div className="space-y-1">
          <Label className="text-xs">Opções (uma por linha)</Label>
          <Textarea
            rows={3}
            value={opcoes}
            onChange={(e) => setOpcoes(e.target.value)}
            onBlur={() => {
              const novas = opcoesDeTexto(opcoes);
              if (novas.length >= 2 && novas.join("\n") !== campo.options.join("\n"))
                onOpcoes(novas);
              else if (novas.length < 2) setOpcoes(campo.options.join("\n"));
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Tirar uma opção não apaga o que já foi preenchido com ela nos leads.
          </p>
        </div>
      )}
    </li>
  );
}
