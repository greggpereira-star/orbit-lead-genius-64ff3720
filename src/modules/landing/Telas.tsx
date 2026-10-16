import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AVISO_DE_EXEMPLO } from "./conteudo";

/**
 * Telas do produto, desenhadas com dados de EXEMPLO e marcadas como tal.
 * Não são capturas de cliente. A paleta é fixa (independe do tema do app):
 * a página tem identidade própria e precisa ficar igual em qualquer tema.
 */

export function Moldura({ children, endereco = "app.altleadflow.com.br", className, aviso = true }: { children: ReactNode; endereco?: string; className?: string; aviso?: boolean }) {
  return (
    <figure className={cn("overflow-hidden rounded-[40px] border border-white/10 bg-slate-50 shadow-[0_40px_80px_-30px_rgb(2_6_23/0.55),0_0_0_1px_rgb(255_255_255/0.04)]", className)}>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-7 py-3.5">
        <span aria-hidden className="flex gap-1.5">
          <i className="h-2.5 w-2.5 rounded-full bg-slate-200" /><i className="h-2.5 w-2.5 rounded-full bg-slate-200" /><i className="h-2.5 w-2.5 rounded-full bg-slate-200" />
        </span>
        <span className="mx-auto rounded-md bg-slate-100 px-3 py-1 font-mono text-[11px] text-slate-500">{endereco}</span>
        <span className="w-10" aria-hidden />
      </div>
      <div className="text-slate-900">{children}</div>
      {aviso && <figcaption className="border-t border-slate-200 bg-white px-7 py-3.5 text-[11px] text-slate-500">{AVISO_DE_EXEMPLO}</figcaption>}
    </figure>
  );
}

function Selo({ tom = "neutro", children }: { tom?: "azul" | "verde" | "ambar" | "neutro" | "vermelho"; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold", {
      "bg-blue-50 text-blue-700": tom === "azul",
      "bg-emerald-50 text-emerald-700": tom === "verde",
      "bg-amber-50 text-amber-800": tom === "ambar",
      "bg-slate-100 text-slate-700": tom === "neutro",
      "bg-rose-50 text-rose-700": tom === "vermelho",
    })}>{children}</span>
  );
}

const Avatar = ({ t, cls }: { t: string; cls?: string }) => (
  <span aria-hidden className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700", cls)}>{t}</span>
);

/* ------------------------------------------------------------------ */
/* Herói: o caminho do lead, animado (anúncio → etapas → conversão)    */
/* ------------------------------------------------------------------ */
const ETAPAS = ["Novo", "Em atendimento", "Proposta", "Ganho"] as const;
const PASSOS = [
  { etapa: 0, evento: "Lead entrou · Meta Ads · Lançamento" },
  { etapa: 1, evento: "Primeira resposta no WhatsApp · Bruna" },
  { etapa: 2, evento: "Proposta enviada" },
  { etapa: 3, evento: "Venda ganha · conversão enviada" },
] as const;

function CartaoLead({ nome, origem, selo }: { nome: string; origem: string; selo?: ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-semibold">{nome}</p>{selo}</div>
      <p className="text-[11px] text-slate-500">{origem}</p>
    </div>
  );
}

