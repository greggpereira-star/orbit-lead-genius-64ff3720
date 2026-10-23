import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Clock, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/core/auth/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AGENDA_PADRAO,
  DIAS,
  FUSO_PADRAO,
  dataBr,
  dentroDoHorario,
  feriadosNacionais,
  validarAgenda,
  type Agenda,
  type ChaveDoDia,
} from "@/modules/horarios/horarios";

export const Route = createFileRoute("/_app/settings/horarios")({
  head: () => ({ meta: [{ title: "Horário de atendimento — Configurações" }] }),
  component: HorariosPage,
});

/* eslint-disable @typescript-eslint/no-explicit-any */
const db = () => supabase as any;

interface Feriado {
  id: string;
  day: string;
  name: string;
}

function HorariosPage() {
  const { company, membership } = useAuth();
  const companyId = company?.id;
  const podeEditar = membership?.role === "owner" || membership?.role === "admin";
  const qc = useQueryClient();

  const horario = useQuery({
    queryKey: ["horario-de-atendimento", companyId],
    enabled: Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await db()
        .from("company_business_hours")
        .select("enabled,timezone,schedule")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data ?? null) as { enabled: boolean; timezone: string; schedule: Agenda } | null;
    },
  });

  const feriados = useQuery({
    queryKey: ["feriados", companyId],
    enabled: Boolean(companyId),
    queryFn: async (): Promise<Feriado[]> => {
      const { data, error } = await db()
        .from("company_holidays")
        .select("id,day,name")
        .eq("company_id", companyId)
        .order("day");
      if (error) throw new Error(error.message);
      return (data ?? []) as Feriado[];
    },
  });

  const [ativo, setAtivo] = useState(false);
  const [agenda, setAgenda] = useState<Agenda>(AGENDA_PADRAO);
  useEffect(() => {
    if (horario.isLoading) return;
    setAtivo(horario.data?.enabled ?? false);
    setAgenda(
      horario.data?.schedule && Object.keys(horario.data.schedule).length
        ? horario.data.schedule
        : AGENDA_PADRAO,
    );
  }, [horario.isLoading, horario.data]);

  const erros = useMemo(() => validarAgenda(agenda), [agenda]);
  const timezone = horario.data?.timezone ?? FUSO_PADRAO;
  const diasDeFeriado = (feriados.data ?? []).map((f) => f.day);
  const agoraDentro = dentroDoHorario(
    { enabled: ativo, timezone, schedule: agenda },
    diasDeFeriado,
  );

  const salvar = useMutation({
    mutationFn: async () => {
      if (Object.keys(erros).length)
        throw new Error("Corrija os horários marcados antes de salvar.");
      const { error } = await db()
        .from("company_business_hours")
        .upsert(
          {
            company_id: companyId,
            enabled: ativo,
            timezone,
            schedule: agenda,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "company_id" },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Horário de atendimento salvo.");
      void qc.invalidateQueries({ queryKey: ["horario-de-atendimento", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [dia, setDia] = useState("");
  const [nome, setNome] = useState("");
  const adicionar = useMutation({
    mutationFn: async (linhas: Array<{ day: string; name: string }>) => {
      const { error } = await db()
        .from("company_holidays")
        .upsert(
          linhas.map((l) => ({ company_id: companyId, day: l.day, name: l.name.trim() })),
          { onConflict: "company_id,day", ignoreDuplicates: true },
        );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setDia("");
      setNome("");
      void qc.invalidateQueries({ queryKey: ["feriados", companyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db()
        .from("company_holidays")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["feriados", companyId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const anoAtual = new Date().getFullYear();
  const mudarDia = (chave: ChaveDoDia, patch: Partial<{ abre: string; fecha: string }> | null) =>
    setAgenda((a) => {
      const novo = { ...a };
      if (patch === null) delete novo[chave];
      else
        novo[chave] = {
          abre: novo[chave]?.abre ?? "08:00",
          fecha: novo[chave]?.fecha ?? "18:00",
          ...patch,
        };
      return novo;
    });

  if (!companyId) return <div className="text-sm text-muted-foreground">Carregando…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Clock className="h-5 w-5" /> Horário de atendimento
        </h2>
        <p className="text-sm text-muted-foreground">
          Define quando a equipe atende. Cada evento de automação passa a trazer o campo{" "}
          <b>dentro_do_horario</b> (true/false): use como condição para, por exemplo, avisar o
          cliente que escreveu fora do expediente.
        </p>
      </div>

      {!podeEditar && (
        <p className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Só administradores alteram o horário. Você pode ver como está configurado.
        </p>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-base">Expediente</CardTitle>
              <CardDescription>
                Fuso: {timezone.replace("_", " ")}. Desligado, a empresa conta como sempre aberta.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="horario-ativo" className="text-sm">
                Controlar horário
              </Label>
              <Switch
                id="horario-ativo"
                checked={ativo}
                onCheckedChange={setAtivo}
                disabled={!podeEditar}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {DIAS.map(({ chave, nome: nomeDoDia, curto }) => {
            const d = agenda[chave];
            return (
              <div
                key={chave}
                className="grid grid-cols-[6.5rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[10rem_1fr]"
              >
                <div className="flex items-center gap-2">
                  <Switch
                    checked={Boolean(d)}
                    onCheckedChange={(v) => mudarDia(chave, v ? {} : null)}
                    disabled={!podeEditar || !ativo}
                    aria-label={`${nomeDoDia} aberto`}
                  />
                  <span className="text-sm font-medium">
                    <span className="sm:hidden">{curto}</span>
                    <span className="hidden sm:inline">{nomeDoDia}</span>
                  </span>
                </div>
                {d ? (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={d.abre}
                      onChange={(e) => mudarDia(chave, { abre: e.target.value })}
                      disabled={!podeEditar || !ativo}
                      className="h-10 w-32"
                      aria-label={`${nomeDoDia}: abre`}
                    />
                    <span className="text-sm text-muted-foreground">às</span>
                    <Input
                      type="time"
                      value={d.fecha}
                      onChange={(e) => mudarDia(chave, { fecha: e.target.value })}
                      disabled={!podeEditar || !ativo}
                      className="h-10 w-32"
                      aria-label={`${nomeDoDia}: fecha`}
                    />
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Fechado</span>
                )}
                {erros[chave] && (
                  <p className="col-span-2 text-xs text-destructive">{erros[chave]}</p>
                )}
              </div>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className="text-sm">
              Agora:{" "}
              <b className={agoraDentro ? "text-[var(--sucesso)]" : "text-[var(--aviso)]"}>
                {agoraDentro ? "dentro do horário" : "fora do horário"}
              </b>
              {!ativo && <span className="text-muted-foreground"> (horário desligado)</span>}
            </p>
            {podeEditar && (
              <Button
                onClick={() => salvar.mutate()}
                disabled={salvar.isPending || Object.keys(erros).length > 0}
              >
                {salvar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar horário
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Feriados</CardTitle>
          <CardDescription>
            Nesses dias a empresa conta como fechada, mesmo que o dia da semana esteja aberto.
            Feriado estadual e municipal você acrescenta à mão.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {podeEditar && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label htmlFor="feriado-dia" className="text-xs">
                  Data
                </Label>
                <Input
                  id="feriado-dia"
                  type="date"
                  value={dia}
                  onChange={(e) => setDia(e.target.value)}
                  className="h-10 w-44"
                />
              </div>
              <div className="min-w-[10rem] flex-1 space-y-1">
                <Label htmlFor="feriado-nome" className="text-xs">
                  Nome
                </Label>
                <Input
                  id="feriado-nome"
                  value={nome}
                  maxLength={80}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Ex.: Aniversário da cidade"
                  className="h-10"
                />
              </div>
              <Button
                className="h-10"
                disabled={!dia || !nome.trim() || adicionar.isPending}
                onClick={() => adicionar.mutate([{ day: dia, name: nome }])}
              >
                Adicionar
              </Button>
            </div>
          )}

          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              {[anoAtual, anoAtual + 1].map((ano) => (
                <Button
                  key={ano}
                  variant="outline"
                  size="sm"
                  disabled={adicionar.isPending}
                  onClick={() => {
                    adicionar.mutate(feriadosNacionais(ano));
                    toast.success(
                      `Feriados nacionais de ${ano} adicionados (os que já existiam foram mantidos).`,
                    );
                  }}
                >
                  <CalendarPlus className="mr-1.5 h-4 w-4" /> Feriados nacionais de {ano}
                </Button>
              ))}
            </div>
          )}

          {feriados.isLoading ? (
            <p className="text-sm text-muted-foreground">Carregando…</p>
          ) : (feriados.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum feriado cadastrado.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {(feriados.data ?? []).map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-sm">
                    <span className="tabular-nums text-muted-foreground">{dataBr(f.day)}</span> ·{" "}
                    {f.name}
                  </span>
                  {podeEditar && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 max-sm:h-11 max-sm:w-11"
                      onClick={() => remover.mutate(f.id)}
                      aria-label={`Remover ${f.name}`}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
