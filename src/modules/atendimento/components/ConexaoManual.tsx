import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { conectarNumeroManualWhatsApp } from "@/lib/whatsapp-cloud.functions";

/** Só dígitos, 5 a 30: o formato dos IDs da Meta. */
export const ehIdDaMeta = (v: string) => /^\d{5,30}$/.test(v.trim());

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

  const ligar = useMutation({
    mutationFn: () => conectar({ data: { wabaId, phoneNumberId, token } }),
    onSuccess: () => {
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
        Avançado: conexão manual (número de teste)
        <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} />
      </button>
      {aberto && (
        <div className="space-y-3 border-t p-3">
          <p className="text-xs text-muted-foreground">
            No painel da Meta, em WhatsApp → Etapa 1, reivindique o número de teste e copie o ID do
            número, o ID da conta e gere um token. O token é cifrado e nunca volta para a tela.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-waba">ID da conta do WhatsApp Business</Label>
              <Input
                id="m-waba"
                inputMode="numeric"
                value={wabaId}
                onChange={(e) => setWabaId(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-pn">ID do número (Phone Number ID)</Label>
              <Input
                id="m-pn"
                inputMode="numeric"
                value={phoneNumberId}
                onChange={(e) => setPhoneNumberId(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-token">Token de acesso</Label>
            <Input
              id="m-token"
              type="password"
              autoComplete="off"
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
