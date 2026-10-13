import { useCallback, useEffect, useState } from "react";
import {
  CHAVE_DO_TEMA,
  CONSULTA_ESCURO,
  lerPreferencia,
  temaEfetivo,
  type PreferenciaDeTema,
  type TemaEfetivo,
} from "./tema";

/**
 * Lê, aplica e guarda a preferência de tema.
 *
 * Começa em `sistema` no servidor e na primeira renderização: ler
 * `localStorage` durante a renderização daria um valor que o servidor não tem
 * como reproduzir, e a hidratação acusaria divergência. O valor real entra no
 * efeito — e quem evita o clarão nesse intervalo é o script anti-piscada, que
 * já aplicou a classe antes da primeira pintura.
 */
export function useTema(): {
  preferencia: PreferenciaDeTema;
  efetivo: TemaEfetivo;
  escolher: (p: PreferenciaDeTema) => void;
} {
  const [preferencia, setPreferencia] = useState<PreferenciaDeTema>("sistema");
  const [sistemaEscuro, setSistemaEscuro] = useState(false);

  useEffect(() => {
    try {
      setPreferencia(lerPreferencia(localStorage.getItem(CHAVE_DO_TEMA)));
    } catch {
      /* armazenamento bloqueado (aba anônima, cookies off): fica no sistema */
    }
    const mq = window.matchMedia(CONSULTA_ESCURO);
    setSistemaEscuro(mq.matches);

    /* Acompanhar a troca do sistema enquanto a aba está aberta só importa para
       quem está em `sistema`; o filtro fica no efeito abaixo, que é quem
       escreve a classe. Aqui só registramos o fato. */
    const aoMudar = (e: MediaQueryListEvent) => setSistemaEscuro(e.matches);
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, []);

  const efetivo = temaEfetivo(preferencia, sistemaEscuro);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", efetivo === "escuro");
  }, [efetivo]);

  const escolher = useCallback((p: PreferenciaDeTema) => {
    setPreferencia(p);
    try {
      localStorage.setItem(CHAVE_DO_TEMA, p);
    } catch {
      /* sem armazenamento a escolha vale só nesta aba, o que ainda é melhor
         do que recusar a troca */
    }
  }, []);

  return { preferencia, efetivo, escolher };
}
