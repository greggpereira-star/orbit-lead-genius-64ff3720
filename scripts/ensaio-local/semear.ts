/**
 * Semeia a base local do ensaio: uma empresa, três usuários (dono, atendente,
 * visualizador), as etapas do funil e um número oficial já conectado à Meta
 * falsa. As CONVERSAS não são semeadas aqui: entram pelo webhook assinado, para
 * exercitar o caminho real. Idempotente (pode rodar de novo).
 *
 *   npx tsx scripts/ensaio-local/semear.ts
 */
import postgres from "postgres";
import { cifrarToken } from "../../src/lib/whatsapp/cloud/cifra";
import { WA_TOKEN_KEY } from "./chaves.mjs";

const sql = postgres(process.env.ENSAIO_PG ?? "postgres://postgres@127.0.0.1:54329/leadflow_ensaio", { onnotice: () => {} });

export const EMPRESA_ID = "11111111-1111-4111-8111-111111111111";
export const USUARIOS = [
  { id: "aaaaaaaa-0000-4000-8000-000000000001", email: "dono@ensaio.test", nome: "Dora Dona", papel: "owner" },
  { id: "aaaaaaaa-0000-4000-8000-000000000002", email: "atendente@ensaio.test", nome: "Aline Atendente", papel: "member" },
  { id: "aaaaaaaa-0000-4000-8000-000000000003", email: "visualizador@ensaio.test", nome: "Vitor Visualizador", papel: "viewer" },
] as const;

await sql`insert into companies (id, name, slug) values (${EMPRESA_ID}, 'Empresa Ensaio', 'empresa-ensaio') on conflict (id) do nothing`;
for (const u of USUARIOS) {
  await sql`insert into auth.users (id, email, raw_user_meta_data, email_confirmed_at) values (${u.id}, ${u.email}, ${sql.json({ full_name: u.nome })}, now()) on conflict (id) do nothing`;
  await sql`insert into profiles (id, email, full_name) values (${u.id}, ${u.email}, ${u.nome}) on conflict (id) do nothing`;
  await sql`insert into memberships (company_id, user_id, role) select ${EMPRESA_ID}, ${u.id}, ${u.papel}::user_role where not exists (select 1 from memberships where company_id = ${EMPRESA_ID} and user_id = ${u.id})`;
}
const etapas = [["Novo", "#2563EB", 0, "open", true], ["Em atendimento", "#9D5100", 1, "open", false], ["Proposta", "#7C3AED", 2, "open", false], ["Ganho", "#007545", 3, "won", false]] as const;
for (const [nome, cor, ordem, tipo, entrada] of etapas) {
  await sql`insert into stages (company_id, name, color, order_index, kind, is_entry)
            select ${EMPRESA_ID}, ${nome}, ${cor}, ${ordem}, ${tipo}, ${entrada}
            where not exists (select 1 from stages where company_id = ${EMPRESA_ID} and name = ${nome})`;
}
const [conta] = await sql`insert into wa_accounts (company_id, waba_id, display_name, status) values (${EMPRESA_ID}, 'WABA1', 'Empresa Ensaio', 'active')
                          on conflict do nothing returning id`;
const contaId = conta?.id ?? (await sql`select id from wa_accounts where company_id = ${EMPRESA_ID} and waba_id = 'WABA1'`)[0].id;
await sql`insert into wa_phone_numbers (account_id, company_id, phone_number_id, display_phone, mode, status, webhook_subscribed_at, is_on_biz_app)
          select ${contaId}, ${EMPRESA_ID}, 'PNID_TESTE', '5527900000000', 'coexistence', 'active', now(), true
          where not exists (select 1 from wa_phone_numbers where phone_number_id = 'PNID_TESTE')`;
await sql`insert into wa_credentials (account_id, access_token_enc) values (${contaId}, ${cifrarToken("TOKEN_OK", WA_TOKEN_KEY)})
          on conflict (account_id) do update set access_token_enc = excluded.access_token_enc`;
console.log("semeado: empresa, 3 usuários (senha ensaio-senha), 4 etapas, número PNID_TESTE conectado");
await sql.end();
