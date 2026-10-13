import { supabase } from "@/integrations/supabase/client";
import { normalizarNome, problemaDoNome, AVISO_DO_NOME } from "../lib/nomeDoPerfil";

/**
 * Gravar o nome do próprio perfil.
 *
 * Antes desta função a tela de perfil tinha um botão "Salvar" SEM `onClick`:
 * editava-se o nome, clicava, e não acontecia nada — nem gravação, nem erro,
 * nem aviso. Sem mensagem nenhuma, a leitura natural é que deu certo.
 *
 * O nome vive em dois lugares, e os dois precisam ser escritos:
 *
 * - `profiles.full_name` é a fonte que o `WorkspaceOrchestrator` lê ao montar
 *   o contexto, e é o que os colegas de empresa enxergam pela política de
 *   leitura entre membros do mesmo tenant.
 * - `user_metadata.full_name` do Supabase Auth é o que o `AuthContext` usa
 *   como reserva quando o perfil ainda não carregou. Deixar esse para trás
 *   faria o nome antigo reaparecer no primeiro carregamento seguinte.
 *
 * A ordem importa: `profiles` primeiro, porque é a fonte. Se o metadado falhar
 * depois disso, a gravação principal já aconteceu e o pior caso é o nome velho
 * piscar uma vez — ao contrário da ordem inversa, que deixaria o metadado
 * dizendo uma coisa e a tabela outra.
 */
export async function salvarNomeDoPerfil(userId: string, nomeBruto: string): Promise<string> {
  const problema = problemaDoNome(nomeBruto);
  if (problema) throw new Error(AVISO_DO_NOME[problema]);

  const nome = normalizarNome(nomeBruto);

  const { error } = await supabase.from("profiles").update({ full_name: nome }).eq("id", userId);
  if (error) throw new Error(`Não consegui salvar o nome: ${error.message}`);

  const { error: erroMeta } = await supabase.auth.updateUser({ data: { full_name: nome } });
  if (erroMeta) {
    console.warn("Nome salvo no perfil, mas o metadado da sessão não atualizou", erroMeta);
  }

  return nome;
}
