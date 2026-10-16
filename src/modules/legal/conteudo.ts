/**
 * Textos das páginas públicas exigidas pela Meta (privacidade, termos, exclusão
 * de dados). Ficam em dados, e não em JSX, para poderem ser testados: a análise
 * do app recusa página que não fale do que o produto faz com WhatsApp e dados.
 *
 * Só afirma o que o sistema comprovadamente faz. Em particular NÃO promete
 * prazo de retenção que não esteja implementado.
 */
export const PRODUTO = "ALT Leadflow";
export const SITE = "https://altleadflow.com.br";
export const CONTATO = "altpartners.contato@gmail.com";
export const EMPRESA = {
  razaoSocial: "Alt Negocios e Solucoes Digitais LTDA",
  nomeFantasia: "Alt Partners",
  cnpj: "64.560.862/0001-51",
  cidade: "Vila Velha, ES",
} as const;
/** Como a empresa se identifica no topo de cada documento. */
export const IDENTIFICACAO = `${PRODUTO} é um produto de ${EMPRESA.razaoSocial} (${EMPRESA.nomeFantasia}), CNPJ ${EMPRESA.cnpj}, ${EMPRESA.cidade}.`;
export const ATUALIZADO_EM = "16 de outubro de 2026";

export interface Secao {
  titulo: string;
  paragrafos: string[];
}
export interface Pagina {
  titulo: string;
  resumo: string;
  secoes: Secao[];
}

export const PRIVACIDADE: Pagina = {
  titulo: "Política de Privacidade",
  resumo:
    "Como o ALT Leadflow trata dados pessoais ao capturar leads, atender conversas e conectar o WhatsApp Business.",
  secoes: [
    {
      titulo: "Quem somos e qual é o nosso papel",
      paragrafos: [
        IDENTIFICACAO,
        "O ALT Leadflow é uma plataforma de captação, qualificação e atendimento de leads. Cada empresa que usa a plataforma (nossa cliente) decide quais dados coleta de seus contatos e para quê: ela é a controladora desses dados. O ALT Leadflow atua como operador, tratando-os conforme as instruções da cliente e esta política.",
        `Sobre os dados de quem usa a plataforma (usuários das empresas clientes), o ALT Leadflow é o controlador. Contato do encarregado: ${CONTATO}.`,
      ],
    },
    {
      titulo: "Quais dados tratamos",
      paragrafos: [
        "Dados de contato de leads informados em formulários e quizzes das empresas clientes (nome, e-mail, telefone e respostas), com a origem da campanha (UTMs, identificadores de clique).",
        "Mensagens trocadas pelo WhatsApp Business entre a empresa cliente e seus contatos: texto, mídia enviada ou recebida, horário, estado de entrega e o número de telefone do contato.",
        "Dados de conexão com a Meta: identificadores da conta do WhatsApp Business e do número, e a credencial de acesso concedida pela empresa cliente. A credencial é guardada cifrada e nunca é exibida de volta na tela.",
        "Dados de conta dos usuários da plataforma: nome, e-mail e papel na empresa.",
      ],
    },
    {
      titulo: "Para que usamos",
      paragrafos: [
        "Receber, organizar e responder conversas e leads da empresa cliente, enviar mensagens autorizadas por ela (incluindo modelos aprovados pela Meta) e medir o resultado das campanhas.",
        "Não vendemos dados pessoais e não usamos o conteúdo das conversas para publicidade própria.",
      ],
    },
    {
      titulo: "Compartilhamento",
      paragrafos: [
        "Com a Meta Platforms, na medida necessária para enviar e receber mensagens pela API oficial do WhatsApp Business e para medir conversões das campanhas da empresa cliente.",
        "Com provedores de infraestrutura que hospedam a plataforma, sob dever de confidencialidade. Não compartilhamos dados com terceiros para fins próprios deles.",
      ],
    },
    {
      titulo: "Opt-out e respeito ao contato",
      paragrafos: [
        'Quando um contato pede para parar de receber mensagens (por exemplo, respondendo "sair" ou "parar"), o sistema registra o pedido e deixa de enviar mensagens a ele. A plataforma também respeita a janela de 24 horas e as regras de modelos de mensagem do WhatsApp Business.',
      ],
    },
    {
      titulo: "Segurança",
      paragrafos: [
        "Credenciais de acesso à Meta são cifradas antes de serem gravadas. Mídias de conversas ficam em armazenamento privado e só são acessadas por links temporários. Cada empresa só enxerga os próprios dados, com isolamento por empresa no banco de dados. Os avisos que recebemos da Meta (webhooks) têm a assinatura conferida antes de serem aceitos.",
      ],
    },
    {
      titulo: "Seus direitos (LGPD)",
      paragrafos: [
        "Você pode pedir confirmação do tratamento, acesso, correção, anonimização, portabilidade, eliminação dos dados e informação sobre compartilhamento, conforme o art. 18 da Lei 13.709/2018.",
        `Se seus dados foram coletados por uma de nossas empresas clientes, o pedido deve ser dirigido a ela; podemos ajudar a atendê-lo. Para pedidos sobre os dados que tratamos como controlador, escreva para ${CONTATO}.`,
        "Para pedir a exclusão dos seus dados, veja também a página de exclusão de dados.",
      ],
    },
    {
      titulo: "Retenção",
      paragrafos: [
        "Mantemos os dados enquanto a conta da empresa cliente estiver ativa ou enquanto necessário para cumprir obrigações legais. A empresa cliente pode pedir a eliminação a qualquer momento, e atendemos pedidos de exclusão pelo canal indicado abaixo.",
      ],
    },
    {
      titulo: "Alterações e contato",
      paragrafos: [
        `Esta política pode ser atualizada; a data da última atualização está no topo da página. Dúvidas: ${CONTATO}.`,
      ],
    },
  ],
};

