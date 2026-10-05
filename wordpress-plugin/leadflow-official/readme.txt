=== AltLeadFlow Official ===
Contributors: altleadflow
Tested up to: 6.7
Stable tag: 2.1.0
License: GPL2

Formulários, quizzes, chat e WhatsApp do AltLeadFlow no WordPress.

== Changelog ==

= 2.1.0 =
* O formulário passa a ser inserido por `data-lf-form`, que é observado pelo SDK
  mesmo quando a página é montada depois do carregamento — o caso do Elementor
  e de qualquer construtor visual. A versão anterior usava `LeadFlow.init` num
  script inline e não pegava esse cenário.
* Alternativa visível quando o SDK não carrega: antes o bloco não renderizava
  NADA, sem erro nem aviso, e o visitante via um espaço em branco.
* Novo modo `mode="botao"`, que gera um link abrindo o formulário em janela.
* Deixa claro na tela de configuração que sem o ID da empresa nem o chat nem o
  WhatsApp são carregados.

= 2.0.0 =
* Versão inicial.
