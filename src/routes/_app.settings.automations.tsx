import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Zap, ArrowRightLeft, History } from "lucide-react";

export const Route = createFileRoute("/_app/settings/automations")({
  component: AutomationSettings,
});

/**
 * Esta tela era inteira de mentira, e cada pedaço de um jeito diferente.
 *
 * 1. "Automações executadas" listava quatro execuções FIXAS, escritas no
 *    código — inclusive uma FALHANDO com "Invalid Access Token". Quem lesse
 *    isso iria caçar um problema de token que não existe. Alarme falso
 *    fabricado é pior do que tela vazia.
 *
 * 2. "Vendedores no rodízio" mostrava Alice Johnson, Bob Smith e Charlie
 *    Davis como se fossem a equipe da conta.
 *
 * 3. Os três interruptores não gravavam nada: acendiam, mostravam um toast
 *    verde dizendo que a preferência fora salva, e ao recarregar voltavam ao
 *    padrão. Quem ligasse "Ativar rodízio" acreditaria ter configurado a
 *    distribuição de leads.
 *
 * O agravante do item 3: a distribuição de leads EXISTE de verdade, em
 * Configurações → Roteamento, que lê os membros reais e grava por
 * `leadRoutingEngine.upsertConfig`. Havia uma cópia falsa de um recurso real,
 * e o autor podia configurar a falsa e ir embora achando que estava feito.
 *
 * Nada foi apagado do produto: o que saiu foi a afirmação de que isto
 * funciona. Quando as automações forem construídas, as seções voltam com
 * dado de verdade por trás.
 */
function AutomationSettings() {
  return (
    <div className="space-y-6">
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            Automações executadas
          </CardTitle>
          <CardDescription>O que rodou, quando rodou e como terminou.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm font-medium">Ainda não há histórico de execução</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Quando as automações começarem a rodar, cada execução aparece aqui — com o lead, o
              resultado e o horário.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-primary" />
            Distribuição de leads
          </CardTitle>
          <CardDescription>
            Cada lead que entra vai para um vendedor, em rodízio ou por desempenho.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Isto se configura em <strong>Roteamento</strong>, onde ficam os vendedores da sua conta
            e a estratégia de distribuição.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link to="/settings/routing">Abrir Roteamento</Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Regras das automações
          </CardTitle>
          <CardDescription>Valem para todos os fluxos de venda e marketing.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm font-medium">Ainda não disponível</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Completar dados do lead e evitar lead repetido ainda não estão construídos. Os
              interruptores que ficavam aqui não gravavam nada.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
