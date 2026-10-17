import { useSyncExternalStore } from "react";

/** `window.matchMedia` como estado. No servidor (SSR) vale `false`, e o cliente corrige ao hidratar. */
export function useMediaQuery(consulta: string): boolean {
  return useSyncExternalStore(
    (aoMudar) => {
      const m = window.matchMedia(consulta);
      m.addEventListener("change", aoMudar);
      return () => m.removeEventListener("change", aoMudar);
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}
