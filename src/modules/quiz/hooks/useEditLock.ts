import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EditLock {
  quiz_id: string;
  holder_user_id: string;
  holder_name: string | null;
  holder_tab_id: string;
  acquired_at: string;
  heartbeat_at: string;
  requester_user_id: string | null;
  requester_name: string | null;
  requester_tab_id: string | null;
  requested_at: string | null;
}

/** 25s. A trava vence em 75s no banco, então cabem três batidas perdidas. */
const BATIDA_MS = 25_000;
/** Quanto a aba que pediu espera o dono responder antes de poder forçar. */
export const ESPERA_PARA_FORCAR_MS = 20_000;

/**
 * Posse exclusiva da edição de um quiz, com pedido de controle.
 *
 * O identificador é a ABA, não o usuário: duas abas da mesma pessoa se
 * sobrescreviam igualzinho a duas pessoas diferentes, porque cada aba tem o
 * seu `schema` em memória e o autosave grava o estado inteiro.
 */
export function useEditLock(
  quizId: string,
  nome: string | undefined,
  ativo = true,
  meuUserId?: string,
) {
  /* O id da aba vive em sessionStorage: sobrevive ao recarregar (a mesma aba
     reassume a sua própria trava em vez de disputar consigo mesma) e não
     vaza para outra aba, que é justamente quem precisa ser distinguida. */
  const tabId = useRef<string>("");
  if (!tabId.current) {
    let guardado: string | null = null;
    try {
      guardado = sessionStorage.getItem("lf.tab");
    } catch {
      /* aba anônima */
    }
    if (!guardado) {
      guardado = crypto.randomUUID();
      try {
        sessionStorage.setItem("lf.tab", guardado);
      } catch {
        /* sem storage: id só em memória */
      }
    }
    tabId.current = guardado;
  }

  const [lock, setLock] = useState<EditLock | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [pedidoEnviadoEm, setPedidoEnviadoEm] = useState<number | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  const souDonoReal = !!lock && lock.holder_tab_id === tabId.current;
  const pedidoParaMim = souDonoReal && !!lock?.requester_tab_id;
  /* Outra ABA da MESMA pessoa não é um colega.
     A trava é por aba de propósito — duas abas suas se sobrescrevem igual a
     duas pessoas —, mas pedir licença a si mesmo e esperar 20s não protege
     ninguém: do outro lado não há quem responda, e quase sempre é uma aba
     esquecida aberta. Quem decide é o mesmo dono dos dois lados. */
  const souEuEmOutraAba =
    !!lock && !souDonoReal && !!meuUserId && lock.holder_user_id === meuUserId;

  const adquirir = useCallback(
    async (forcar = false) => {
      const { data, error } = await (
        supabase as unknown as {
          rpc: (f: string, a: unknown) => Promise<{ data: unknown; error: unknown }>;
        }
      ).rpc("quiz_lock_adquirir", {
        p_quiz_id: quizId,
        p_tab_id: tabId.current,
        p_nome: nome ?? null,
        p_forcar: forcar,
      });
      if (error) {
        /* Falhar aqui não pode travar o editor: sem resposta do servidor a aba
           segue editável, que é o comportamento de antes desta funcionalidade
           existir. A trava protege do caso comum, não é cofre. */
        console.warn("[trava] não foi possível adquirir", error);
        return null;
      }
      const l = (data as EditLock | null) ?? null;
      setLock(l);
      return l;
    },
    [quizId, nome],
  );

  useEffect(() => {
    if (!ativo || !quizId) return;
    let vivo = true;
    void adquirir().finally(() => {
      if (vivo) setCarregando(false);
    });
    const timer = setInterval(() => {
      void adquirir();
      setAgora(Date.now());
    }, BATIDA_MS);
    return () => {
      vivo = false;
      clearInterval(timer);
    };
  }, [ativo, quizId, adquirir]);

  /* Solta ao sair, para a próxima aba não esperar os 75 segundos à toa. É
     melhor-esforço: se o navegador matar a aba antes, a trava vence pelo tempo. */
  useEffect(() => {
    if (!ativo) return;
    const soltar = () => {
      if (!souDonoReal) return;
      void (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<unknown> }).rpc(
        "quiz_lock_soltar",
        { p_quiz_id: quizId, p_tab_id: tabId.current },
      );
    };
    window.addEventListener("pagehide", soltar);
    return () => {
      window.removeEventListener("pagehide", soltar);
      soltar();
    };
  }, [ativo, quizId, souDonoReal]);

  const pedirControle = useCallback(async () => {
    const { data, error } = await (
      supabase as unknown as {
        rpc: (f: string, a: unknown) => Promise<{ data: unknown; error: unknown }>;
      }
    ).rpc("quiz_lock_pedir", {
      p_quiz_id: quizId,
      p_tab_id: tabId.current,
      p_nome: nome ?? null,
    });
    if (error) {
      console.warn("[trava] pedido falhou", error);
      return;
    }
    setLock((data as EditLock | null) ?? null);
    setPedidoEnviadoEm(Date.now());
  }, [quizId, nome]);

  const assumir = useCallback(() => adquirir(true), [adquirir]);

  const entregar = useCallback(async () => {
    await (supabase as unknown as { rpc: (f: string, a: unknown) => Promise<unknown> }).rpc(
      "quiz_lock_soltar",
      { p_quiz_id: quizId, p_tab_id: tabId.current },
    );
    setLock(null);
  }, [quizId]);

  // Releitura periódica só para o botão "assumir" destravar na hora certa.
  useEffect(() => {
    if (pedidoEnviadoEm === null) return;
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, [pedidoEnviadoEm]);

  const podeForcar = pedidoEnviadoEm !== null && agora - pedidoEnviadoEm >= ESPERA_PARA_FORCAR_MS;

  const segundosParaForcar =
    pedidoEnviadoEm === null
      ? 0
      : Math.max(0, Math.ceil((ESPERA_PARA_FORCAR_MS - (agora - pedidoEnviadoEm)) / 1000));

  return {
    lock,
    carregando,
    /** Enquanto carrega assume que sim, para não piscar aviso no caminho normal. */
    souDono: carregando ? true : souDonoReal,
    pedidoParaMim,
    souEuEmOutraAba,
    pedidoEnviado: pedidoEnviadoEm !== null,
    podeForcar,
    segundosParaForcar,
    pedirControle,
    assumir,
    entregar,
  };
}
