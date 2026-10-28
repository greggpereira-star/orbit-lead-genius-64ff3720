import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Compass, Loader2, Settings2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/core/auth/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  alternarRegraDeOrigem,
  criarRegraDeOrigem,
  removerRegraDeOrigem,
} from "@/lib/origem.functions";
import {
  CANAIS_ATRIBUIVEIS,
  NAO_RASTREADO,
  fatiasDeCanal,
  rotuloDoCanal,
  type CanalAtribuivel,
} from "@/modules/analytics/lib/canais";
import {
  aplicarRegrasDeOrigem,
  definirOrigemDoLead,
  leadsNaoRastreados,
  listarRegrasDeOrigem,
  origemDosLeads,
} from "@/modules/analytics/services/origemService";

/**
 * De onde vieram os leads, por canal — e quais ainda não sabemos.
 *
 * O canal é DERIVADO no banco da prova que existe (clique, gclid, anúncio da
 * Meta…). "Não rastreado" é o que sobra sem nenhuma prova: aqui a equipe atribui
 * o canal à mão ou cria uma regra por mensagem ("vim pelo Instagram"). Atribuição
 * nunca troca uma prova de anúncio.
 */
const LIMITE_INICIAL = 50;
/** Teto da função do banco (`leads_nao_rastreados` limita a 200). */
const LIMITE_MAXIMO = 200;

