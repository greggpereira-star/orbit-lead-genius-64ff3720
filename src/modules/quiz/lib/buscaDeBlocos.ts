/** Tira acento e caixa: "vídeo" tem de achar com "video". */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Filtra a paleta por nome, descrição e categoria.
 *
 * Busca em TRÊS campos e não só no rótulo: quem procura "whatsapp" quer o bloco
 * Telefone, cuja descrição é que diz isso; quem digita "captura" quer a
 * categoria inteira. Casar só pelo nome devolveria vazio nos dois casos e o
 * usuário concluiria que o recurso não existe.
 */
export function filtrarBlocos<T extends { label: string; description: string; category: string }>(
  itens: readonly { def: T }[],
  termo: string,
  rotuloDaCategoria: (c: string) => string,
): { def: T }[] {
  const t = normalizar(termo);
  if (!t) return [...itens];
  return itens.filter(({ def }) =>
    [def.label, def.description, rotuloDaCategoria(def.category)].some((campo) =>
      normalizar(campo).includes(t),
    ),
  );
}
