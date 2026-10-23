/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from "vitest";
import { acaoNotificarEquipe, textoPadraoDoAviso, type JobDeAviso } from "./notificarEquipe";

interface Linha {
  user_id: string;
  title: string;
  body: string | null;
  dedup_key: string;
  conversation_id: string | null;
  lead_id: string | null;
}

function dbFalso(opts: {
  equipe: Array<{ user_id: string; role: string }>;
  leadResponsavel?: string | null;
  erroNoUpsert?: string;
}) {
  const gravadas: Linha[] = [];
  const upserts: Array<{ onConflict?: string; ignoreDuplicates?: boolean }> = [];
  const db = {
    from(tabela: string) {
      const q: any = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => Promise.resolve({ data: { assigned_to: opts.leadResponsavel ?? null } }),
        upsert: (linhas: Linha[], o: { onConflict?: string; ignoreDuplicates?: boolean }) => {
          expect(tabela).toBe("team_notifications");
          upserts.push(o);
          if (opts.erroNoUpsert) return Promise.resolve({ error: { message: opts.erroNoUpsert } });
          gravadas.push(...linhas);
          return Promise.resolve({ error: null });
        },
        then: (ok: (v: unknown) => unknown) =>
          Promise.resolve({ data: tabela === "memberships" ? opts.equipe : [], error: null }).then(
            ok,
          ),
      };
      return q;
    },
  };
  return { db, gravadas, upserts };
}

const job = (over: Partial<JobDeAviso> = {}): JobDeAviso => ({
  id: "job1",
  company_id: "emp",
  lead_id: "lead1",
  trigger_event: "customer_no_reply",
  payload: { nome: "Ana", minutos_esperando: 42, conversation_id: "conv1", responsavel_id: "u2" },
  ...over,
});

const equipe = [
  { user_id: "u1", role: "owner" },
  { user_id: "u2", role: "member" },
  { user_id: "u3", role: "viewer" },
];

describe("ação Notificar equipe", () => {
  it("responsável: avisa só quem está com a conversa, com o texto padrão preenchido", async () => {
    const { db, gravadas } = dbFalso({ equipe });
    const r = await acaoNotificarEquipe(db, job(), {
      id: "a1",
      config: { destino: "responsavel" },
    });
    expect(r.status).toBe("ok");
    expect(gravadas.map((l) => l.user_id)).toEqual(["u2"]);
    expect(gravadas[0].title).toBe("Ana está sem resposta há 42 min");
    expect(gravadas[0].conversation_id).toBe("conv1");
    expect(gravadas[0].lead_id).toBe("lead1");
  });

  it("sem responsável cai para quem atende (visualizador não é avisado)", async () => {
    const { db, gravadas } = dbFalso({ equipe });
    await acaoNotificarEquipe(db, job({ payload: { nome: "Ana", minutos_esperando: 5 } }), {
      id: "a1",
      config: { destino: "responsavel" },
    });
    expect(gravadas.map((l) => l.user_id).sort()).toEqual(["u1", "u2"]);
  });

  it("responsável que não é mais da empresa também cai para quem atende", async () => {
    const { db, gravadas } = dbFalso({ equipe });
    await acaoNotificarEquipe(db, job({ payload: { responsavel_id: "saiu" } }), {
      id: "a1",
      config: { destino: "responsavel" },
    });
    expect(gravadas.map((l) => l.user_id).sort()).toEqual(["u1", "u2"]);
  });

  it("usa o responsável do lead quando a conversa não traz", async () => {
    const { db, gravadas } = dbFalso({ equipe, leadResponsavel: "u1" });
    await acaoNotificarEquipe(db, job({ payload: { nome: "Ana" } }), {
      id: "a1",
      config: { destino: "responsavel" },
    });
    expect(gravadas.map((l) => l.user_id)).toEqual(["u1"]);
  });

  it("todos: owner, admin e member; nunca o visualizador", async () => {
    const { db, gravadas } = dbFalso({ equipe });
    await acaoNotificarEquipe(db, job(), { id: "a1", config: { destino: "todos" } });
    expect(gravadas.map((l) => l.user_id).sort()).toEqual(["u1", "u2"]);
  });

  it("usuário escolhido precisa ser da empresa", async () => {
    const { db, gravadas } = dbFalso({ equipe });
    const ruim = await acaoNotificarEquipe(db, job(), {
      id: "a1",
      config: { destino: "usuario", user_id: "intruso" },
    });
    expect(ruim.status).toBe("falhou");
    expect(gravadas).toHaveLength(0);
    const bom = await acaoNotificarEquipe(db, job(), {
      id: "a1",
      config: { destino: "usuario", user_id: "u3" },
    });
    expect(bom.status).toBe("ok");
    expect(gravadas.map((l) => l.user_id)).toEqual(["u3"]);
  });

  it("a chave de dedup liga o aviso ao job e à ação: nova tentativa não duplica", async () => {
    const { db, gravadas, upserts } = dbFalso({ equipe });
    await acaoNotificarEquipe(db, job(), { id: "a1", config: { destino: "todos" } });
    expect(gravadas.every((l) => l.dedup_key === "job1:a1")).toBe(true);
    expect(upserts[0]).toEqual({ onConflict: "user_id,dedup_key", ignoreDuplicates: true });
  });

  it("título e mensagem da regra substituem o padrão e aceitam {{campos}}", async () => {
    const { db, gravadas } = dbFalso({ equipe });
    await acaoNotificarEquipe(db, job(), {
      id: "a1",
      config: {
        destino: "todos",
        titulo: "Atenção: {{nome}}",
        mensagem: "Faz {{minutos_esperando}} min",
      },
    });
    expect(gravadas[0].title).toBe("Atenção: Ana");
    expect(gravadas[0].body).toBe("Faz 42 min");
  });

  it("ninguém para avisar: pulada; erro de gravação: falhou", async () => {
    const vazio = dbFalso({ equipe: [{ user_id: "v", role: "viewer" }] });
    expect(
      (await acaoNotificarEquipe(vazio.db, job(), { id: "a", config: { destino: "todos" } }))
        .status,
    ).toBe("pulada");
    const quebrado = dbFalso({ equipe, erroNoUpsert: "boom" });
    const r = await acaoNotificarEquipe(quebrado.db, job(), {
      id: "a",
      config: { destino: "todos" },
    });
    expect(r).toMatchObject({ status: "falhou", detalhe: "boom" });
  });

  it("texto padrão existe para os dois gatilhos de tempo", () => {
    expect(textoPadraoDoAviso("window_expiring").titulo).toContain("{{minutos_restantes}}");
    expect(textoPadraoDoAviso("customer_no_reply").titulo).toContain("{{minutos_esperando}}");
    expect(textoPadraoDoAviso("conversation_resolved").titulo).toContain("{{nome}}");
    expect(textoPadraoDoAviso("conversation_assigned").titulo).toContain("{{nome}}");
    expect(textoPadraoDoAviso("qualquer").titulo).toBeTruthy();
  });
});
