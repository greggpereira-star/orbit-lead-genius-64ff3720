import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell } from "lucide-react";
import {
  CHAVE_DO_AVISO,
  EXPLICACAO,
  estadoDoAviso,
  guardarPreferencia,
  lerPreferencia,
  permissaoAtual,
  type EstadoDoAviso,
} from "@/core/notificacoes/avisoDoNavegador";

export const Route = createFileRoute("/_app/settings/notifications")({
  component: NotificationSettings,
});

/**
 * Esta tela tinha três interruptores que não gravavam nada: acendiam, diziam
 * "Preference updated" num toast verde, e ao recarregar voltavam ao padrão.
 *
 * Dos três, só UM tinha comportamento real por trás — o aviso no navegador,
 * que já existia e era INCONDICIONAL: tocava som e notificava sempre, sem que
 * o interruptor governasse coisa alguma. Esse virou verdadeiro.
 *
 * Os outros dois continuam marcados como não disponíveis, e por motivos
 * diferentes do "ainda não construímos": e-mail depende de um servidor de
 * envio e WhatsApp de uma API, nenhum dos dois configurado neste projeto.
 * Prometer data para o que depende de decisão sua seria repetir o defeito.
 */
function NotificationSettings() {
  const [permissao, setPermissao] = useState<NotificationPermission | null>(null);
  const [quer, setQuer] = useState(true);

  /* Lido no efeito, e não no valor inicial: no servidor não há `Notification`
     nem `localStorage`, e ler na renderização daria divergência de hidratação. */
  useEffect(() => {
    setPermissao(permissaoAtual());
    try {
      setQuer(lerPreferencia(localStorage.getItem(CHAVE_DO_AVISO)));
    } catch {
      /* armazenamento bloqueado: segue o padrão */
    }
  }, []);

  const estado: EstadoDoAviso = estadoDoAviso(permissao, quer);
  const ligado = estado === "ligado";
  const travado = estado === "sem-suporte" || estado === "bloqueado";

  async function alternar(novo: boolean) {
    if (!novo) {
      setQuer(false);
      guardarPreferencia(false);
      return;
    }

    /* A permissão é pedida AQUI, no clique, e não ao abrir o painel como era
       antes: pedir sem contexto é o jeito mais rápido de levar um "bloquear",
       e bloqueio não se desfaz pelo site. */
    let atual = permissaoAtual();
    if (atual === "default") {
      try {
        atual = await Notification.requestPermission();
      } catch {
        atual = permissaoAtual();
      }
      setPermissao(atual);
    }

    if (atual === "denied") {
      toast.error("O navegador bloqueou os avisos deste site. Libere nas permissões dele.");
      return;
    }

    setQuer(true);
    guardarPreferencia(true);
  }

  return (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          Avisos
        </CardTitle>
        <CardDescription>Como e quando você recebe aviso.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5 pr-4">
            <Label htmlFor="aviso-navegador">Avisos no navegador</Label>
            <p className="text-xs text-muted-foreground">{EXPLICACAO[estado]}</p>
            <p className="text-[11px] text-muted-foreground">
              Vale só neste aparelho — a permissão é de cada navegador.
            </p>
          </div>
          <Switch
            id="aviso-navegador"
            checked={ligado}
            disabled={travado}
            onCheckedChange={(v) => void alternar(v)}
          />
        </div>

        <div className="space-y-4 border-t pt-4 opacity-60">
          {[
            {
              titulo: "Avisos por e-mail",
              descricao: "Resumo diário e avisos urgentes no seu e-mail.",
              porque: "Depende de um servidor de envio, que ainda não está configurado.",
            },
            {
              titulo: "Avisos no WhatsApp",
              descricao: "Cada lead novo chega na hora no seu WhatsApp.",
              porque: "Depende de uma API de WhatsApp, que ainda não está configurada.",
            },
          ].map(({ titulo, descricao, porque }) => (
            <div key={titulo} className="flex items-center justify-between">
              <div className="space-y-0.5 pr-4">
                <Label>{titulo}</Label>
                <p className="text-xs text-muted-foreground">{descricao}</p>
                <p className="text-[11px] text-muted-foreground">{porque}</p>
              </div>
              <Switch checked={false} disabled aria-label={`${titulo} — ainda não disponível`} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
