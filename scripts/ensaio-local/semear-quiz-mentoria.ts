/**
 * Põe o quiz da Mentoria (Taciane) na base de ENSAIO, publicado, para andar o
 * fluxo de verdade no navegador. Só 127.0.0.1.
 *   npx tsx scripts/ensaio-local/semear-quiz-mentoria.ts
 */
import postgres from "postgres";
import { FAIXAS_MENTORIA, montarQuizMentoria } from "../../src/modules/quiz/mentoriaEstetica";

const PG = process.env.ENSAIO_PG ?? "postgres://postgres@127.0.0.1:54329/leadflow_ensaio";
if (!/@127\.0\.0\.1:|@localhost:/.test(PG)) throw new Error("Recuso rodar fora de 127.0.0.1.");
const sql = postgres(PG, { onnotice: () => {} });
const [{ id: empresa }] = await sql`select id from companies where slug = 'empresa-ensaio'`;
const slug = "mentoria-metodo-decisao";
await sql`delete from quiz_funnels where company_id = ${empresa} and slug = ${slug}`;
const schema = montarQuizMentoria();
const [q] = await sql`insert into quiz_funnels (company_id, name, slug, niche, status, settings)
  values (${empresa}, 'Mentoria Método & Decisão', ${slug}, 'estetica', 'published',
  ${sql.json({ score_tiers: FAIXAS_MENTORIA } as never)}) returning id`;
const [v] = await sql`insert into quiz_versions (quiz_id, company_id, version, schema, is_published, published_at)
  values (${q.id}, ${empresa}, 1, ${sql.json(schema as never)}, true, now()) returning id`;
await sql`update quiz_funnels set published_version_id = ${v.id}, published_at = now() where id = ${q.id}`;
console.log("publicado no ensaio:", `/q/${slug}`, q.id);
await sql.end();
