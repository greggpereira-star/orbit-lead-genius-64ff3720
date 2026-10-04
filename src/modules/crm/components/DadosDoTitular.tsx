import { useState } from 'react';
import { toast } from 'sonner';
import { Download, ShieldCheck, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { lgpdService } from '@/modules/audit/services/lgpdService';

/**
 * Direitos do titular, na ficha do lead.
 *
 * É onde a pessoa que atende está quando o titular liga pedindo os dados ou a
 * exclusão — pôr isso numa tela de configurações faria o pedido esbarrar em
 * quem não tem acesso a ela.
 */
export function DadosDoTitular({
  leadId,
  nome,
  onEliminado,
}: {
  leadId: string;
  nome?: string | null;
  onEliminado?: () => void;
}) {
  const [baixando, setBaixando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const baixar = async () => {
    setBaixando(true);
    try {
      await lgpdService.baixarExport(leadId, nome);
      toast.success('Arquivo gerado.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível gerar o arquivo.');
    } finally {
      setBaixando(false);
    }
  };

  const eliminar = async () => {
    setEliminando(true);
    try {
      await lgpdService.eliminarDados(leadId, motivo);
      toast.success('Dados eliminados. O pedido ficou registrado.');
      setConfirmando(false);
      onEliminado?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível eliminar.');
    } finally {
      setEliminando(false);
    }
  };

  return (
    <>
      <div className="space-y-3">
        <p className="text-[13px] text-muted-foreground">
          Atende aos pedidos de acesso e de eliminação previstos na LGPD. A prova
          do consentimento é preservada em qualquer caso — é ela que demonstra
          que o tratamento anterior ao pedido era lícito.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={baixar} disabled={baixando}>
            {baixando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Baixar todos os dados
          </Button>
          <Button
            variant="outline" size="sm"
            className="gap-2 text-[var(--destructive)] hover:text-[var(--destructive)]"
            onClick={() => setConfirmando(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Eliminar dados
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmando} onOpenChange={(v) => !v && setConfirmando(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar os dados de {nome || 'este lead'}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  Apaga o lead e tudo ligado a ele: histórico, anotações, respostas
                  de formulário, mensagens e etiquetas. <strong>Não tem volta.</strong>
                </p>
                <p className="text-muted-foreground">
                  O registro do consentimento é mantido, sem o vínculo com a pessoa,
                  e o pedido fica gravado com a contagem do que foi removido —
                  nunca com o conteúdo.
                </p>
                <div className="space-y-1.5 pt-1">
                  <Label className="text-[11px] font-semibold text-muted-foreground">
                    Motivo (opcional)
                  </Label>
                  <Input
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Ex: pedido do titular por e-mail em 04/10"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); eliminar(); }}
              disabled={eliminando}
              className="bg-[var(--destructive)] hover:bg-[var(--destructive)]/90 gap-2"
            >
              {eliminando && <Loader2 className="h-4 w-4 animate-spin" />}
              Eliminar definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
