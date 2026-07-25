/**
 * "Em que etapa este lead entra?" — o mesmo controle nas três integrações.
 *
 * Quiz, formulário e Meta Lead Ads faziam a mesma pergunta de jeitos
 * diferentes (ou não faziam). Um componente só garante que a resposta signifique
 * a mesma coisa nos três, e que a lista de etapas venha sempre do funil real.
 */
import { useQuery } from '@tanstack/react-query';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { listStages, type Stage } from '../services/stageService';

/** Radix não aceita `value=""`, então a ausência de escolha precisa de token. */
const AUTO = '__auto__';

interface Props {
  companyId: string;
  value: string | null;
  onChange: (stageId: string | null) => void;
  id?: string;
  disabled?: boolean;
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    />
  );
}

export function StageSelect({ companyId, value, onChange, id, disabled }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['stages', companyId],
    queryFn: () => listStages(companyId),
    enabled: Boolean(companyId),
  });
  const stages: Stage[] = data ?? [];
  const entry = stages.find((s) => s.is_entry);

  return (
    <Select
      value={value ?? AUTO}
      onValueChange={(v) => onChange(v === AUTO ? null : v)}
      disabled={disabled || isLoading}
    >
      <SelectTrigger id={id}>
        <SelectValue placeholder="Etapa de entrada" />
      </SelectTrigger>
      <SelectContent>
        {/* O padrão é explícito e nomeado: "Etapa padrão" sem dizer qual é
            obrigaria o usuário a abrir outra tela pra saber onde o lead cai. */}
        <SelectItem value={AUTO}>
          Etapa padrão do funil{entry ? ` (${entry.name})` : ''}
        </SelectItem>
        {stages.map((s) => (
          <SelectItem key={s.id} value={s.id}>
            <span className="flex items-center gap-2">
              <Dot color={s.color} />
              {s.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
