-- A chave da resposta não pode se repetir dentro do mesmo formulário
--
-- `form_fields.name` é a chave com que a resposta é gravada em
-- `form_submissions.answers` e lida pela pontuação. Ela vinha de
-- `f.name || 'field_' || index` no construtor: posicional e invisível.
--
-- A colisão é fácil de produzir: um formulário com os campos 0 e 1 (chaves
-- `field_0` e `field_1`); apague o campo 0; adicione outro. O novo entra na
-- posição 1 e recebe `field_1` — a mesma chave do campo que continua lá. As
-- duas respostas passam a disputar a mesma posição no JSON e uma sobrescreve a
-- outra, sem erro em lugar nenhum.
--
-- Medido em 04/10/2026: `form_fields` tinha apenas a chave primária e índices
-- de busca. Nada impedia a repetição.
--
-- O construtor agora deriva a chave do rótulo e garante unicidade enquanto a
-- pessoa edita. Este índice é a rede embaixo: qualquer caminho que tente
-- gravar repetido — código futuro, importação, script — é recusado pelo banco
-- em vez de corromper as respostas em silêncio.

-- Desempata o que por acaso já estiver repetido, antes de criar o índice.
-- Em produção não há formulário nenhum (0 linhas em `forms`), então isto não
-- toca em nada hoje; existe para a migração não falhar em outro ambiente.
with repetidos as (
  select id,
         name,
         row_number() over (partition by form_id, name order by sort_order, id) as n
    from public.form_fields
   where name is not null and name <> ''
)
update public.form_fields f
   set name = f.name || '_' || r.n
  from repetidos r
 where f.id = r.id and r.n > 1;

-- Campo sem nome não entra no índice: o `where` evita que dois rascunhos
-- vazios colidam entre si.
create unique index if not exists form_fields_form_name_uniq
  on public.form_fields (form_id, name)
  where name is not null and name <> '';

comment on index public.form_fields_form_name_uniq is
  'Uma chave de resposta por formulário. Impede que um campo sobrescreva a resposta de outro.';
