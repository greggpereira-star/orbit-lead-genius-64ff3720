import { Button } from "@/components/ui/button";
import { Lock, Hand, Loader2 } from "lucide-react";
import type { useEditLock } from "../hooks/useEditLock";

type Trava = ReturnType<typeof useEditLock>;

/**
 * Aviso de quem está com a edição.
 *
 * São três faixas que nunca aparecem juntas: outra aba sua (assume na hora),
 * outra pessoa (leitura, pode pedir), e você com a edição recebendo um pedido.
 */
export function EditLockBanner({ trava }: { trava: Trava }) {
  if (trava.carregando) return null;

  /* Outra aba SUA: dizer o que é, e deixar assumir na hora.
     Antes esta mesma faixa dizia "Edição em uso por <seu próprio nome>", o que
     se lê como conflito com um colega, e obrigava a pedir controle e esperar
     20s — uma negociação com ninguém, quase sempre com uma aba esquecida
     aberta. O aviso de perda continua, porque a outra aba realmente perde o
     que não salvou. */
  if (!trava.souDono && trava.souEuEmOutraAba) {
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold">Outra aba sua está com a edição deste quiz.</span>
        <span className="text-amber-800/80 dark:text-amber-200/70">
          Aqui o que você mudar não será salvo.
        </span>
        <Button
          size="sm"
          className="ml-auto h-7 text-xs"
          onClick={() => void trava.assumir()}
          title="A outra aba perde o que ainda não tiver salvo"
        >
          Editar nesta aba
        </Button>
      </div>
    );
  }

  if (!trava.souDono) {
    const quem = trava.lock?.holder_name?.trim() || "outra aba";
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <Lock className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold">Edição em uso por {quem}.</span>
        <span className="text-amber-800/80 dark:text-amber-200/70">
          Você pode olhar, mas o que mudar aqui não será salvo.
        </span>
        <div className="ml-auto flex items-center gap-2">
          {!trava.pedidoEnviado ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-xs"
              onClick={() => void trava.pedirControle()}
            >
              <Hand className="h-3.5 w-3.5" />
              Pedir o controle
            </Button>
          ) : trava.podeForcar ? (
            <Button size="sm" className="h-7 text-xs" onClick={() => void trava.assumir()}>
              Assumir edição
            </Button>
          ) : (
            <span className="flex items-center gap-1.5 font-medium">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Controle solicitado — aguarde {trava.segundosParaForcar}s
            </span>
          )}
        </div>
      </div>
    );
  }

  if (trava.pedidoParaMim) {
    const quem = trava.lock?.requester_name?.trim() || "Outra aba";
    return (
      <div className="flex flex-wrap items-center gap-2 border-b border-sky-300/60 bg-sky-50 px-4 py-2 text-xs text-sky-900 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
        <Hand className="h-3.5 w-3.5 shrink-0" />
        <span className="font-semibold">{quem} pediu o controle deste quiz.</span>
        <span className="text-sky-800/80 dark:text-sky-200/70">
          Suas alterações já estão salvas ao entregar.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="ml-auto h-7 text-xs"
          onClick={() => void trava.entregar()}
        >
          Entregar a edição
        </Button>
      </div>
    );
  }

  return null;
}