export const TERMOS: Pagina = {
  titulo: "Termos de Serviço",
  resumo: "Condições de uso da plataforma ALT Leadflow.",
  secoes: [
    {
      titulo: "O serviço",
      paragrafos: [
        IDENTIFICACAO,
        "O ALT Leadflow oferece captação e qualificação de leads, um atendimento por conversa e integrações com serviços de terceiros, incluindo a API oficial do WhatsApp Business da Meta. Ao usar a plataforma, a empresa cliente aceita estes termos.",
      ],
    },
    {
      titulo: "Responsabilidades da empresa cliente",
      paragrafos: [
        "Garantir base legal para tratar os dados dos seus contatos e para enviar mensagens a eles, respeitando a LGPD e as políticas do WhatsApp Business e da Meta, inclusive a exigência de consentimento e as regras de modelos de mensagem.",
        "Manter sigilo das credenciais de acesso e responder pelo uso da própria conta e dos usuários que convidar.",
        "Não usar a plataforma para spam, conteúdo ilegal, assédio ou qualquer prática que viole as políticas da Meta.",
      ],
    },
    {
      titulo: "Integração com a Meta",
      paragrafos: [
        "A empresa cliente conecta a própria conta do WhatsApp Business e pode desconectá-la a qualquer momento. A disponibilidade do envio depende da Meta e das regras dela, como qualidade do número, limites e janela de 24 horas, sobre as quais o ALT Leadflow não tem controle.",
      ],
    },
    {
      titulo: "Disponibilidade e limitação de responsabilidade",
      paragrafos: [
        "Trabalhamos para manter a plataforma disponível, mas não garantimos funcionamento ininterrupto. Não nos responsabilizamos por indisponibilidade de serviços de terceiros, nem por bloqueios ou restrições aplicados pela Meta à conta da empresa cliente.",
      ],
    },
    {
      titulo: "Encerramento e contato",
      paragrafos: [
        `A empresa cliente pode encerrar o uso e pedir a eliminação dos dados a qualquer momento. Podemos suspender contas que violem estes termos. Contato: ${CONTATO}.`,
      ],
    },
  ],
};

export const EXCLUSAO: Pagina = {
  titulo: "Exclusão de dados",
  resumo: "Como pedir a exclusão dos seus dados no ALT Leadflow.",
  secoes: [
    {
      titulo: "Como pedir",
      paragrafos: [
        IDENTIFICACAO,
        `Envie um e-mail para ${CONTATO} com o assunto "Exclusão de dados", informando o e-mail ou o número de telefone associado aos dados. Para sua segurança, podemos pedir uma confirmação de que você é o titular.`,
        "Se você usou o login da Meta para conectar uma conta do WhatsApp Business, também pode remover o acesso do ALT Leadflow nas configurações de Integrações da sua conta empresarial na Meta; depois, peça a exclusão dos dados pelo e-mail acima.",
      ],
    },
    {
      titulo: "O que fazemos",
      paragrafos: [
        "Eliminamos os dados pessoais associados ao pedido que tratamos como controlador, e orientamos a empresa cliente a eliminar os que tratamos como operador, quando for ela a controladora. Confirmamos a conclusão por e-mail.",
        "Dados que precisemos guardar para cumprir obrigação legal ou para exercício regular de direitos podem ser mantidos pelo prazo exigido, e informamos isso na resposta.",
      ],
    },
  ],
};
