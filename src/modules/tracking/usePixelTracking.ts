import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getFbCookies,
  hashContact,
  initPixels,
  newEventId,
  pushDataLayer,
  sendCapiEvent,
  setMetaAdvancedMatching,
  trackGoogleConversion,
  trackMeta,
  type HashedContact,
  type PixelConfig,
} from "@/core/tracking/pixels";
import { pixelService, mergePixelConfig } from "@/modules/integrations/services/pixelService";

/**
 * Medição das páginas públicas — quiz e formulário usam o mesmo caminho.
 *
 * Os eventos que valem dinheiro (`Lead` e `CompleteRegistration`) saem em
 * duplicata proposital: pelo navegador e pelo servidor, com o MESMO `eventId`.
 * O Meta junta os dois pela chave e conta um; se o bloqueador de anúncio matar
 * o do navegador, sobra o do servidor. É a diferença entre medir o funil e
 * medir só quem não usa bloqueador.
 */
export function usePixelTracking(opts: {
  companyId?: string;
  quizId?: string;
  formId?: string;
  /** Pixel próprio do funil. Campo vazio herda o da empresa. */
  overrides?: Partial<PixelConfig> | null;
  tracking?: Record<string, string>;
  /** `false` em preview: o rascunho do cliente não pode sujar as campanhas dele. */
  enabled: boolean;
}) {
  const { companyId, quizId, formId, overrides, tracking, enabled } = opts;

  const { data: companyConfig } = useQuery({
    queryKey: ["pixel-config", companyId],
    queryFn: () => pixelService.getPublicConfig(companyId!),
    enabled: enabled && !!companyId,
    staleTime: 5 * 60_000,
  });

  const config = useMemo<PixelConfig>(
    () => mergePixelConfig(companyConfig ?? {}, overrides),
    [companyConfig, overrides],
  );

  const active = enabled && !!(config.metaPixelId || config.googleConversionId);
  const pageViewSent = useRef(false);

  useEffect(() => {
    if (!active) return;
    initPixels(config);

    if (pageViewSent.current) return;
    pageViewSent.current = true;

    const eventId = newEventId();
    trackMeta("PageView", {}, eventId);
    pushDataLayer("page_view", { funil_id: quizId ?? formId, event_id: eventId });
    // O `_fbp` é gravado pelo próprio Pixel no `init` acima. Ler no próximo
    // tique dá tempo de ele existir — sem isso o primeiro evento sai sem o
    // cookie e perde correspondência.
    setTimeout(() => {
      const { fbp, fbc } = getFbCookies(tracking?.fbclid);
      sendCapiEvent({
        eventName: "PageView",
        eventId,
        quizId,
        formId,
        pageUrl: window.location.href,
        fbp,
        fbc,
        tracking,
      });
    }, 0);
  }, [active, config, quizId, formId, tracking]);

  /** Avanço de etapa. Só navegador: uma chamada ao servidor por etapa seria ruído. */
  const trackStep = useCallback(
    (stepIndex: number, stepName?: string) => {
      if (!active) return;
      const nome = stepName ?? `Etapa ${stepIndex + 1}`;
      trackMeta("ViewContent", {
        content_name: nome,
        content_category: "quiz_step",
        step: stepIndex + 1,
      });
      pushDataLayer("step", { etapa: stepIndex + 1, etapa_nome: nome, funil_id: quizId ?? formId });
    },
    [active, quizId, formId],
  );

  const fire = useCallback(
    async (
      eventName: "Lead" | "CompleteRegistration",
      googleLabel: string | undefined,
      contact: { email?: string; phone?: string },
      customData?: Record<string, unknown>,
    ) => {
      if (!active) return;
      try {
        const eventId = newEventId();
        const { fbp, fbc } = getFbCookies(tracking?.fbclid);

        // O hash vem antes do disparo porque é o que carrega o contato nos dois
        // eventos do navegador. Sem ele, o Meta recebe um evento anônimo e a
        // conversão do Google não tem como ser otimizada.
        const hashed: HashedContact = await hashContact(contact).catch(() => ({}));

        setMetaAdvancedMatching(config.metaPixelId, hashed);
        trackMeta(eventName, customData ?? {}, eventId);
        trackGoogleConversion(config, googleLabel, { transactionId: eventId, hashed });
        pushDataLayer(eventName === "Lead" ? "lead" : "complete", {
          funil_id: quizId ?? formId,
          event_id: eventId,
          // Contato só em hash: o dataLayer é lido por qualquer tag instalada no
          // GTM, inclusive de terceiros. E-mail em texto puro ali vazaria para
          // quem o cliente nem sabe que está na página.
          ...(hashed.em ? { email_sha256: hashed.em } : {}),
          ...(hashed.ph ? { telefone_sha256: hashed.ph } : {}),
          ...(customData ?? {}),
        });
        sendCapiEvent({
          eventName,
          eventId,
          quizId,
          formId,
          email: contact.email,
          phone: contact.phone,
          pageUrl: window.location.href,
          fbp,
          fbc,
          tracking,
          customData,
        });
      } catch (err) {
        // Medição nunca derruba o funil: o lead já está gravado por outro
        // caminho, e uma exceção aqui só custaria a leitura da campanha.
        console.error("Falha ao disparar evento de conversão", err);
      }
    },
    [active, config, quizId, formId, tracking],
  );

  /** Contato capturado — o mesmo instante em que o lead nasce no CRM. */
  const trackLead = useCallback(
    (contact: { email?: string; phone?: string }, customData?: Record<string, unknown>) =>
      fire("Lead", config.googleLeadLabel, contact, customData),
    [fire, config.googleLeadLabel],
  );

  /** Funil concluído. */
  const trackComplete = useCallback(
    (contact: { email?: string; phone?: string }, customData?: Record<string, unknown>) =>
      fire("CompleteRegistration", config.googleCompleteLabel, contact, customData),
    [fire, config.googleCompleteLabel],
  );

  return { config, active, trackStep, trackLead, trackComplete };
}