export function TelaDoHeroi() {
  const reduzido = useReducedMotion();
  const [passo, setPasso] = useState(reduzido ? 3 : 0);
  useEffect(() => {
    if (reduzido) return;
    const t = setInterval(() => setPasso((p) => (p + 1) % (PASSOS.length + 1)), 2300);
    return () => clearInterval(t);
  }, [reduzido]);
  const atual = Math.min(passo, PASSOS.length - 1);
  const etapaDoLead = PASSOS[atual].etapa;
  const mostraLead = passo < PASSOS.length || reduzido;

  return (
    <Moldura endereco="app.altleadflow.com.br/pipeline" className="w-full">
      <div className="grid grid-cols-2 gap-3 bg-slate-50 p-5 sm:p-8 sm:grid-cols-4">
        {ETAPAS.map((nome, i) => (
          <div key={nome} className="min-h-[190px] space-y-2 rounded-2xl bg-slate-100/70 p-2">
            <p className="flex items-center justify-between px-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{nome}</p>
            {i === 1 && <CartaoLead nome="João Pedro" origem="Google Ads · Pesquisa" selo={<Selo tom="ambar">Morno</Selo>} />}
            {i === 2 && <CartaoLead nome="Clínica Aurora" origem="Indicação" />}
            {i === etapaDoLead && mostraLead && (
              <motion.div layout layoutId="lead-do-heroi" transition={{ type: "spring", stiffness: 260, damping: 28 }}>
                <div className="space-y-1.5 rounded-2xl border border-blue-300 bg-white p-3 shadow-[0_8px_24px_-12px_rgb(37_99_235/0.55)] ring-1 ring-blue-200">
                  <div className="flex items-center justify-between gap-2"><p className="text-[13px] font-semibold">Marina Souza</p><Selo tom={i === 3 ? "verde" : "azul"}>{i === 3 ? "Ganho" : "Quente"}</Selo></div>
                  <p className="text-[11px] text-slate-500">Meta Ads · formulário de anúncio</p>
                  <p className="font-mono text-[10px] text-slate-400">fbclid ✓ · utm_campaign=lancamento</p>
                </div>
              </motion.div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-7 py-4">
        <ol className="min-w-0 flex-1 space-y-1" aria-live="polite">
          {PASSOS.slice(0, atual + 1).slice(-2).map((p) => (
            <motion.li key={p.evento} initial={reduzido ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="truncate font-mono text-[11px] text-slate-600">
              <span className="mr-1.5 text-blue-600">›</span>{p.evento}
            </motion.li>
          ))}
        </ol>
        <AnimatePresence>
          {passo >= 3 && (
            <motion.div initial={reduzido ? false : { opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} className="flex shrink-0 items-center gap-2 rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-800">
              <span aria-hidden>✓</span> Meta · Google
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Moldura>
  );
}

/* ------------------------------------------------------------------ */
/* Captação                                                            */
/* ------------------------------------------------------------------ */
export function TelaCaptacao() {
  return (
    <Moldura endereco="app.altleadflow.com.br/quizzes">
      <div className="grid gap-3 bg-slate-50 p-5 sm:p-8 sm:grid-cols-2">
        <div className="space-y-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold">Quiz: perfil do comprador</p><Selo tom="verde">Publicado</Selo></div>
          {[["Qual o seu objetivo?", 100], ["Qual a faixa de investimento?", 72], ["Quando quer decidir?", 38]].map(([q, p]) => (
            <div key={q as string} className="space-y-1.5"><p className="text-xs text-slate-600">{q}</p><div className="h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${p}%` }} /></div></div>
          ))}
          <div className="flex gap-2 pt-1"><Selo tom="vermelho">0–39 · Frio</Selo><Selo tom="ambar">40–69 · Morno</Selo><Selo tom="verde">70+ · Quente</Selo></div>
        </div>
        <div className="space-y-2.5">
          {[["Formulário do site", "Embutido na sua página", "azul"], ["Widget de WhatsApp", "Botão flutuante com origem", "verde"], ["Meta Lead Ads", "Formulário do anúncio entra direto", "azul"], ["Formulário abandonado", "Dispara a recuperação", "ambar"]].map(([t, d, tom]) => (
            <div key={t} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm"><span aria-hidden className={cn("h-8 w-1.5 rounded-full", tom === "verde" ? "bg-emerald-500" : tom === "ambar" ? "bg-amber-500" : "bg-blue-600")} /><div><p className="text-[13px] font-semibold">{t}</p><p className="text-[11px] text-slate-500">{d}</p></div></div>
          ))}
        </div>
      </div>
    </Moldura>
  );
}

/* ------------------------------------------------------------------ */
/* Origem                                                              */
/* ------------------------------------------------------------------ */
export function TelaOrigem() {
  return (
    <Moldura endereco="app.altleadflow.com.br/leads/marina-souza">
      <div className="space-y-3 bg-slate-50 p-5 sm:p-8">
        <div className="flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <Avatar t="MS" cls="h-10 w-10 text-sm" />
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Marina Souza</p><p className="text-[11px] tabular-nums text-slate-500">+55 27 90000-0000</p></div>
          <Selo tom="azul">Quente · 82</Selo>
        </div>
        <dl className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm">
          {[["Origem", "Meta Ads · formulário de anúncio"], ["Campanha", "lancamento-residencial"], ["Conjunto", "interesse-imoveis-27"], ["Anúncio", "video-planta-2q"], ["Identificador do clique", "fbclid ✓ guardado"]].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between gap-4 px-3.5 py-2.5"><dt className="text-xs text-slate-500">{k}</dt><dd className="font-mono text-[11px] font-semibold">{v}</dd></div>
          ))}
        </dl>
        <ol className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
          {[["14:02", "Clicou no anúncio"], ["14:03", "Preencheu o formulário"], ["14:05", "Primeira resposta · WhatsApp"]].map(([h, t], i) => (
            <li key={h} className="flex items-center gap-3 text-xs"><span aria-hidden className={cn("h-2 w-2 rounded-full", i === 2 ? "bg-blue-600" : "bg-slate-300")} /><span className="font-mono tabular-nums text-slate-500">{h}</span><span className={cn(i === 2 && "font-semibold")}>{t}</span></li>
          ))}
        </ol>
      </div>
    </Moldura>
  );
}

/* ------------------------------------------------------------------ */
/* Atendimento                                                         */
/* ------------------------------------------------------------------ */
export function TelaAtendimento() {
  return (
    <Moldura endereco="app.altleadflow.com.br/whatsapp">
      <div className="grid min-h-[340px] bg-slate-50 sm:grid-cols-[210px_1fr]">
        <div className="space-y-2.5 border-b border-slate-200 bg-white p-5 sm:border-b-0 sm:border-r">
          <div className="flex flex-wrap gap-1.5">{["Entrada 12", "Minhas 4", "Seguindo 2", "Menções 1"].map((t, i) => (
            <span key={t} className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold", i === 0 ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600")}>{t}</span>
          ))}</div>
          {[["MS", "Marina Souza", "Quero ver a planta…", true], ["JP", "João Pedro", "Pode ser amanhã às 10h?", false], ["CA", "Clínica Aurora", "Obrigada pelo retorno!", false]].map(([i, n, p, s]) => (
            <div key={n as string} className={cn("flex items-center gap-2.5 rounded-2xl p-2", s && "bg-blue-50")}><Avatar t={i as string} /><div className="min-w-0"><p className="text-xs font-semibold">{n}</p><p className="truncate text-[11px] text-slate-500">{p}</p></div></div>
          ))}
        </div>
        <div className="flex flex-col justify-between gap-4 p-6">
          <div className="space-y-2.5 text-xs">
            <p className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-3.5 py-2.5 shadow-sm">Quero ver a planta de 2 quartos. Tem para visitar sábado?</p>
            <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3.5 py-2.5 text-white">Tem sim, Marina! Te mando as opções agora.</p>
            <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800"><strong>Nota interna ·</strong> Visita sábado às 10h. O cliente não vê esta nota.</p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><Selo tom="verde">Janela aberta · 3h12</Selo><span className="font-mono text-[10px] text-slate-400">/ respostas rápidas</span></div>
            <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-400">Responder à Marina…<span className="ml-auto flex gap-1.5"><Selo>Agendar</Selo><Selo tom="azul">Enviar</Selo></span></div>
          </div>
        </div>
      </div>
    </Moldura>
  );
}

/* ------------------------------------------------------------------ */
/* Funil                                                               */
/* ------------------------------------------------------------------ */
export function TelaFunil() {
  const cols: Array<[string, Array<[string, string, string?]>]> = [
    ["Novo", [["Marina Souza", "Meta Ads", "Quente"], ["Pedro Lima", "Quiz", "Morno"]]],
    ["Em atendimento", [["João Pedro", "Google Ads"], ["Ana Beatriz", "Widget", "Quente"]]],
    ["Proposta", [["Clínica Aurora", "Indicação"]]],
    ["Ganho", [["Carlos Dias", "Meta Ads"]]],
  ];
  return (
    <Moldura endereco="app.altleadflow.com.br/pipeline">
      <div className="grid grid-cols-2 gap-3 bg-slate-50 p-5 sm:p-8 sm:grid-cols-4">
        {cols.map(([nome, cards]) => (
          <div key={nome} className="space-y-2 rounded-2xl bg-slate-100/70 p-2">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{nome} <span className="text-slate-400">{cards.length}</span></p>
            {cards.map(([n, o, t]) => <CartaoLead key={n} nome={n} origem={o} selo={t ? <Selo tom={t === "Quente" ? "azul" : "ambar"}>{t}</Selo> : undefined} />)}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 border-t border-slate-200 bg-white px-7 py-4 text-xs"><span className="font-semibold">Distribuição</span><span className="text-slate-500">Novo lead → próximo da fila disponível</span><Selo tom="verde">3 online</Selo></div>
    </Moldura>
  );
}

/* ------------------------------------------------------------------ */
/* Automações                                                          */
/* ------------------------------------------------------------------ */
export function TelaAutomacao() {
  const passo = (rotulo: string, texto: string, tom: string) => (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm"><span className={cn("rounded-md px-2 py-1 font-mono text-[10px] font-semibold", tom)}>{rotulo}</span><p className="text-xs font-medium">{texto}</p></div>
  );
  return (
    <Moldura endereco="app.altleadflow.com.br/automations">
      <div className="space-y-2 bg-slate-50 p-5 sm:p-8">
        <p className="px-1 text-sm font-semibold">Lead quente de anúncio</p>
        {passo("QUANDO", "Lead criado", "bg-blue-50 text-blue-700")}
        {passo("SE", "temperatura é Quente  e  origem contém “meta”", "bg-slate-100 text-slate-700")}
        {passo("ENTÃO", "Atribuir ao próximo do time", "bg-emerald-50 text-emerald-700")}
        {passo("ENTÃO", "Enviar modelo de boas-vindas no WhatsApp", "bg-emerald-50 text-emerald-700")}
        {passo("ENTÃO", "Etiquetar “prioridade”", "bg-emerald-50 text-emerald-700")}
      </div>
    </Moldura>
  );
}

/* ------------------------------------------------------------------ */
/* Conversões                                                          */
/* ------------------------------------------------------------------ */
export function TelaConversoes() {
  return (
    <Moldura endereco="app.altleadflow.com.br/integrations/conversoes">
      <div className="space-y-3 bg-slate-50 p-5 sm:p-8">
        <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Negócio ganho</p><p className="text-sm font-semibold">Marina Souza · Residencial 2 quartos</p></div>
        <ul className="divide-y divide-slate-100 rounded-2xl bg-white shadow-sm">
          {[["Meta · API de Conversões", "Compra", "fbclid"], ["Google Ads", "Conversão offline", "gclid"]].map(([d, e, id]) => (
            <li key={d} className="flex items-center justify-between gap-3 px-3.5 py-3"><div><p className="text-[13px] font-semibold">{d}</p><p className="font-mono text-[10px] text-slate-500">{e} · {id} da origem</p></div><Selo tom="verde">Enviada</Selo></li>
          ))}
        </ul>
        <p className="px-1 text-[11px] text-slate-500">Cada envio fica registrado, com o resultado.</p>
      </div>
    </Moldura>
  );
}

/* ------------------------------------------------------------------ */
/* Regras do canal                                                     */
/* ------------------------------------------------------------------ */
export function TelaRegras() {
  const estados: Array<[string, string, "verde" | "ambar" | "neutro", string]> = [
    ["Janela aberta", "O contato escreveu há 3 h. Texto livre, anexos e agendamento liberados.", "verde", "Aberta"],
    ["Janela fechada", "Passaram 24 h sem resposta. Só modelos aprovados pela Meta.", "ambar", "Fechada"],
    ["Pediu para parar", "Respondeu “sair”. Nada sai por este número, nem de automação.", "neutro", "Bloqueado"],
  ];
  return (
    <Moldura endereco="app.altleadflow.com.br/whatsapp">
      <div className="space-y-2.5 bg-slate-50 p-5 sm:p-8">
        {estados.map(([t, d, tom, s]) => (
          <div key={t} className="space-y-1 rounded-2xl bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><Selo tom={tom}>{s}</Selo><p className="text-[13px] font-semibold">{t}</p></div><p className="text-xs text-slate-600">{d}</p></div>
        ))}
      </div>
    </Moldura>
  );
}

/* ------------------------------------------------------------------ */
/* Relatórios                                                          */
/* ------------------------------------------------------------------ */
export function TelaRelatorio() {
  const barras = [["Meta Ads", 78], ["Google Ads", 54], ["Widget do site", 31], ["Indicação", 18]] as const;
  return (
    <Moldura endereco="app.altleadflow.com.br/analytics">
      <div className="space-y-3 bg-slate-50 p-5 sm:p-8">
        <div className="flex items-center justify-between px-1"><p className="text-sm font-semibold">Leads por origem</p><Selo>Modo TV</Selo></div>
        <div className="space-y-2.5 rounded-2xl bg-white p-4 shadow-sm">
          {barras.map(([n, v]) => (
            <div key={n} className="space-y-1"><div className="flex justify-between text-[11px]"><span className="font-medium">{n}</span><span className="font-mono text-slate-400">exemplo</span></div>
              <div className="h-2 rounded-full bg-slate-100"><motion.div className="h-full rounded-full bg-blue-600" initial={{ width: 0 }} whileInView={{ width: `${v}%` }} viewport={{ once: true }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }} /></div></div>
          ))}
        </div>
      </div>
    </Moldura>
  );
}

export const TELAS_POR_RECURSO: Record<string, () => ReactNode> = {
  captacao: () => <TelaCaptacao />,
  origem: () => <TelaOrigem />,
  atendimento: () => <TelaAtendimento />,
  funil: () => <TelaFunil />,
  automacao: () => <TelaAutomacao />,
  conversoes: () => <TelaConversoes />,
  regras: () => <TelaRegras />,
  relatorios: () => <TelaRelatorio />,
};
