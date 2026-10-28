import { Download } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { baixarCsv, nomeDoArquivo, type SecaoExportavel } from "@/modules/analytics/lib/exportacao";

/**
 * Exporta uma seção do Analytics. `gerar` só roda no clique: o CSV nasce dos mesmos dados
 * que a tela mostra, no momento do clique (inclusive na ordem que a pessoa escolheu).
 */
export function BotaoExportarCsv({
  secao,
  dias,
  gerar,
  desabilitado,
  motivoDesabilitado = "Sem dados para exportar.",
}: {
  secao: SecaoExportavel;
  dias: string;
  gerar: () => string;
  desabilitado: boolean;
  motivoDesabilitado?: string;
}) {
  const exportar = () => {
    try {
      baixarCsv(nomeDoArquivo(secao, dias, new Date()), gerar());
      toast.success("Arquivo CSV gerado.");
    } catch {
      toast.error("Não foi possível gerar o CSV.");
    }
  };
  return (
    <Button
      variant="outline"
      size="sm"
      className="h-11 md:h-8"
      disabled={desabilitado}
      title={desabilitado ? motivoDesabilitado : undefined}
      onClick={exportar}
    >
      <Download className="mr-1 h-4 w-4" aria-hidden /> Exportar CSV
    </Button>
  );
}
