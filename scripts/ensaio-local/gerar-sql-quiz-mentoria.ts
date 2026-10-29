/**
 * Gera (NÃO executa) o SQL que cria o quiz da Mentoria como RASCUNHO numa conta.
 *   npx tsx scripts/ensaio-local/gerar-sql-quiz-mentoria.ts <company_id> <created_by|-> <saida.sql>
 */
import { writeFileSync } from "node:fs";
import { FAIXAS_MENTORIA, montarQuizMentoria } from "../../src/modules/quiz/mentoriaEstetica";

const [empresa, autor, saida] = process.argv.slice(2);
if (!/^[0-9a-f-]{36}$/.test(empresa ?? "") || !saida) throw new Error("uso: <company_id> <created_by|-> <saida.sql>");
if (autor !== "-" && !/^[0-9a-f-]{36}$/.test(autor ?? "")) throw new Error("created_by inválido");
const schema = montarQuizMentoria();
const lit = (o: unknown) => `$json$${JSON.stringify(o)}$json$::jsonb`;
const by = autor === "-" ? "null" : `'${autor}'`;
writeFileSync(saida, `begin;
with q as (
  insert into quiz_funnels (company_id, created_by, name, slug, niche, status, design, settings)
  values ('${empresa}', ${by}, 'Mentoria Método & Decisão', 'mentoria-metodo-decisao', 'estetica', 'draft',
          ${lit(schema.design)}, ${lit({ score_tiers: FAIXAS_MENTORIA })})
  returning id
)
insert into quiz_versions (quiz_id, company_id, version, schema, created_by, is_published)
select id, '${empresa}', 1, ${lit(schema)}, ${by}, false from q;
commit;
`);
console.log("blocos:", schema.blocks.length, "| etapas:", schema.steps?.length, "| faixas:", FAIXAS_MENTORIA.length);
