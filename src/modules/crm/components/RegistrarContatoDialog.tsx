import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CANAIS_DE_CONTATO,
  paraCampoLocal,
  validarHorario,
  type CanalDeContato,
} from "@/modules/crm/lib/contatos";

/**
 * Registrar um contato que já aconteceu, com o horário em que aconteceu.
 *
 * O caminho rápido ("Registrar contato" no menu) continua valendo o horário do clique. Este
 * diálogo é para quem ligou às 9h e só agora foi registrar. O banco confere de novo: não aceita
 * horário no futuro nem anterior à chegada do lead.
 */
export function RegistrarContatoDialog({
  aberto,
  aoMudar,
  criadoEm,
  pendente,
  aoConfirmar,
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  /** ISO da chegada do lead: o contato não pode ser anterior a ela. */
  criadoEm: string | null;
  pendente: boolean;
  aoConfirmar: (canal: CanalDeContato, quando: Date) => void;
}) {
  const [canal, setCanal] = useState<CanalDeContato>("ligacao");
  const [campo, setCampo] = useState("");

  useEffect(() => {
    if (aberto) {
      setCanal("ligacao");
      setCampo(paraCampoLocal(new Date()));
    }
  }, [aberto]);

  const chegada = criadoEm ? new Date(criadoEm) : null;
  const quando = campo ? new Date(campo) : null;
  const erro = campo ? validarHorario(quando, chegada) : null;

  return (
    <Dialog open={aberto} onOpenChange={aoMudar}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar contato já feito</DialogTitle>
          <DialogDescription>
            Informe quando você falou com o lead. O tempo de resposta passa a usar esse horário, e a
            ficha mostra que ele foi informado depois.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="contato-canal">Canal</Label>
            <Select value={canal} onValueChange={(v) => setCanal(v as CanalDeContato)}>
              <SelectTrigger id="contato-canal" className="h-11 md:h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CANAIS_DE_CONTATO.map((c) => (
                  <SelectItem key={c.valor} value={c.valor}>
                    {c.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="contato-quando">Quando</Label>
            <Input
              id="contato-quando"
              type="datetime-local"
              className="h-11 md:h-10"
              value={campo}
              min={chegada ? paraCampoLocal(chegada) : undefined}
              max={paraCampoLocal(new Date())}
              onChange={(e) => setCampo(e.target.value)}
              aria-invalid={Boolean(erro)}
              aria-describedby={erro ? "contato-erro" : undefined}
            />
            {erro && (
              <p id="contato-erro" role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => aoMudar(false)} disabled={pendente}>
            Cancelar
          </Button>
          <Button
            disabled={pendente || !quando || Boolean(erro)}
            onClick={() => quando && aoConfirmar(canal, quando)}
          >
            {pendente && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
