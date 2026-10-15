# Mesclar os leads que já são duplicata

`supabase/migrations/20261015150000_mesclar_leads_duplicados.sql` cria a função
`mesclar_leads_duplicados(p_aplicar boolean default false)`. Ela **não roda
sozinha**: criar a função não mexe em nenhum lead.

## Ordem

1. Aplicar antes a `20261013120000_lead_sem_duplicata.sql` (define
   `normalizar_telefone_br`). Ver `../ensaio-deduplicacao/LEIA-ME.md`.
2. Ensaiar (não grava nada — BEGIN … ROLLBACK):
   ```bash
   ./scripts/ensaio-mesclagem/rodar.sh
   ```
3. Aplicar a migração (só cria a função e a tabela `leads_mesclados`).
4. **Ver o plano**, sem gravar:
   ```sql
   SELECT * FROM public.mesclar_leads_duplicados(false);
   ```
   Confira se os pares fazem sentido (mesmo e-mail / mesmo telefone normalizado).
5. Aplicar de verdade:
   ```sql
   SELECT * FROM public.mesclar_leads_duplicados(true);
   ```

## O que ela faz e o que não faz

- Ganha o lead **mais antigo** (pode ter responsável, etapa e histórico).
- O vencedor só **recebe o que lhe faltava** (nome, e-mail, telefone, responsável);
  nada dele é sobrescrito. Pontuação fica com a maior.
- Etiquetas, eventos, cliques de WhatsApp, submissões etc. são repontados para o
  vencedor — as tabelas são descobertas no catálogo, não listadas à mão. Etiqueta
  que existe nos dois não duplica.
- Cada lead absorvido é copiado inteiro (jsonb) para `public.leads_mesclados`
  antes de sair. Dá para reconstituir.
- `(11) 99999-0001` e `(21) 99999-0001` **não** são juntados (DDD diferente).

## Verificado

Executada num Postgres 16 local descartável, com schema mínimo: 7 testes, e a
mutação (pular o repontamento) derruba o ensaio. **Não foi executada contra a
base real** — o schema de produção tem mais tabelas dependentes; o ensaio acima
é justamente para isso.
