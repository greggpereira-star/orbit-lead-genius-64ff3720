import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  agendarMensagemWhatsApp,
  cancelarMensagemAgendadaWhatsApp,
} from "@/lib/whatsapp-atendimento.functions";
import { useAgendadas } from "../hooks/useAtendimento";
import { janelaDaConversa, type ConversaDaLista } from "../lib/conversas";

/** `datetime-local` quer "AAAA-MM-DDTHH:mm" no fuso do navegador. */
function paraCampo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function AgendarMensagem(props: {
  conversa: ConversaDaLista;
  aberto: boolean;
  onFechar: () => void;
}) {
  const { conversa } = props;
  const qc = useQueryClient();
  const agendadas = useAgendadas(props.aberto ? conversa.id : null);
  const agendar = useServerFn(agendarMensagemWhatsApp);
  const cancelar = useServerFn(cancelarMensagemAgendadaWhatsApp);

  const [texto, setTexto] = useState("");
  const [quando, setQuando] = useState(() => paraCampo(new Date(Date.now() + 3600_000)));

  const recarregar = () => qc.invalidateQueries({ queryKey: ["wa-agendadas", conversa.id] });

  const aoAgendar = useMutation({
    mutationFn: () =>
      agendar({
        data: { conversaId: conversa.id, texto, enviarEm: new Date(quando).toISOString() },
      }),
    onSuccess: () => {
      toast.success("Mensagem agendada.");
      setTexto("");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const aoCancelar = useMutation({
    mutationFn: (id: string) => cancelar({ data: { id } }),
    onSuccess: () => {
      toast.success("Agendamento cancelado.");
      recarregar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // A política vale na hora do envio: avisa se o horário cai fora da janela de 24h.
  const janela = janelaDaConversa(conversa);
  const horario = Date.parse(quando);
  const foraDaJanela =
    Number.isFinite(horario) && (!janela.aberta || horario > Date.now() + (janela.restanteMs ?? 0));
  const optedOut = Boolean(conversa.contact?.opted_out_at);

  return (
    <Dialog open={props.aberto} onOpenChange={(v) => !v && props.onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" /> Agendar mensagem
          </DialogTitle>
          <DialogDescription>
            Sai sozinha no horário escolhido, com as mesmas regras de qualquer mensagem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            rows={4}
            maxLength={4096}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva a mensagem…"
            aria-label="Texto da mensagem agendada"
          />
          <div className="flex items-center gap-2">
            <Input
              type="datetime-local"
              value={quando}
              onChange={(e) => setQuando(e.target.value)}
              aria-label="Quando enviar"
              className="max-w-[240px]"
            />
          </div>
          {optedOut && (
            <p className="rounded-md bg-destructive/10 p-2 text-xs text-destructive">
              Este contato pediu para não receber mensagens: nada será enviado.
            </p>
          )}
          {!optedOut && foraDaJanela && (
            <p className="rounded-md bg-[var(--aviso)]/15 p-2 text-xs">
              Neste horário a janela de 24 h estará fechada e uma mensagem livre não sai (só
              template). Se o cliente não escrever antes, ela será marcada como não enviada.
            </p>
          )}
        </div>

        {(agendadas.data ?? []).length > 0 && (
          <ul className="space-y-1.5 border-t pt-3">
            {(agendadas.data ?? []).map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between gap-2 rounded-md bg-muted/50 p-2 text-xs"
              >
                <span className="min-w-0">
                  <span className="block font-medium tabular-nums">
                    {new Date(m.send_at).toLocaleString("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    {m.status === "failed" && (
                      <span className="ml-2 font-normal text-destructive">não enviada</span>
                    )}
                  </span>
                  <span className="block truncate text-muted-foreground">{m.body}</span>
                  {m.status === "failed" && m.result && (
                    <span className="block text-destructive">{m.result}</span>
                  )}
                </span>
                {m.status === "pending" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    aria-label="Cancelar agendamento"
                    disabled={aoCancelar.isPending}
                    onClick={() => aoCancelar.mutate(m.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={props.onFechar}>
            Fechar
          </Button>
          <Button
            disabled={aoAgendar.isPending || !texto.trim() || !Number.isFinite(horario)}
            onClick={() => aoAgendar.mutate()}
          >
            Agendar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
