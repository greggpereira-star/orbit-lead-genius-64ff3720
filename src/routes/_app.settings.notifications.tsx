import { createFileRoute } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/_app/settings/notifications")({
  component: NotificationSettings,
});

/**
 * Os três interruptores desta tela não gravavam nada.
 *
 * Acendiam, mostravam um toast verde dizendo "Preference updated", e ao
 * recarregar a página voltavam ao padrão. Não existe tabela, serviço nem
 * coluna por trás — procurei.
 *
 * O dano não é o clique perdido: é a crença. Quem ligasse "Avisos no WhatsApp"
 * passaria a contar com um aviso a cada lead novo, e o aviso nunca viria. Um
 * interruptor que mente custa mais caro que um interruptor que falta, porque
 * ninguém vai procurar o que já acha que configurou.
 *
 * Ficam visíveis e DESLIGADOS, para a tela continuar dizendo o que o produto
 * pretende oferecer, sem afirmar que já oferece.
 */
function NotificationSettings() {
  const avisos = [
    {
      titulo: "Avisos por e-mail",
      descricao: "Resumo diário e avisos urgentes no seu e-mail.",
    },
    {
      titulo: "Avisos no WhatsApp",
      descricao: "Cada lead novo chega na hora no seu WhatsApp.",
    },
    {
      titulo: "Avisos no navegador",
      descricao: "Notificação na área de trabalho quando entrar lead novo.",
    },
  ];

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
        <div className="rounded-lg border border-dashed p-4 text-center">
          <p className="text-sm font-medium">Ainda não disponível</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Nenhum destes avisos está construído. Os interruptores ficam desligados até existir
            envio de verdade por trás.
          </p>
        </div>

        <div className="space-y-4 opacity-60">
          {avisos.map(({ titulo, descricao }, i) => (
            <div
              key={titulo}
              className={`flex items-center justify-between${i > 0 ? " border-t pt-4" : ""}`}
            >
              <div className="space-y-0.5">
                <Label>{titulo}</Label>
                <p className="text-xs text-muted-foreground">{descricao}</p>
              </div>
              <Switch checked={false} disabled aria-label={`${titulo} — ainda não disponível`} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
