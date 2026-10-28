import { AlertCircle, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Consulta que falhou.
 *
 * Existe porque erro e "sem dados" não podem parecer a mesma coisa: antes, uma
 * consulta que falhava deixava a tabela dizer "Nenhum lead de anúncio no período" e as
 * tiles mostrarem "—", e o leitor concluía que não houve lead. Aqui o texto diz que
 * FALHOU, que os números não estão zerados, e oferece tentar de novo.
 */
export function ErroDeConsulta({
  titulo = "Não foi possível carregar estes números agora.",
  aoTentar,
  tentando = false,
}: {
  titulo?: string;
  aoTentar: () => void;
  tentando?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm"
    >
      <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
      <p className="min-w-0 flex-1 text-muted-foreground">
        <span className="font-medium text-foreground">{titulo}</span> A consulta falhou; isso não
        quer dizer que não houve leads.
      </p>
      <Button
        size="sm"
        variant="outline"
        className="h-11 md:h-8"
        disabled={tentando}
        onClick={aoTentar}
      >
        {tentando && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Tentar de novo
      </Button>
    </div>
  );
}
