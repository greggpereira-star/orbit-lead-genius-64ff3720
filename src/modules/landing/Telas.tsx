import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AVISO_DE_EXEMPLO } from "./conteudo";

/**
 * Telas de EXEMPLO do produto. São desenhadas com dados ilustrativos e dizem
 * isso na própria tela; não são capturas de cliente.
 */
const SOMBRA = "shadow-[0_1px_2px_rgb(15_23_42/0.04),0_14px_28px_-16px_rgb(15_23_42/0.18)]";

function Cartao({
  children,
  className,
  rotulo,
}: {
  children: ReactNode;
  className?: string;
  rotulo: string;
}) {
  return (
    <div
      role="group"
      aria-label={rotulo}
      className={cn("rounded-[20px] bg-card p-5 sm:p-7", SOMBRA, className)}
    >
      {children}
    </div>
  );
}

function Selo({ tom, children }: { tom: "sucesso" | "aviso" | "neutro"; children: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        tom === "sucesso" && "bg-[var(--sucesso-suave)] text-[var(--sucesso)]",
        tom === "aviso" && "bg-[var(--aviso-suave)] text-[var(--aviso)]",
        tom === "neutro" && "bg-muted text-foreground",
      )}
    >
      {children}
    </span>
  );
}

function Rotulo({ children }: { children: ReactNode }) {
  return (
    <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-foreground/60">
      {children}
    </p>
  );
}

function Linha({ chave, valor }: { chave: string; valor: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-sm text-foreground/65">{chave}</dt>
      <dd className="text-sm font-semibold sm:text-right">{valor}</dd>
    </div>
  );
}

export function FichaDoLead() {
  return (
    <div className="space-y-3">
      <Cartao rotulo="Ficha de lead de exemplo" className="space-y-5">
        <div className="flex flex-wrap items-center gap-3.5">
          <span
            aria-hidden
            className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-base font-semibold"
          >
            MS
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold tracking-tight">Marina Souza</p>
            <p className="text-sm tabular-nums text-foreground/65">+55 27 90000-0000</p>
          </div>
          <Selo tom="sucesso">Em atendimento</Selo>
        </div>
        <dl className="divide-y-0 rounded-[14px] bg-[var(--poco)] p-1.5">
          <Linha chave="Origem" valor="Meta Ads · formulário de anúncio" />
          <Linha chave="Campanha" valor="Lançamento — Residencial" />
          <Linha chave="Anúncio" valor="Vídeo planta 2 quartos" />
          <Linha chave="Identificador do clique" valor="fbclid guardado" />
        </dl>
        <div className="space-y-3.5">
          <Rotulo>O caminho até aqui</Rotulo>
          <ol className="space-y-3">
            {[
              ["14:02", "Clicou no anúncio"],
              ["14:03", "Preencheu o formulário"],
              ["14:05", "Primeira resposta no WhatsApp"],
            ].map(([hora, texto], i) => (
              <li key={hora} className="flex items-center gap-3.5">
                <span
                  aria-hidden
                  className={cn(
                    "h-2.5 w-2.5 shrink-0 rounded-full",
                    i === 2 ? "bg-primary" : "bg-border",
                  )}
                />
                <span className="text-sm tabular-nums text-foreground/65">{hora}</span>
                <span className={cn("text-[15px]", i === 2 && "font-semibold")}>{texto}</span>
              </li>
            ))}
          </ol>
        </div>
      </Cartao>
      <p className="text-xs text-foreground/60">Ficha de exemplo, com dados ilustrativos.</p>
    </div>
  );
}

export function TelaOrigem() {
  return (
    <Cartao rotulo="Tela de exemplo: origem do lead" className="space-y-4">
      <Rotulo>Origem do lead</Rotulo>
      <dl className="rounded-[14px] bg-[var(--poco)] p-1.5">
        <Linha chave="utm_source" valor="meta" />
        <Linha chave="utm_medium" valor="cpc" />
        <Linha chave="utm_campaign" valor="lancamento-residencial" />
        <Linha chave="utm_content" valor="video-planta-2q" />
      </dl>
      <ul className="grid gap-3 sm:grid-cols-3">
        {[
          ["Google Ads", "gclid"],
          ["Meta", "fbclid"],
          ["WhatsApp", "clique no anúncio"],
        ].map(([a, b]) => (
          <li key={a} className="space-y-2 rounded-[14px] bg-[var(--poco)] p-3.5">
            <p className="text-[13px] text-foreground/65">{a}</p>
            <p className="text-[15px] font-semibold">{b}</p>
            <Selo tom="sucesso">guardado</Selo>
          </li>
        ))}
      </ul>
      <p className="text-xs text-foreground/60">{AVISO_DE_EXEMPLO}</p>
    </Cartao>
  );
}

