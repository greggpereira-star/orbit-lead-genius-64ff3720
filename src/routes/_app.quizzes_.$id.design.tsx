import { createFileRoute, Link, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { ArrowLeft, Loader2, AlertCircle, Check, Pipette, RotateCcw, Plus, X } from 'lucide-react';
import { useAuth } from '@/core/auth/hooks/useAuth';
import { quizService } from '@/modules/quiz/services/quizService';
import { getSteps } from '@/modules/quiz/lib/steps';
import { MediaUploader } from '@/modules/quiz/components/MediaUploader';
import { QuizPreview } from '@/modules/quiz/components/QuizPreview';
import { DEFAULT_DESIGN, DESIGN_PRESETS } from '@/modules/quiz/design-presets';
import type { QuizDesign, QuizFunnel, QuizSchema } from '@/modules/quiz/types';

export const Route = createFileRoute('/_app/quizzes_/$id/design')({
  component: QuizDesignPage,
});

const FONTES = [
  'Inter', 'Space Grotesk', 'Fredoka', 'Playfair Display',
  'Poppins', 'Montserrat', 'Nunito', 'Plus Jakarta Sans',
];

/** Conta-gotas do navegador. Só Chromium expõe; onde não existe, o botão some. */
type EyeDropperCtor = new () => { open: () => Promise<{ sRGBHex: string }> };
const temContaGotas = () => typeof window !== 'undefined' && 'EyeDropper' in window;

function QuizDesignPage() {
  const { id } = useParams({ from: '/_app/quizzes_/$id/design' });
  const { company, user } = useAuth();
  const [quiz, setQuiz] = useState<QuizFunnel | null>(null);
  const [schema, setSchema] = useState<QuizSchema>({ blocks: [], design: DEFAULT_DESIGN, results: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;
    Promise.all([quizService.getById(id), quizService.getLatestSchema(id)])
      .then(([q, s]) => {
        if (!mounted) return;
        setQuiz(q);
        setSchema({ ...s, steps: getSteps(s) });
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
        toast.error('Não foi possível carregar este quiz agora.');
      });
    return () => { mounted = false; };
  }, [id]);

  const design: QuizDesign = useMemo(
    () => ({ ...DEFAULT_DESIGN, ...(schema.design ?? {}) }),
    [schema.design],
  );

  const patch = (p: Partial<QuizDesign>) => {
    setSchema((prev) => ({ ...prev, design: { ...DEFAULT_DESIGN, ...(prev.design ?? {}), ...p } }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!company?.id || !user?.id) return;
    setSaving(true);
    try {
      await quizService.saveSchema({ quizId: id, companyId: company.id, userId: user.id, schema });
      setDirty(false);
      setSaveError(false);
      setLastSavedAt(new Date());
    } catch (e) {
      console.error('Erro ao salvar o design', e);
      setSaveError(true);
      toast.error('Não foi possível salvar o design. Suas alterações ainda estão só nesta aba.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!dirty || loading) return;
    const timer = setTimeout(() => { void handleSave(); }, 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schema, dirty, loading]);

  /* Fechar a aba com alteração pendente não pode ser silencioso: o autosave tem
     1,2s de espera e um fechamento dentro dessa janela leva o trabalho junto. */
  useEffect(() => {
    if (!dirty) return;
    const avisar = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [dirty]);

  const guardarCor = (cor: string) => {
    const atuais = design.savedColors ?? [];
    if (atuais.includes(cor)) return;
    patch({ savedColors: [...atuais, cor].slice(-18) });
  };

  const aplicarPreset = (presetId: string) => {
    const preset = DESIGN_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    /* As cores guardadas e a logo são do usuário, não do preset: trocar de
       preset é trocar a paleta, não apagar a marca dele. */
    patch({ ...preset.design, savedColors: design.savedColors, logoUrl: design.logoUrl, logoWidth: design.logoWidth });
    toast.success(`Tema "${preset.name}" aplicado`);
  };

  const restaurarPadrao = () => {
    if (!window.confirm('Retornar ao design padrão? As cores e fontes atuais deste quiz serão substituídas.')) return;
    patch({ ...DEFAULT_DESIGN, savedColors: design.savedColors, logoUrl: design.logoUrl, logoWidth: design.logoWidth });
  };

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <Button asChild variant="ghost" size="sm">
          <Link to="/quizzes/$id/builder" params={{ id }}>
            <ArrowLeft className="mr-2 h-4 w-4" />Voltar ao Builder
          </Link>
        </Button>
        <div className="border-l pl-3">
          <h1 className="text-sm font-bold leading-none">{quiz?.name ?? 'Quiz'}</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">Design</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={restaurarPadrao} className="gap-1.5 text-xs">
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Retornar ao padrão</span>
          </Button>
          <EstadoDoSalvamento
            saving={saving} dirty={dirty} saveError={saveError}
            lastSavedAt={lastSavedAt} onRetry={() => void handleSave()}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside className="w-full shrink-0 overflow-y-auto border-b p-5 lg:w-[380px] lg:border-b-0 lg:border-r">
          <div className="space-y-7">
            <Secao titulo="Temas prontos">
              <div className="grid grid-cols-2 gap-2">
                {DESIGN_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => aplicarPreset(p.id)}
                    className={`relative rounded-xl border p-2.5 text-left transition-colors hover:border-primary ${
                      design.presetId === p.id ? 'border-primary ring-1 ring-primary' : ''
                    }`}
                  >
                    <div className="mb-2 flex gap-1">
                      {[p.design.primary, p.design.background, p.design.surface, p.design.text].map((c, i) => (
                        <span key={i} className="h-5 w-5 rounded-md border" style={{ background: c }} />
                      ))}
                    </div>
                    <span className="block text-xs font-semibold leading-tight">{p.name}</span>
                    {design.presetId === p.id && (
                      <Check className="absolute right-2 top-2 h-3.5 w-3.5 text-primary" />
                    )}
                  </button>
                ))}
              </div>
            </Secao>

            <Secao titulo="Marca / Logo">
              <MediaUploader
                quizId={id}
                accept="image"
                value={design.logoUrl}
                onChange={(url) => patch({ logoUrl: url || undefined })}
                label="Logo do topo"
                compact
              />
              {design.logoUrl && (
                <>
                  <Medida
                    rotulo="Largura da logo" valor={design.logoWidth ?? 120}
                    min={48} max={320} passo={4} sufixo="px"
                    onChange={(v) => patch({ logoWidth: v })}
                  />
                  <Button
                    variant="ghost" size="sm"
                    className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                    onClick={() => patch({ logoUrl: undefined })}
                  >
                    <X className="h-3 w-3" />Remover logo
                  </Button>
                </>
              )}
            </Secao>

            <Secao titulo="Cores">
              <Cor rotulo="Cor tema" valor={design.primary} onChange={(v) => patch({ primary: v })} onGuardar={guardarCor} salvas={design.savedColors} />
              <Cor rotulo="Cor de fundo" valor={design.background} onChange={(v) => patch({ background: v })} onGuardar={guardarCor} salvas={design.savedColors} />
              <Cor rotulo="Superfície (cartões)" valor={design.surface} onChange={(v) => patch({ surface: v })} onGuardar={guardarCor} salvas={design.savedColors} />
              <Cor rotulo="Cor do título" valor={design.titleColor ?? design.text} onChange={(v) => patch({ titleColor: v })} onGuardar={guardarCor} salvas={design.savedColors} />
              <Cor rotulo="Cor do texto" valor={design.text} onChange={(v) => patch({ text: v })} onGuardar={guardarCor} salvas={design.savedColors} />
              <Cor rotulo="Texto secundário" valor={design.muted} onChange={(v) => patch({ muted: v })} onGuardar={guardarCor} salvas={design.savedColors} />
            </Secao>

            <Secao titulo="Tipografia">
              <Fonte rotulo="Fonte dos títulos" valor={design.fontHeading} onChange={(v) => patch({ fontHeading: v })} />
              <Fonte rotulo="Fonte do corpo" valor={design.fontBody} onChange={(v) => patch({ fontBody: v })} />
              <Medida rotulo="Tamanho do título" valor={design.titleSize ?? 28} min={16} max={48} passo={1} sufixo="px" onChange={(v) => patch({ titleSize: v })} />
              <Medida rotulo="Tamanho do texto" valor={design.contentSize ?? 16} min={12} max={22} passo={1} sufixo="px" onChange={(v) => patch({ contentSize: v })} />
            </Secao>

            <Secao titulo="Formato">
              <Medida rotulo="Arredondamento" valor={design.radius} min={0} max={32} passo={1} sufixo="px" onChange={(v) => patch({ radius: v })} />
              <Medida rotulo="Altura de botão e campo" valor={design.elementSize ?? 56} min={40} max={72} passo={2} sufixo="px" onChange={(v) => patch({ elementSize: v })} />
              <Medida rotulo="Largura do conteúdo" valor={design.contentWidth ?? 448} min={360} max={720} passo={8} sufixo="px" onChange={(v) => patch({ contentWidth: v })} />
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Alinhamento vertical</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { v: 'start', r: 'Topo' },
                    { v: 'center', r: 'Centro' },
                    { v: 'between', r: 'Espalhado' },
                  ] as const).map((o) => (
                    <Button
                      key={o.v} type="button" size="sm"
                      variant={(design.verticalAlign ?? 'between') === o.v ? 'default' : 'outline'}
                      className="h-8 text-xs"
                      onClick={() => patch({ verticalAlign: o.v })}
                    >
                      {o.r}
                    </Button>
                  ))}
                </div>
              </div>
            </Secao>
          </div>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-4">
          <div className="mx-auto max-w-[440px]">
            <p className="mb-2 text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Pré-visualização
            </p>
            <div className="overflow-hidden rounded-2xl border bg-background shadow-sm">
              <QuizPreview schema={schema} device="mobile" />
            </div>
          </div>
        </main>
      </div>
    </div>,
    document.body,
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{titulo}</h2>
      {children}
    </section>
  );
}

