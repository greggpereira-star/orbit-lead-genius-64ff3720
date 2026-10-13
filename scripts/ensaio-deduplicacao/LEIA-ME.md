# Aplicar a deduplicação de lead

A migração `supabase/migrations/20261013120000_lead_sem_duplicata.sql` muda
`quiz_capture_lead`, que é o caminho por onde **todo lead de quiz entra**. Por
isso ela não vai direto para produção: primeiro o ensaio.

## Por que ela existe

Medido nesta base em 13/10/2026: **560 leads, 28 linhas excedentes** — 5% do
CRM é a mesma pessoa contada duas ou três vezes. A causa é que o único critério
para reconhecer um lead já existente era `quiz_id` + `session_id`: quem responde
de novo noutro dia, ou responde um segundo quiz, nasce como lead novo.

## 1. Ensaiar (não grava nada)

```bash
./scripts/ensaio-deduplicacao/rodar.sh
```

Junta a migração e os testes entre `BEGIN` e `ROLLBACK`. Roda contra o banco de
verdade — de propósito, porque é o schema real, as funções reais e o quiz
publicado real que precisam ser exercitados — e desfaz tudo no fim. Se algum
teste falhar, a transação aborta e também não grava.

**Já foi executado em 13/10 e passou nos 7 testes.** Depois dele, conferido:
`leads` seguia com 560 linhas, nenhum resíduo `@ensaio.invalid`, e nem a função
`normalizar_telefone_br` nem os índices tinham sido criados.

O que cada teste cobre:

| # | o que verifica |
|---|---|
| 1 | o que já funcionava continua: mesma sessão, um lead só |
| 2 | **o conserto**: sessão nova com o mesmo e-mail não cria lead novo |
| 3 | telefone escrito de outro jeito (`+55 (11) …`) é a mesma pessoa |
| 4 | **a armadilha**: `(11) 99999-0001` e `(21) 99999-0001` continuam pessoas diferentes |
| 5 | quem é novo mesmo continua entrando |
| 6 | normalização do telefone, caso a caso |
| 7 | 5 submissões viram 3 leads — a contagem que faltava |
| 8 | **não é teste, é aviso** — veja abaixo |

## 2. Decidir o ponto 8 antes de aplicar

O ensaio termina avisando:

> o nome do lead ficou: "ANA (digitado torto)"

O trecho de atualização **sobrescreve o nome** quando a submissão nova traz um.
Isso já era assim dentro da mesma sessão, onde faz sentido. Agora que o lead
também é encontrado por contato, um nome digitado diferente numa segunda
resposta passa a trocar o nome do lead existente.

**Se o seu time corrige nome na mão no CRM, isso vai desfazer a correção.** É
uma linha para mudar — peça antes de aplicar.

## 3. Aplicar de verdade

Só depois do ensaio passar e do ponto 8 estar decidido:

```bash
cat supabase/migrations/20261013120000_lead_sem_duplicata.sql \
  | ssh altflow 'docker exec -i altleadflow-db psql -U postgres -v ON_ERROR_STOP=1 --single-transaction'
```

`--single-transaction` garante o tudo-ou-nada: erro no meio não deixa metade
aplicada.

## 4. Conferir depois

```bash
ssh altflow "docker exec altleadflow-db psql -U postgres -c \"
  select count(*) from pg_proc where proname='normalizar_telefone_br';
  select indexname from pg_indexes where indexname like 'leads_empresa_%';
\""
```

Esperado: a função existe (1) e os dois índices aparecem.

Depois disso, responda um quiz publicado duas vezes em **sessões diferentes**
com o mesmo e-mail e confira que entrou **um** lead, não dois.

## O que a migração NÃO faz

Ela impede duplicata **nova**. As 28 linhas que já estão lá continuam onde
estão — juntar lead existente é outra operação, que mexe em histórico,
responsável e etapa, e precisa de decisão caso a caso. Se quiser, dá para
levantar a lista dos repetidos para você revisar antes de qualquer fusão.
