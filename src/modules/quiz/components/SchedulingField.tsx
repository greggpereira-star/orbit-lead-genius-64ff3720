import { useMemo, useState } from 'react';
import { Calendar } from '@/components/ui/calendar';
import type { DayPicker } from 'react-day-picker';
import { ptBR } from 'date-fns/locale';
import type { QuizBlock, QuizDesign } from '../types';
import { getContrastText, withAlpha } from '../lib/color';

export interface ValorAgendamento {
  /** ISO `YYYY-MM-DD`. Em intervalo, é o início. */
  data?: string;
  dataFim?: string;
  /** `HH:MM`. */
  hora?: string;
}

/** `YYYY-MM-DD` no fuso LOCAL. `toISOString()` daria o dia anterior à noite. */
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function horariosEntre(inicio: string, fim: string, passo: number): string[] {
  const [hi, mi] = inicio.split(':').map(Number);
  const [hf, mf] = fim.split(':').map(Number);
  const de = hi * 60 + mi;
  const ate = hf * 60 + mf;
  if (!Number.isFinite(de) || !Number.isFinite(ate) || passo <= 0 || ate <= de) return [];
  const out: string[] = [];
  // `<=` ficaria de fora o último encaixe quando ele coincide com o fim; o fim
  // é o limite do expediente, não um horário atendível.
  for (let m = de; m < ate; m += passo) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
}

export function SchedulingField({
  block,
  design,
  value,
  onChange,
}: {
  block: QuizBlock;
  design: QuizDesign;
  value: ValorAgendamento | undefined;
  onChange: (v: ValorAgendamento) => void;
}) {
  const [mes, setMes] = useState<Date>(new Date());

  const bloqueados = useMemo(() => {
    // `Matcher[]` do react-day-picker. O tipo inferido de `disabled` é uma
    // união larga; declarar a lista como o elemento certo evita que o TS
    // escolha `Date` e recuse os matchers de intervalo e de dia da semana.
    const regras: ({ before: Date } | { dayOfWeek: number[] })[] = [];
    if (block.schedulingBlockPast !== false) {
      // "Antes de hoje", e não "antes de agora": bloquear por hora tiraria o
      // dia corrente assim que passasse da meia-noite do fuso do servidor.
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      regras.push({ before: hoje });
    }
    const permitidos = block.schedulingWeekdays ?? [];
    if (permitidos.length) {
      const todos = [0, 1, 2, 3, 4, 5, 6];
      regras.push({ dayOfWeek: todos.filter((d) => !permitidos.includes(d)) });
    }
    return regras;
  }, [block.schedulingBlockPast, block.schedulingWeekdays]);

  const horarios = useMemo(
    () =>
      block.schedulingAllowTime
        ? horariosEntre(
            block.schedulingTimeStart || '09:00',
            block.schedulingTimeEnd || '18:00',
            block.schedulingSlotMinutes || 30,
          )
        : [],
    [block.schedulingAllowTime, block.schedulingTimeStart, block.schedulingTimeEnd, block.schedulingSlotMinutes],
  );

  const selecionado = value?.data ? new Date(`${value.data}T12:00:00`) : undefined;
  const selecionadoFim = value?.dataFim ? new Date(`${value.dataFim}T12:00:00`) : undefined;

  return (
    <div className="space-y-4">
      <div
        className="overflow-hidden"
        style={{
          borderRadius: design.radius,
          background: design.surface,
          border: `1px solid ${withAlpha(design.text, 0.12)}`,
          /* O calendário é o `Calendar` da casa (react-day-picker estilizado
             com Tailwind). A alternativa seria importar a folha de estilo do
             pacote, mas ela é global e reestilizaria também os calendários que
             já existem no painel. Estas variáveis pintam o dia selecionado com
             a cor do FUNIL, não com a do aplicativo. */
          ['--primary' as string]: design.primary,
          ['--primary-foreground' as string]: getContrastText(design.primary),
          ['--accent' as string]: withAlpha(design.primary, 0.12),
          color: design.text,
        }}
      >
        {block.schedulingAllowRange ? (
          <Calendar
            mode="range"
            locale={ptBR}
            month={mes}
            onMonthChange={setMes}
            disabled={bloqueados}
            selected={selecionado ? { from: selecionado, to: selecionadoFim } : undefined}
            onSelect={(r) =>
              onChange({
                ...value,
                data: r?.from ? isoLocal(r.from) : undefined,
                dataFim: r?.to ? isoLocal(r.to) : undefined,
              })
            }
          />
        ) : (
          <Calendar
            mode="single"
            locale={ptBR}
            month={mes}
            onMonthChange={setMes}
            disabled={bloqueados}
            selected={selecionado}
            onSelect={(d) => onChange({ ...value, data: d ? isoLocal(d) : undefined })}
          />
        )}
      </div>

      {block.schedulingAllowTime && !!horarios.length && (
        <div>
          <p className="mb-2 text-xs font-semibold opacity-70">Horário</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {horarios.map((h) => {
              const ativo = value?.hora === h;
              return (
                <button
                  key={h}
                  type="button"
                  // Escolher horário sem dia geraria uma resposta impossível de
                  // agendar; o dia manda, e o horário só abre depois dele.
                  disabled={!value?.data}
                  onClick={() => onChange({ ...value, hora: h })}
                  className="h-10 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                  style={{
                    borderRadius: Math.min(design.radius, 12),
                    border: `1px solid ${ativo ? design.primary : withAlpha(design.text, 0.15)}`,
                    background: ativo ? design.primary : 'transparent',
                    color: ativo ? getContrastText(design.primary) : design.text,
                  }}
                >
                  {h}
                </button>
              );
            })}
          </div>
          {!value?.data && (
            <p className="mt-2 text-[11px] opacity-60">Escolha o dia primeiro.</p>
          )}
        </div>
      )}
    </div>
  );
}