export function TelaAtendimento() {
  const conversas = [
    ["MS", "Marina Souza", "Quero ver a planta de 2 quartos", "14:05", true],
    ["JP", "João Pedro", "Pode ser amanhã às 10h?", "13:48", false],
    ["CA", "Clínica Aurora", "Obrigada pelo retorno!", "12:20", false],
  ] as const;
  return (
    <Cartao rotulo="Tela de exemplo: atendimento" className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {["Entrada 12", "Minhas 4", "Seguindo 2", "Menções 1"].map((t, i) => (
          <span
            key={t}
            className={cn(
              "rounded-full px-3.5 py-2 text-[13px] font-semibold",
              i === 0 ? "bg-foreground text-background" : "bg-muted text-foreground/65",
            )}
          >
            {t}
          </span>
        ))}
      </div>
      <ul className="space-y-1">
        {conversas.map(([ini, nome, previa, hora, sel]) => (
          <li
            key={nome}
            className={cn(
              "flex items-center gap-3.5 rounded-[14px] p-3.5",
              sel && "bg-[var(--poco)]",
            )}
          >
            <span
              aria-hidden
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold"
            >
              {ini}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15px]", sel ? "font-semibold" : "font-medium")}>{nome}</p>
              <p className="truncate text-sm text-foreground/65">{previa}</p>
            </div>
            <span className="text-[13px] tabular-nums text-foreground/65">{hora}</span>
            {sel && <span aria-label="não lida" className="h-2 w-2 rounded-full bg-primary" />}
          </li>
        ))}
      </ul>
      <p className="rounded-[14px] bg-[var(--aviso-suave)] p-3.5 text-[13px] text-[var(--aviso)]">
        <strong className="font-semibold">Nota interna</strong> Pediu retorno depois das 18h. O
        cliente não vê esta nota.
      </p>
      <p className="text-xs text-foreground/60">{AVISO_DE_EXEMPLO}</p>
    </Cartao>
  );
}

export function TelaRegras() {
  const estados: Array<[string, string, "sucesso" | "aviso" | "neutro", string]> = [
    [
      "Janela aberta",
      "O contato escreveu há 3 h. Texto livre, anexos e mensagens agendadas liberados.",
      "sucesso",
      "Aberta",
    ],
    [
      "Janela fechada",
      "Passaram 24 h sem resposta do contato. O compositor oferece só os modelos aprovados.",
      "aviso",
      "Fechada",
    ],
    [
      "Pediu para parar",
      "O contato respondeu “sair”. Nenhum envio sai por este número, nem de automação.",
      "neutro",
      "Bloqueado",
    ],
  ];
  return (
    <div role="group" aria-label="Tela de exemplo: regras de envio" className="space-y-3.5">
      {estados.map(([titulo, texto, tom, selo]) => (
        <Cartao key={titulo} rotulo={titulo} className="space-y-2 !p-5">
          <div className="flex items-center gap-2.5">
            <Selo tom={tom}>{selo}</Selo>
            <p className="text-[17px] font-semibold tracking-tight">{titulo}</p>
          </div>
          <p className="text-[15px] leading-[1.45] text-foreground/70">{texto}</p>
        </Cartao>
      ))}
      <p className="text-xs text-foreground/60">{AVISO_DE_EXEMPLO}</p>
    </div>
  );
}

export function TelaFunil() {
  return (
    <Cartao rotulo="Tela de exemplo: funil e conversão" className="space-y-5">
      <Rotulo>Negócio · Residencial 2 quartos</Rotulo>
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {["Novo", "Em atendimento", "Proposta", "Ganho"].map((f, i) => (
          <li
            key={f}
            aria-current={i === 3 ? "step" : undefined}
            className={cn(
              "rounded-xl px-2 py-3 text-center text-[13px] font-semibold",
              i === 3 ? "bg-foreground text-background" : "bg-[var(--poco)] text-foreground/65",
            )}
          >
            {f}
          </li>
        ))}
      </ol>
      <ul className="rounded-[14px] bg-[var(--poco)] p-1.5">
        {[
          ["Meta", "Compra enviada"],
          ["Google Ads", "Conversão enviada"],
        ].map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-3 px-3.5 py-3">
            <span className="text-[15px] font-semibold">{k}</span>
            <Selo tom="sucesso">{v}</Selo>
          </li>
        ))}
      </ul>
      <p className="text-xs text-foreground/60">{AVISO_DE_EXEMPLO}</p>
    </Cartao>
  );
}
