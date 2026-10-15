import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { AVISO_DO_EMAIL, avisoVisivelDoEmail, sugerirCorrecao, validarEmail } from "./email";

/**
 * Medido em 14/10, na base: ZERO e-mails com formato inválido — a Meta já
 * valida — e 3 de 558 leads com erro de digitação de provedor (`gmial.com` e
 * parentes). Esses PARECEM válidos, e nenhuma regra de formato os pega: o
 * e-mail é de ninguém, e a confirmação e a automação vão para o vazio.
 *
 * Por isso duas peças de naturezas diferentes: `validarEmail` BARRA o que não é
 * e-mail; `sugerirCorrecao` só SUGERE, nunca barra.
 */
describe("validarEmail: o que serve", () => {
  const bons = [
    "ana@gmail.com",
    "ana.silva@empresa.com.br",
    "ana+quiz@gmail.com",
    "a_b-c@sub.dominio.org",
    "  ana@gmail.com  ", // espaço nas pontas sai, não reprova
    "ANA@GMAIL.COM",
    "gregg.pereira@gmail.com",
  ];
  for (const e of bons) it(JSON.stringify(e), () => expect(validarEmail(e)).toBeNull());

  it("vazio serve: quem decide é `required`", () => {
    for (const v of ["", "   ", null, undefined]) expect(validarEmail(v)).toBeNull();
  });
});

describe("validarEmail: o que não serve, e o que a pessoa lê", () => {
  it("abc, que o botão do quiz deixava passar", () => {
    // `type="email"` só vale para envio de <form>; o botão não é um.
    expect(validarEmail("abc")).toBe(AVISO_DO_EMAIL.semArroba);
  });

  it("sem domínio", () => {
    expect(validarEmail("ana@")).toBe(AVISO_DO_EMAIL.geral);
    expect(validarEmail("ana@gmail")).toBe(AVISO_DO_EMAIL.semDominio);
  });

  it("com espaço no meio", () => {
    expect(validarEmail("ana silva@gmail.com")).toBe(AVISO_DO_EMAIL.espaco);
  });

  it("dois @", () => {
    expect(validarEmail("ana@@gmail.com")).toBe(AVISO_DO_EMAIL.geral);
    expect(validarEmail("a@b@gmail.com")).toBe(AVISO_DO_EMAIL.geral);
  });

  it("ponto repetido, no começo ou no fim da parte local", () => {
    for (const e of ["ana..silva@gmail.com", ".ana@gmail.com", "ana.@gmail.com"]) {
      expect(validarEmail(e), e).toBe(AVISO_DO_EMAIL.geral);
    }
  });

  it("final com menos de duas letras", () => {
    expect(validarEmail("ana@gmail.c")).toBe(AVISO_DO_EMAIL.geral);
  });

  it("sem parte local", () => {
    expect(validarEmail("@gmail.com")).toBe(AVISO_DO_EMAIL.geral);
  });
});

describe("sugerirCorrecao", () => {
  it("o erro que a base mostrou", () => {
    expect(sugerirCorrecao("ana@gmial.com")).toBe("ana@gmail.com");
  });

  it("os parentes comuns", () => {
    const casos: [string, string][] = [
      ["a@gmai.com", "a@gmail.com"],
      ["a@gmail.con", "a@gmail.com"],
      ["a@gmail.com.br", "a@gmail.com"],
      ["a@hotmial.com", "a@hotmail.com"],
      ["a@hotmail.con", "a@hotmail.com"],
      ["a@outlok.com", "a@outlook.com"],
      ["a@yaho.com", "a@yahoo.com"],
      ["a@yahoo.con", "a@yahoo.com"],
    ];
    for (const [errado, certo] of casos) expect(sugerirCorrecao(errado), errado).toBe(certo);
  });

  it("preserva a parte local exatamente como foi digitada", () => {
    // A parte antes do @ é da pessoa; nenhuma regra sabe que está errada.
    expect(sugerirCorrecao("Ana.Silva+quiz@gmial.com")).toBe("Ana.Silva+quiz@gmail.com");
  });

  it("e-mail certo não recebe sugestão", () => {
    for (const e of ["ana@gmail.com", "ana@hotmail.com", "ana@empresa.com.br"]) {
      expect(sugerirCorrecao(e), e).toBeNull();
    }
  });

  it("NÃO sugere para domínios reais que parecem erro", () => {
    /* A lista é FECHADA de propósito. Distância de edição sugeriria gmail.com
       para gmx.com e hotmail.com para hotmart.com — domínios reais de gente
       real, e a sugestão errada perde o lead. */
    for (const e of ["ana@gmx.com", "ana@hotmart.com", "ana@mail.com", "ana@live.com"]) {
      expect(sugerirCorrecao(e), e).toBeNull();
    }
  });

  it("não sugere em e-mail que nem é e-mail", () => {
    expect(sugerirCorrecao("gmial.com")).toBeNull();
    expect(sugerirCorrecao("")).toBeNull();
    expect(sugerirCorrecao(null)).toBeNull();
  });
});

describe("quando o aviso aparece", () => {
  it("não acusa quem está digitando", () => {
    expect(avisoVisivelDoEmail("ana", false)).toBeNull();
    expect(avisoVisivelDoEmail("ana@gm", false)).toBeNull();
  });

  it("aparece ao sair do campo", () => {
    expect(avisoVisivelDoEmail("ana", true)).not.toBeNull();
  });

  it("aparece sozinho quando já parece terminado, para não deixar o botão mudo", () => {
    /* Medido: no Chromium clicar no botão desabilitado tira o foco do campo.
       No iOS Safari é diferente e não deu para medir — daí o segundo gatilho. */
    expect(avisoVisivelDoEmail("ana@gmail.c", false)).toBe(AVISO_DO_EMAIL.geral);
  });

  it("some quando corrige", () => {
    expect(avisoVisivelDoEmail("ana@gmail.com", true)).toBeNull();
  });
});

describe("o player usa a validação nos dois caminhos", () => {
  const player = readFileSync("src/modules/quiz/components/QuizPlayer.tsx", "utf8");
  const canSubmit = (() => {
    const i = player.indexOf("const canSubmit = useMemo");
    return player.slice(i, player.indexOf("onValidChange?.(canSubmit)", i));
  })();

  it("o bloco E-mail bloqueia e-mail inválido, e o veredito entra no return", () => {
    expect(canSubmit).toContain('block.type === "email"');
    expect(canSubmit).toContain("validarEmail(texto) !== null");
    expect(canSubmit, "emailInvalido não alimenta o veredito").toContain(
      "const contatoInvalido = telefoneInvalido || emailInvalido;",
    );
  });

  it("o Formulário também — era só 'não vazio'", () => {
    expect(canSubmit).toContain("formularioPodeAvancar(block.formFields, formValue)");
  });

  it("a sugestão só aparece depois de sair do campo", () => {
    // Mostrar "gmail.co" → "gmail.com" no meio da digitação é corrigir quem
    // ainda está escrevendo.
    expect(player).toContain('block.type === "email" && emailTocado && !avisoDoEmail');
  });

  it("a sugestão é oferecida, não imposta", () => {
    // Um botão que a pessoa aceita; o valor digitado nunca é trocado sozinho.
    expect(player).toContain("setValue(sugestaoDeEmail)");
    expect(player).not.toMatch(/setValue\(\s*sugerirCorrecao\(/);
  });

  it("o campo diz ao teclado do celular que é e-mail", () => {
    expect(player).toContain('inputMode="email"');
    expect(player).toContain('autoCapitalize="none"');
  });
});
