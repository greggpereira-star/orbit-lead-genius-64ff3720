import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { conectarNumeroManualWhatsApp } from "@/lib/whatsapp-cloud.functions";
import { useConexoes } from "@/modules/conexoes/hooks";

/** Só dígitos, 5 a 30: o formato dos IDs da Meta. */
export const ehIdDaMeta = (v: string) => /^\d{5,30}$/.test(v.trim());

const CHAVE_DOS_IDS = "wa-conexao-manual-ids";

/**
 * Os IDs não são segredo (o token é). Ficam guardados no navegador para que renovar o token não
 * obrigue a digitar tudo de novo; o que vale é sempre o que está nos campos ao conectar.
 */
export function lerIdsGuardados(
  armazem: Pick<Storage, "getItem"> | null,
): { wabaId: string; phoneNumberId: string } | null {
  try {
    const bruto = armazem?.getItem(CHAVE_DOS_IDS);
    if (!bruto) return null;
    const j = JSON.parse(bruto) as { wabaId?: unknown; phoneNumberId?: unknown };
    const wabaId = typeof j.wabaId === "string" ? j.wabaId : "";
    const phoneNumberId = typeof j.phoneNumberId === "string" ? j.phoneNumberId : "";
    return ehIdDaMeta(wabaId) && ehIdDaMeta(phoneNumberId) ? { wabaId, phoneNumberId } : null;
  } catch {
    return null;
  }
}

export function guardarIds(
  armazem: Pick<Storage, "setItem"> | null,
  ids: { wabaId: string; phoneNumberId: string },
) {
  try {
    if (ehIdDaMeta(ids.wabaId) && ehIdDaMeta(ids.phoneNumberId))
      armazem?.setItem(
        CHAVE_DOS_IDS,
        JSON.stringify({ wabaId: ids.wabaId.trim(), phoneNumberId: ids.phoneNumberId.trim() }),
      );
  } catch {
    /* navegador sem armazenamento: só não lembra */
  }
}

const armazemLocal = () => (typeof window === "undefined" ? null : window.localStorage);

/**
 * Conexão manual: para o número de teste da Meta (ou quem já tem a conta e o
 * token). O Embedded Signup continua sendo o caminho normal; este serve para
 * testar o atendimento sem depender dele.
 */
export function ConexaoManual({ onConectado }: { onConectado: () => void }) {
  const conectar = useServerFn(conectarNumeroManualWhatsApp);
  const [aberto, setAberto] = useState(false);
  const [wabaId, setWabaId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [token, setToken] = useState("");

  // Conexões oficiais que já existem: escolher uma preenche os IDs e sobra só o token.
  const existentes = (useConexoes().data ?? []).filter(
    (c) => c.tipo === "oficial" && c.oficial?.wabaId,
  );

  useEffect(() => {
    const g = lerIdsGuardados(armazemLocal());
    if (g) {
      setWabaId((v) => v || g.wabaId);
      setPhoneNumberId((v) => v || g.phoneNumberId);
    }
  }, []);

  const ligar = useMutation({
    mutationFn: () => conectar({ data: { wabaId, phoneNumberId, token } }),
    onSuccess: () => {
      guardarIds(armazemLocal(), { wabaId, phoneNumberId });
      // O token sai da memória da tela assim que a conexão é feita.
      setToken("");
      toast.success("Número conectado.");
      onConectado();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pronto = ehIdDaMeta(wabaId) && ehIdDaMeta(phoneNumberId) && token.trim().length >= 20;

  return (
    <div className="rounded-md border">
      <button
        type="button"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
      >
        Avançado: conexão manual (número de teste ou outra conta)
        <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div className="space-y-3 border-t p-3">
          <p className="text-xs text-muted-foreground">
            No painel da Meta, em WhatsApp → Etapa 1, reivindique o número de teste e copie o ID do
            número, o ID da conta e gere um token. O token é cifrado e nunca volta para a tela.
          </p>
          {existentes.length > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="m-existente">Renovar o token de uma conexão existente</Label>
              <select
                id="m-existente"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={existentes.find((c) => c.oficial?.phoneNumberId === phoneNumberId)?.id ?? ""}
                onChange={(e) => {
                  const c = existentes.find((x) => x.id === e.target.value);
                  if (c?.oficial?.wabaId) {
                    setWabaId(c.oficial.wabaId);
                    setPhoneNumberId(c.oficial.phoneNumberId);
                  }
                }}
              >
                <option value="">Outra conta ou número (digitar os IDs)</option>
                {existentes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                    {c.telefone ? ` · ${c.telefone}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-waba">ID da conta do WhatsApp Business</Label>
              <Input
                id="m-waba"
                name="wa-manual-waba-id"
                inputMode="numeric"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-pn">ID do número (Phone Number ID)</Label>
              <Input
                id="m-pn"
                name="wa-manual-phone-number-id"
                inputMode="numeric"
                autoComplete="off"
                data-1p-ignore
                data-lpignore="true"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-token">Token de acesso</Label>
            <Input
              id="m-token"
              name="wa-manual-access-token"
              type="password"
              // "off" o Chrome ignora em campo de senha e preenche com a senha salva do usuário
              // (e e-mail no campo ao lado): o token é uma chave de API, não uma senha de login.
              autoComplete="new-password"
              data-1p-ignore
              data-lpignore="true"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <Button disabled={!pronto || ligar.isPending} onClick={() => ligar.mutate()}>
            {ligar.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Conectar
          </Button>
        </div>
      )}
    </div>
  );
}
