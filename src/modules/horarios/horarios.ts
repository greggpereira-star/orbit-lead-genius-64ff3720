/**
 * Horário de atendimento da empresa: dias da semana com abre/fecha, mais feriados.
 *
 * O banco decide com `dentro_do_horario(empresa, instante)`; `dentroDoHorario` aqui é o MESMO
 * cálculo, só para a tela mostrar "agora: dentro/fora" sem ir ao servidor. Mexeu em um, mexa no
 * outro (o teste cobre os mesmos casos do ensaio do SQL).
 */

/** 0 = domingo … 6 = sábado, como o `extract(dow …)` do Postgres. */
export const DIAS = [
  { chave: "1", curto: "Seg", nome: "Segunda-feira" },
  { chave: "2", curto: "Ter", nome: "Terça-feira" },
  { chave: "3", curto: "Qua", nome: "Quarta-feira" },
  { chave: "4", curto: "Qui", nome: "Quinta-feira" },
  { chave: "5", curto: "Sex", nome: "Sexta-feira" },
  { chave: "6", curto: "Sáb", nome: "Sábado" },
  { chave: "0", curto: "Dom", nome: "Domingo" },
] as const;

export type ChaveDoDia = (typeof DIAS)[number]["chave"];
export interface IntervaloDoDia {
  abre: string;
  fecha: string;
}
export type Agenda = Partial<Record<ChaveDoDia, IntervaloDoDia>>;

export const FUSO_PADRAO = "America/Sao_Paulo";

/** Segunda a sexta, 8h às 18h: o ponto de partida de quem liga o horário pela primeira vez. */
export const AGENDA_PADRAO: Agenda = {
  "1": { abre: "08:00", fecha: "18:00" },
  "2": { abre: "08:00", fecha: "18:00" },
  "3": { abre: "08:00", fecha: "18:00" },
  "4": { abre: "08:00", fecha: "18:00" },
  "5": { abre: "08:00", fecha: "18:00" },
};

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Erros por dia (chave do dia → texto). Vazio = agenda válida. */
export function validarAgenda(agenda: Agenda): Partial<Record<ChaveDoDia, string>> {
  const erros: Partial<Record<ChaveDoDia, string>> = {};
  for (const { chave } of DIAS) {
    const d = agenda[chave];
    if (!d) continue;
    if (!HORA.test(d.abre) || !HORA.test(d.fecha)) erros[chave] = "Use horas no formato 08:00.";
    else if (d.abre >= d.fecha)
      erros[chave] = "O horário de fechar precisa ser depois do de abrir.";
  }
  return erros;
}

export interface ConfigDoHorario {
  enabled: boolean;
  timezone: string;
  schedule: Agenda;
}

/** Hora e dia da semana locais no fuso, via Intl (sem depender do fuso do navegador). */
function partesLocais(ts: Date, timezone: string): { data: string; dow: ChaveDoDia; hhmm: string } {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  });
  const p = Object.fromEntries(f.formatToParts(ts).map((x) => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    p.weekday as string,
  ) as number;
  return {
    data: `${p.year}-${p.month}-${p.day}`,
    dow: String(dow) as ChaveDoDia,
    hhmm: `${p.hour}:${p.minute}`,
  };
}

export function dentroDoHorario(
  config: ConfigDoHorario | null,
  feriados: readonly string[],
  ts: Date = new Date(),
): boolean {
  if (!config || !config.enabled) return true;
  const { data, dow, hhmm } = partesLocais(ts, config.timezone || FUSO_PADRAO);
  if (feriados.includes(data)) return false;
  const d = config.schedule[dow];
  if (!d) return false;
  return hhmm >= d.abre && hhmm < d.fecha;
}

// --- Feriados nacionais ------------------------------------------------------------------------

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher), como `Date` em UTC ao meio-dia. */
function pascoa(ano: number): Date {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(ano, mes - 1, dia, 12));
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const somarDias = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export interface FeriadoSugerido {
  day: string;
  name: string;
}

/**
 * Feriados nacionais do ano. Carnaval e Corpus Christi são "ponto facultativo", não feriado por lei:
 * entram marcados assim, e quem não para nesses dias apaga da lista. Feriado estadual e municipal
 * a empresa acrescenta à mão.
 */
export function feriadosNacionais(ano: number): FeriadoSugerido[] {
  const p = pascoa(ano);
  const fixos: Array<[string, string]> = [
    ["01-01", "Confraternização Universal"],
    ["04-21", "Tiradentes"],
    ["05-01", "Dia do Trabalho"],
    ["09-07", "Independência do Brasil"],
    ["10-12", "Nossa Senhora Aparecida"],
    ["11-02", "Finados"],
    ["11-15", "Proclamação da República"],
    ["11-20", "Consciência Negra"],
    ["12-25", "Natal"],
  ];
  const lista: FeriadoSugerido[] = [
    ...fixos.map(([md, name]) => ({ day: `${ano}-${md}`, name })),
    { day: iso(somarDias(p, -48)), name: "Carnaval (ponto facultativo)" },
    { day: iso(somarDias(p, -47)), name: "Carnaval (ponto facultativo)" },
    { day: iso(somarDias(p, -2)), name: "Sexta-feira Santa" },
    { day: iso(somarDias(p, 60)), name: "Corpus Christi (ponto facultativo)" },
  ];
  return lista.sort((a, b) => a.day.localeCompare(b.day));
}

/** "2026-10-12" → "12/10/2026", sem passar por `Date` (fuso não pode mudar o dia). */
export function dataBr(iso10: string): string {
  const [a, m, d] = iso10.split("-");
  return `${d}/${m}/${a}`;
}
