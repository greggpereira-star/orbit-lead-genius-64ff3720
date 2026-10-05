import { Checkbox } from '@/components/ui/checkbox';

export const TEXTO_PADRAO_LGPD =
  'Autorizo o tratamento dos meus dados para que entrem em contato comigo.';

export interface Consentimentos {
  dados: boolean;
  marketing: boolean;
}

/**
 * Consentimento do titular, no formulário que o LEAD preenche.
 *
 * O componente antigo (`LGPDConsent`) estava em inglês, só era usado pelo
 * formulário de dentro do painel, e nascia com as duas caixas MARCADAS. Caixa
 * pré-marcada não é manifestação inequívoca — é o oposto do que o art. 8º da
 * LGPD pede. Aqui tudo nasce desmarcado, e o envio só libera quando a
 * finalidade obrigatória é aceita.
 *
 * Duas finalidades separadas de propósito: atender o contato e enviar
 * promoção são tratamentos distintos, e juntar os dois numa caixa só obriga
 * quem quer ser atendido a aceitar propaganda.
 */
export function ConsentimentoLGPD({
  valor,
  onMudar,
  texto,
  politicaUrl,
  pedirMarketing,
  erro,
}: {
  valor: Consentimentos;
  onMudar: (v: Consentimentos) => void;
  texto?: string | null;
  politicaUrl?: string | null;
  pedirMarketing?: boolean;
  erro?: boolean;
}) {
  return (
    <div className="space-y-3.5 border-t border-[var(--linha-sutil)] pt-5 mt-1">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <Checkbox
          checked={valor.dados}
          onCheckedChange={(c) => onMudar({ ...valor, dados: !!c })}
          aria-invalid={erro || undefined}
          className={erro ? 'border-destructive' : undefined}
        />
        <span className="text-[13px] leading-[1.55] text-foreground">
          {texto?.trim() || TEXTO_PADRAO_LGPD}
          {politicaUrl?.trim() ? (
            <>
              {' '}
              <a
                href={politicaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2"
              >
                Política de Privacidade
              </a>
              .
            </>
          ) : null}
        </span>
      </label>

      {pedirMarketing && (
        <label className="flex items-start gap-2.5 cursor-pointer">
          <Checkbox
            checked={valor.marketing}
            onCheckedChange={(c) => onMudar({ ...valor, marketing: !!c })}
          />
          <span className="text-[13px] leading-[1.55] text-muted-foreground">
            Também quero receber novidades e promoções. (opcional)
          </span>
        </label>
      )}

      {erro && (
        <p className="text-xs text-destructive">
          Para enviar, é preciso autorizar o tratamento dos seus dados.
        </p>
      )}

      <p className="text-[11.5px] leading-[1.5] text-muted-foreground pt-0.5">
        Você pode revogar este consentimento a qualquer momento pelos canais de
        contato.
      </p>
    </div>
  );
}