/** `dias` vem da página (período único). */
export function OrigemDosLeadsCard({ companyId, dias }: { companyId: string; dias: string }) {
  const { membership } = useAuth();
  const souAdmin = membership?.role === "owner" || membership?.role === "admin";
  const podeEditar = membership?.role !== "viewer";
  const [regras, setRegras] = useState(false);
  // A lista de não rastreados começa em 50 e cresce de 50 em 50 até o teto do banco (200).
  const [limite, setLimite] = useState(LIMITE_INICIAL);
  const qc = useQueryClient();
  const recarregar = () => {
    void qc.invalidateQueries({ queryKey: ["origem-dos-leads"] });
    void qc.invalidateQueries({ queryKey: ["leads-nao-rastreados"] });
  };

  const canais = useQuery({
    queryKey: ["origem-dos-leads", companyId, dias],
    queryFn: () => origemDosLeads(companyId, Number(dias)),
    enabled: Boolean(companyId),
  });
  const resumo = useMemo(() => fatiasDeCanal(canais.data ?? []), [canais.data]);

  const orfaos = useQuery({
    queryKey: ["leads-nao-rastreados", companyId, dias, limite],
    queryFn: () => leadsNaoRastreados(companyId, Number(dias), limite),
    enabled: Boolean(companyId) && resumo.naoRastreados > 0,
    // Mantém a lista na tela enquanto carrega mais, em vez de piscar o carregando.
    placeholderData: (anterior) => anterior,
  });

  const atribuir = useMutation({
    mutationFn: (v: { leadId: string; canal: CanalAtribuivel }) =>
      definirOrigemDoLead(v.leadId, v.canal),
    onSuccess: () => {
      toast.success("Origem definida.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle as="h2" className="flex items-center gap-2">
              <Compass className="h-4 w-4 text-primary" />
              Origem por canal
            </CardTitle>
            <CardDescription>
              De onde vieram os leads do período e quantos ainda não têm origem comprovada.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {podeEditar && (
              <Button
                variant="outline"
                size="sm"
                className="h-11 md:h-8"
                onClick={() => setRegras(true)}
              >
                <Settings2 className="mr-1 h-4 w-4" /> Regras por mensagem
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {canais.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        )}
        {canais.isError && (
          <p className="text-sm text-destructive">Não foi possível carregar a origem agora.</p>
        )}
        {!canais.isLoading && !canais.isError && resumo.total === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum lead no período.</p>
        )}

        {resumo.total > 0 && (
          <ul className="space-y-2">
            {resumo.fatias.map((f) => {
              const alerta = f.canal === NAO_RASTREADO;
              return (
                <li key={f.canal} className="text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className={alerta ? "flex items-center gap-1 font-medium" : ""}>
                      {alerta && (
                        <AlertTriangle className="h-3.5 w-3.5 text-[var(--aviso)]" aria-hidden />
                      )}
                      {rotuloDoCanal(f.canal)}
                    </span>
                    <span className="tabular-nums">
                      <strong>{f.leads}</strong>{" "}
                      <span className="text-muted-foreground">
                        ({f.percentual.toLocaleString("pt-BR")}%)
                      </span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded bg-muted">
                    <div
                      className={`h-1.5 rounded ${alerta ? "bg-[var(--aviso)]" : "bg-primary"}`}
                      style={{ width: `${Math.max(2, f.percentual)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {resumo.naoRastreados > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Leads não rastreados ({resumo.naoRastreados})</h3>
            {orfaos.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <ul className="divide-y rounded-md border">
                {(orfaos.data ?? []).map((l) => (
                  <li key={l.lead_id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                    <div className="min-w-[14rem] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{l.name || "Sem nome"}</span>
                        {l.source && <Badge variant="outline">{l.source}</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(l.created_at).toLocaleDateString("pt-BR")}
                        {l.stage_name ? ` · ${l.stage_name}` : ""}
                      </div>
                      {l.mensagens && (
                        <p className="mt-1 line-clamp-2 text-xs italic text-muted-foreground">
                          “{l.mensagens}”
                        </p>
                      )}
                    </div>
                    {podeEditar && (
                      <Select
                        onValueChange={(v) =>
                          atribuir.mutate({ leadId: l.lead_id, canal: v as CanalAtribuivel })
                        }
                        disabled={atribuir.isPending}
                      >
                        <SelectTrigger
                          className="h-11 w-48 md:h-8"
                          aria-label={`Definir origem de ${l.name ?? "lead"}`}
                        >
                          <SelectValue placeholder="Definir origem…" />
                        </SelectTrigger>
                        <SelectContent>
                          {CANAIS_ATRIBUIVEIS.map((c) => (
                            <SelectItem key={c} value={c}>
                              {rotuloDoCanal(c)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {(orfaos.data?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  Mostrando {orfaos.data?.length} de {resumo.naoRastreados}.
                  {limite >= LIMITE_MAXIMO && resumo.naoRastreados > (orfaos.data?.length ?? 0) && (
                    <>
                      {" "}
                      São os {LIMITE_MAXIMO} mais recentes; escolha um período menor para ver os
                      demais.
                    </>
                  )}
                </span>
                {limite < LIMITE_MAXIMO && resumo.naoRastreados > (orfaos.data?.length ?? 0) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 md:h-8"
                    disabled={orfaos.isFetching}
                    onClick={() => setLimite((l) => Math.min(LIMITE_MAXIMO, l + LIMITE_INICIAL))}
                  >
                    {orfaos.isFetching && (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                    )}{" "}
                    Mostrar mais
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>

      <RegrasDeOrigem
        aberto={regras}
        aoFechar={() => setRegras(false)}
        companyId={companyId}
        souAdmin={souAdmin}
        aoMudar={recarregar}
      />
    </Card>
  );
}

function RegrasDeOrigem({
  aberto,
  aoFechar,
  companyId,
  souAdmin,
  aoMudar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  companyId: string;
  souAdmin: boolean;
  aoMudar: () => void;
}) {
  const qc = useQueryClient();
  const criar = useServerFn(criarRegraDeOrigem);
  const alternar = useServerFn(alternarRegraDeOrigem);
  const remover = useServerFn(removerRegraDeOrigem);
  const [padrao, setPadrao] = useState("");
  const [canal, setCanal] = useState<CanalAtribuivel>("instagram_organico");

  const lista = useQuery({
    queryKey: ["regras-de-origem", companyId],
    queryFn: () => listarRegrasDeOrigem(companyId),
    enabled: aberto && Boolean(companyId),
  });
  const refaz = () => qc.invalidateQueries({ queryKey: ["regras-de-origem", companyId] });
  const erro = (e: Error) => toast.error(e.message);

  const nova = useMutation({
    mutationFn: () => criar({ data: { padrao, canal } }),
    onSuccess: () => {
      setPadrao("");
      void refaz();
    },
    onError: erro,
  });
  const liga = useMutation({
    mutationFn: (v: { id: string; ativa: boolean }) => alternar({ data: v }),
    onSuccess: () => void refaz(),
    onError: erro,
  });
  const apaga = useMutation({
    mutationFn: (id: string) => remover({ data: { id } }),
    onSuccess: () => void refaz(),
    onError: erro,
  });
  const aplica = useMutation({
    mutationFn: () => aplicarRegrasDeOrigem(companyId),
    onSuccess: (n) => {
      toast.success(
        n === 0 ? "Nenhuma conversa casou com as regras." : `${n} lead(s) classificado(s).`,
      );
      aoMudar();
    },
    onError: erro,
  });

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Regras de origem por mensagem</DialogTitle>
          <DialogDescription>
            Quando um lead sem origem comprovada escreve uma frase que contém o texto da regra (sem
            diferenciar maiúsculas nem acentos), ele recebe o canal da regra. Vale a primeira regra
            da lista. Anúncio e clique comprovados nunca são trocados.
          </DialogDescription>
        </DialogHeader>

        <ul className="divide-y rounded-md border">
          {(lista.data ?? []).length === 0 && !lista.isLoading && (
            <li className="p-3 text-sm text-muted-foreground">Nenhuma regra ainda.</li>
          )}
          {(lista.data ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-3 p-3 text-sm">
              <div className="min-w-0 flex-1">
                <span className="font-medium">“{r.padrao}”</span>
                <span className="text-muted-foreground"> → {rotuloDoCanal(r.canal)}</span>
              </div>
              {souAdmin && (
                <>
                  <Switch
                    checked={r.ativa}
                    aria-label={`Regra ${r.padrao} ativa`}
                    onCheckedChange={(v) => liga.mutate({ id: r.id, ativa: v })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remover regra"
                    onClick={() => apaga.mutate(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>

        {souAdmin ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Input
                className="min-w-[12rem] flex-1"
                placeholder='Texto da mensagem, ex.: "vim pelo instagram"'
                value={padrao}
                maxLength={80}
                onChange={(e) => setPadrao(e.target.value)}
              />
              <Select value={canal} onValueChange={(v) => setCanal(v as CanalAtribuivel)}>
                <SelectTrigger className="w-48" aria-label="Canal da regra">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CANAIS_ATRIBUIVEIS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {rotuloDoCanal(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={padrao.trim().length < 2 || nova.isPending}
                onClick={() => nova.mutate()}
              >
                Adicionar
              </Button>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              <span>
                Aplicar as regras às conversas que já estão na base (só leads ainda não rastreados).
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={aplica.isPending}
                onClick={() => aplica.mutate()}
              >
                {aplica.isPending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Aplicar
                agora
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Apenas dono ou administrador edita as regras.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
