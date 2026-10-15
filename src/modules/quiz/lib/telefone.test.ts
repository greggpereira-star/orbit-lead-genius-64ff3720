import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import {
  AVISO_DO_TELEFONE,
  avisoVisivelDoTelefone,
  ehCampoDeTelefone,
  formatarEnquantoDigita,
  validarTelefone,
} from "./telefone";
import { normalizarTelefone } from "@/modules/crm/lib/identidadeDoLead";

/**
 * Relato com captura em 14/10: o lead de teste entrou com `2121121221212` —
 * treze dígitos, que não é número de lugar nenhum — e o painel ainda deduziu
 * "Rio de Janeiro, RJ" pelo DDD. O bloco Formulário não tinha máscara, nem
 * limite, e só conferia o e-mail; o bloco Telefone só exigia "não vazio".
 *
 * Telefone inválido é lead que o vendedor não consegue chamar e que o WhatsApp
 * automático da faixa não alcança.
 */
describe("o número que chegou ao CRM", () => {
  it("2121121221212 não serve", () => {
    expect(validarTelefone("2121121221212")).toBe(AVISO_DO_TELEFONE.incompleto);
  });
});

describe("validarTelefone: o que serve", () => {
  const bons = [
    "(11) 99999-8888",
    "11999998888",
    "11 99999-8888",
    "+55 11 99999-8888",
    "5511999998888",
    "011 99999 8888",
    "(11) 3333-4444", // fixo
    "(27) 3222-1100",
    "21 98765-4321",
  ];
  for (const n of bons) {
    it(n, () => expect(validarTelefone(n)).toBeNull());
  }

  it("vazio serve: quem decide é `required`", () => {
    // Misturar as duas coisas mostraria "inválido" para quem nem começou.
    for (const v of ["", "   ", null, undefined]) expect(validarTelefone(v)).toBeNull();
  });

  it("número do exterior passa sem as regras do Brasil", () => {
    // O quiz é brasileiro, mas barrar quem mora fora perderia o lead por uma
    // regra que não vale para ele.
    expect(validarTelefone("+1 415 555 2671")).toBeNull();
    expect(validarTelefone("+351 912 345 678")).toBeNull();
  });
});

describe("validarTelefone: o que não serve, e por quê", () => {
  it("tamanho impossível", () => {
    for (const n of ["99998888", "123", "119999", "11999998888123"]) {
      expect(validarTelefone(n), n).toBe(AVISO_DO_TELEFONE.incompleto);
    }
  });

  it("DDD que não existe", () => {
    // 10, 20, 23, 25, 26, 29... não são DDD de ninguém.
    for (const n of ["10999998888", "20999998888", "23999998888", "(29) 99999-8888"]) {
      expect(validarTelefone(n), n).toBe(AVISO_DO_TELEFONE.ddd);
    }
  });

  it("celular sem o 9", () => {
    expect(validarTelefone("(11) 89999-8888")).toBe(AVISO_DO_TELEFONE.celular);
  });

  it("repetido, de quem digita para passar de tela", () => {
    expect(validarTelefone("11999999999")).toBe(AVISO_DO_TELEFONE.repetido);
    expect(validarTelefone("(11) 3333-3333")).toBe(AVISO_DO_TELEFONE.repetido);
  });

  it("internacional com tamanho absurdo", () => {
    expect(validarTelefone("+1 23")).toBe(AVISO_DO_TELEFONE.internacional);
  });
});

describe("a regra de tamanho é a mesma da deduplicação", () => {
  it("o que o quiz aceita, o CRM consegue casar", () => {
    /* Duas definições de "telefone válido" produziriam um número que o quiz
       aceita e que a deduplicação não reconhece como o mesmo de outro lead. */
    const amostras = [
      "(11) 99999-8888",
      "+55 11 99999-8888",
      "5511999998888",
      "011 99999 8888",
      "(11) 3333-4444",
      "99998888",
      "123",
      "2121121221212",
      "11999998888123",
    ];
    for (const n of amostras) {
      const serveParaOQuiz = validarTelefone(n) === null;
      const casaNoCrm = normalizarTelefone(n) !== null;
      if (serveParaOQuiz) expect(casaNoCrm, n).toBe(true);
    }
  });
});

