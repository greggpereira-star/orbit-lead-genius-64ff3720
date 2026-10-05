/**
 * Cria (ou remove) o quiz de teste que a suíte e2e percorre.
 *
 * Existe porque o player carrega o quiz no SERVIDOR, durante o SSR: nenhuma
 * requisição ao Supabase sai do navegador, então interceptar no Playwright não
 * alcança. O teste precisa de um quiz publicado de verdade.
 *
 *   npx tsx scripts/e2e-fixture.ts criar
 *   npx tsx scripts/e2e-fixture.ts remover
 *
 * Exige SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente. O quiz nasce com
 * um slug reservado e é removido pelo mesmo script — nada de produção é tocado.
 */
import { createClient } from '@supabase/supabase-js';

const SLUG = 'e2e-fixture';
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const companyId = process.env.E2E_COMPANY_ID;

if (!url || !key) {
  console.error('Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.');
  process.exit(1);
}
if (!companyId) {
  console.error('Falta E2E_COMPANY_ID — a empresa onde o quiz de teste será criado.');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });

const SCHEMA = {
  design: {
    presetId: 'minimal-light', primary: '#2563eb', background: '#ffffff', surface: '#f8fafc',
    text: '#0f172a', muted: '#64748b', radius: 12, fontHeading: 'Inter', fontBody: 'Inter',
    buttonStyle: 'solid', progressStyle: 'bar',
  },
  results: [],
  blocks: [
    { id: 'q1', type: 'single-choice', title: 'Qual seu interesse?', required: true,
      options: [{ id: 'alto', label: 'Alto', score: 10 }, { id: 'baixo', label: 'Baixo', score: 0 }] },
    { id: 'tel', type: 'short-text', title: 'Seu telefone', placeholder: '(27) 99999-9999',
      fieldMask: 'telefone', required: true, ctaLabel: 'Continuar' },
    { id: 'so-alto', type: 'cta', title: 'So para quem tem interesse alto', ctaLabel: 'Seguir',
      showIf: { enabled: true, fieldBlockId: 'q1', op: 'eq', value: 'alto' } },
  ],
  steps: [
    { id: 's1', blockIds: ['q1'], name: 'Interesse' },
    { id: 's2', blockIds: ['tel'], name: 'Telefone' },
    { id: 's3', blockIds: ['so-alto'], name: 'Condicional' },
  ],
};

async function remover() {
  const { data } = await db.from('quiz_funnels').select('id').eq('slug', SLUG).maybeSingle();
  const id = (data as { id?: string } | null)?.id;
  if (!id) { console.log('nada a remover'); return; }
  // As submissões e os leads do teste saem junto — são lixo de teste, não dado
  // de cliente. O filtro por quiz_id garante que nada mais é alcançado.
  await db.from('leads').delete().eq('quiz_id', id);
  await db.from('quiz_events').delete().eq('quiz_id', id);
  await db.from('quiz_submissions').delete().eq('quiz_id', id);
  await db.from('quiz_versions').delete().eq('quiz_id', id);
  await db.from('quiz_funnels').delete().eq('id', id);
  console.log('removido:', SLUG);
}

async function criar() {
  await remover();
  const { data: quiz, error } = await db
    .from('quiz_funnels')
    .insert({ company_id: companyId, name: 'E2E fixture', slug: SLUG, status: 'draft' } as never)
    .select('id')
    .single();
  if (error) throw error;
  const quizId = (quiz as { id: string }).id;

  const { data: versao, error: e2 } = await db
    .from('quiz_versions')
    .insert({ quiz_id: quizId, company_id: companyId, schema: SCHEMA, version: 1 } as never)
    .select('id')
    .single();
  if (e2) throw e2;

  const { error: e3 } = await db
    .from('quiz_funnels')
    .update({ status: 'published', published_version_id: (versao as { id: string }).id } as never)
    .eq('id', quizId);
  if (e3) throw e3;

  console.log('criado e publicado:', SLUG, quizId);
}

const acao = process.argv[2];
if (acao === 'criar') await criar();
else if (acao === 'remover') await remover();
else { console.error('uso: e2e-fixture.ts criar|remover'); process.exit(1); }