function Cor({
  rotulo, valor, onChange, onGuardar, salvas,
}: {
  rotulo: string; valor: string; onChange: (v: string) => void;
  onGuardar: (v: string) => void; salvas?: string[];
}) {
  const pegarDaTela = async () => {
    try {
      const Ctor = (window as unknown as { EyeDropper: EyeDropperCtor }).EyeDropper;
      const { sRGBHex } = await new Ctor().open();
      onChange(sRGBHex);
    } catch {
      /* O usuário cancelou com Esc — não é erro. */
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{rotulo}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
        />
        <Input
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 flex-1 font-mono text-xs"
          spellCheck={false}
        />
        {temContaGotas() && (
          <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={pegarDaTela} title="Selecionar cor na tela">
            <Pipette className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => onGuardar(valor)} title="Guardar esta cor">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {!!salvas?.length && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {salvas.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              title={c}
              className="h-5 w-5 rounded-md border transition-transform hover:scale-110"
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Fonte({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-semibold">{rotulo}</Label>
      <select
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-2 text-sm"
        style={{ fontFamily: valor }}
      >
        {FONTES.map((f) => (
          <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
        ))}
      </select>
    </div>
  );
}

function Medida({
  rotulo, valor, min, max, passo, sufixo, onChange,
}: {
  rotulo: string; valor: number; min: number; max: number;
  passo: number; sufixo: string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">{rotulo}</Label>
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{valor}{sufixo}</span>
      </div>
      <Slider value={[valor]} min={min} max={max} step={passo} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}

function EstadoDoSalvamento({
  saving, dirty, saveError, lastSavedAt, onRetry,
}: {
  saving: boolean; dirty: boolean; saveError: boolean;
  lastSavedAt: Date | null; onRetry: () => void;
}) {
  if (saveError) {
    return (
      <button
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/20"
        title="Falha ao salvar — clique para tentar de novo"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="hidden min-[420px]:inline">Erro — tentar de novo</span>
      </button>
    );
  }
  if (saving) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />Salvando…
      </span>
    );
  }
  if (dirty) return <span className="text-xs text-muted-foreground">Alterações não salvas</span>;
  if (lastSavedAt) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="h-3.5 w-3.5" />
        Salvo {lastSavedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
      </span>
    );
  }
  return null;
}