describe("formatarEnquantoDigita", () => {
  it("formata celular e fixo", () => {
    expect(formatarEnquantoDigita("11999998888")).toBe("(11) 99999-8888");
    expect(formatarEnquantoDigita("1133334444")).toBe("(11) 3333-4444");
  });

  it("colar com país não corta o último algarismo", () => {
    /* Cortar em 11 dígitos na marra deixaria o `55` do país entrar como DDD e
       o último algarismo sumiria. */
    expect(formatarEnquantoDigita("5511999998888")).toBe("(11) 99999-8888");
    expect(formatarEnquantoDigita("+55 (11) 99999-8888")).toBe("(11) 99999-8888");
    expect(formatarEnquantoDigita("011999998888")).toBe("(11) 99999-8888");
  });

  it("não aceita o décimo segundo dígito", () => {
    expect(formatarEnquantoDigita("119999988889999").replace(/\D/g, "")).toHaveLength(11);
  });

  it("formata aos poucos, sem travar o apagar", () => {
    expect(formatarEnquantoDigita("1")).toBe("(1");
    expect(formatarEnquantoDigita("119")).toBe("(11) 9");
    expect(formatarEnquantoDigita("(11) 9")).toBe("(11) 9");
  });

  it("número do exterior fica como foi digitado", () => {
    expect(formatarEnquantoDigita("+1 415 555 2671")).toBe("+1 415 555 2671");
  });
});

describe("quando o aviso aparece", () => {
  it("não acusa quem está começando a digitar", () => {
    expect(avisoVisivelDoTelefone("(11) 9", false)).toBeNull();
  });

  it("aparece ao sair do campo", () => {
    expect(avisoVisivelDoTelefone("(11) 9", true)).not.toBeNull();
  });

  it("aparece sozinho quando já tem tamanho de número", () => {
    expect(avisoVisivelDoTelefone("(10) 99999-8888", false)).toBe(AVISO_DO_TELEFONE.ddd);
  });

  it("some quando a pessoa corrige", () => {
    expect(avisoVisivelDoTelefone("(11) 99999-8888", true)).toBeNull();
  });
});

describe("quais blocos são campo de telefone", () => {
  it("o bloco Telefone e o Texto curto com máscara de telefone", () => {
    expect(ehCampoDeTelefone({ type: "phone" })).toBe(true);
    expect(ehCampoDeTelefone({ type: "short-text", fieldMask: "telefone" })).toBe(true);
  });

  it("Texto curto livre e com outra máscara não são", () => {
    expect(ehCampoDeTelefone({ type: "short-text" })).toBe(false);
    expect(ehCampoDeTelefone({ type: "short-text", fieldMask: "cpf" })).toBe(false);
    expect(ehCampoDeTelefone({ type: "email" })).toBe(false);
  });
});

describe("o player usa a validação nos TRÊS caminhos", () => {
  const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
  const canSubmit = (() => {
    const i = player.indexOf("const canSubmit = useMemo");
    return player.slice(i, player.indexOf("onValidChange?.(canSubmit)", i));
  })();

  it("o bloco Telefone e o Texto curto com máscara bloqueiam número inválido", () => {
    expect(canSubmit).toContain("ehCampoDeTelefone(block)");
    expect(canSubmit).toContain("validarTelefone(texto) !== null");
    /* O `const` existir não basta — foi o que a primeira versão deste teste
       conferia, e ela passava com a variável calculada e NUNCA usada. O que
       bloqueia é o `return` consultá-la. */
    expect(canSubmit, "telefoneInvalido não alimenta o veredito").toContain(
      "const contatoInvalido = telefoneInvalido || emailInvalido;",
    );
    expect(canSubmit, "o veredito é calculado mas não entra no return").toContain(
      "return !contatoInvalido && (",
    );
  });

  it("o Formulário bloqueia telefone inválido — era a entrada sem conferência nenhuma", () => {
    // A regra mora em formulario.ts (função pura, testada abaixo); o player
    // só precisa delegar a ela.
    expect(canSubmit).toContain("formularioPodeAvancar(block.formFields, formValue)");
  });

  it("os dois campos formatam enquanto digitam", () => {
    expect(player).toContain("formatarEnquantoDigita(e.target.value)");
    // Uma vez no bloco simples, outra no Formulário.
    expect((player.match(/formatarEnquantoDigita\(e\.target\.value\)/g) ?? []).length).toBe(2);
  });

  it("os avisos são anunciados por leitor de tela", () => {
    expect(player).toContain("aria-invalid");
    expect((player.match(/role="alert"/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("o botão não fica mudo: quem não passa vê o motivo", () => {
    /* Botão desabilitado sem explicação é tela que mente por omissão. */
    // O bloco simples serve telefone E e-mail pelo mesmo <input>: o motivo
    // vem de `avisoDoCampo`, que para campo de telefone é `avisoDoTelefone`.
    expect(player).toContain("{avisoDoCampo}");
    expect(player).toContain(
      "const avisoDoCampo = ehCampoDeTelefone(block) ? avisoDoTelefone : avisoDoEmail;",
    );
    expect(player).toContain("{avisoDoTelefoneDoForm}");
  });
});
