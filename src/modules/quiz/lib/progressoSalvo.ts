import type { QuizBlock } from '../types';
import type { QuizRunState } from '../engine';

interface Guardado {
  v: 1;
  ts: number;
  sessionId: string;
  state: QuizRunState;
}

/** Depois disto, retomar é mais confuso do que útil: a pessoa já esqueceu. */
const VALIDADE_MS = 24 * 60 * 60 * 1000;

const chave = (quizId: string) => `lf.q.${quizId}`;

/**
 * Progresso do visitante no próprio navegador.
 *
 * Recarregar a página perdia TUDO — e a recuperação de abandono, que existe
 * para trazer essa pessoa de volta, não tinha de onde retomar.
 *
 * Fica no `localStorage`, e não no `sessionStorage`, justamente porque o caso
 * que importa é voltar depois de fechar a aba. São as respostas da própria
 * pessoa, no dispositivo dela; nada disso é enviado a lugar nenhum por causa
 * desta função.
 *
 * A sessão é guardada junto de propósito: sem ela, quem voltasse viraria um
 * lead NOVO, e a captura antecipada do primeiro acesso ficaria órfã.
 */
export function salvarProgresso(quizId: string, sessionId: string, state: QuizRunState): void {
  try {
    const dado: Guardado = { v: 1, ts: Date.now(), sessionId, state };
    localStorage.setItem(chave(quizId), JSON.stringify(dado));
  } catch {
    /* Aba anônima, cota cheia, storage bloqueado: seguir sem salvar é melhor
       do que derrubar o quiz por causa de uma conveniência. */
  }
}

export function limparProgresso(quizId: string): void {
  try {
    localStorage.removeItem(chave(quizId));
  } catch { /* idem */ }
}

/**
 * Devolve o progresso guardado, ou `null` quando não dá para confiar nele.
 *
 * Descarta quando o quiz foi editado desde então: um bloco respondido que não
 * existe mais significa que a pontuação e os saltos foram calculados sobre
 * outro funil. Retomar ali daria um resultado que o quiz atual não produz.
 */
export function lerProgresso(
  quizId: string,
  blocks: QuizBlock[],
  totalDeEtapas: number,
): { sessionId: string; state: QuizRunState } | null {
  try {
    const cru = localStorage.getItem(chave(quizId));
    if (!cru) return null;

    const dado = JSON.parse(cru) as Guardado;
    if (dado?.v !== 1 || !dado.state || !dado.sessionId) return null;
    if (Date.now() - dado.ts > VALIDADE_MS) { limparProgresso(quizId); return null; }

    const existentes = new Set(blocks.map((b) => b.id));
    const respondidos = Object.keys(dado.state.responses ?? {});
    if (respondidos.some((id) => !existentes.has(id))) { limparProgresso(quizId); return null; }

    // Etapa fora do funil atual (o quiz encurtou): recomeçar é mais seguro que
    // cair numa etapa que não existe.
    const idx = dado.state.currentStepIndex;
    if (typeof idx !== 'number' || idx < 0 || idx >= totalDeEtapas) { limparProgresso(quizId); return null; }

    // Nada guardado de útil: deixa o visitante começar do zero sem aviso.
    if (respondidos.length === 0 && idx === 0) return null;

    return { sessionId: dado.sessionId, state: dado.state };
  } catch {
    return null;
  }
}
