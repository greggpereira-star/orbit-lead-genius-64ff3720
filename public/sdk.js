/**
 * LeadFlow Universal Form SDK
 * @version 1.1.0
 */
(function(window) {
  const LeadFlow = {
    debug: function(msg) {
      if (new URLSearchParams(window.location.search).get('lf_debug') === 'true') {
        console.log('%c[LeadFlow Debug]', 'color: #7c3aed; font-weight: bold;', msg);
      }
    },

    // UTM & Tracking Persistence
    getTrackingData: function() {
      this.debug('Collecting tracking data...');
      const params = new URLSearchParams(window.location.search);
      const tracking = {
        utm_source: params.get('utm_source'),
        utm_medium: params.get('utm_medium'),
        utm_campaign: params.get('utm_campaign'),
        utm_content: params.get('utm_content'),
        utm_term: params.get('utm_term'),
        gclid: params.get('gclid'),
        fbclid: params.get('fbclid'),
        referrer: document.referrer,
        landing_page: window.location.href,
        page_url: window.location.href
      };

      // Persistence in SessionStorage for multi-page tracking
      Object.keys(tracking).forEach(key => {
        if (tracking[key]) {
          sessionStorage.setItem('lf_' + key, tracking[key]);
        } else {
          tracking[key] = sessionStorage.getItem('lf_' + key);
        }
      });

      this.debug('Tracking data collected: ' + JSON.stringify(tracking));
      return tracking;
    },

    // Build Public URL with UTM forward
    buildUrl: function(formId) {
      const tracking = this.getTrackingData();
      
      // Identificar URL base do SDK
      let baseUrl = window.location.origin;
      const scripts = document.getElementsByTagName('script');
      for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].src;
        if (src && src.indexOf('sdk.js') !== -1) {
          try {
            baseUrl = new URL(src).origin;
            break;
          } catch(e) {}
        }
      }
      
      // Se estiver rodando local no WordPress ou similar, garantir que aponte para o domínio da App
      if (baseUrl.indexOf('localhost') !== -1 || baseUrl.indexOf('127.0.0.1') !== -1 || baseUrl.indexOf('.local') !== -1) {
        // Fallback para o domínio de produção se o SDK for carregado localmente de forma indevida
        if (window.location.hostname.indexOf('localhost') === -1) {
           baseUrl = 'https://lovable-crm-pro.lovable.app';
        }
      }

      // If formId is a UUID, use the embed route. Otherwise use slug route.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formId);
      
      // Forçar o caminho absoluto para evitar que o iframe tente carregar rotas relativas do site cliente
      const path = isUuid ? '/embed-form/' + formId : '/f/' + formId;
      const url = new URL(path, baseUrl);
      
      Object.keys(tracking).forEach(key => {
        if (tracking[key]) url.searchParams.set(key, tracking[key]);
      });

      // Add E-commerce Context if available
      if (window._lf_ecommerce) {
        url.searchParams.set('ec_data', JSON.stringify(window._lf_ecommerce));
      }

      return url.toString();
    },

     init: function(config) {
       this.debug('LeadFlow SDK Initialized with config: ' + JSON.stringify(config));
       /* Antes daqui só saía `inline`. Os modos `popup` e `floating` existiam
          como funções logo abaixo e NUNCA eram chamados — o trecho que a tela
          de publicação entregava ao cliente carregava o script, escrevia no
          console e não renderizava nada. */
       var mode = config.mode || 'inline';
       if (mode === 'inline') {
         this.renderInline(config);
       } else if (mode === 'popup') {
         this.popup(config.formId, config);
       } else if (mode === 'floating') {
         this.floating(config.formId, config);
       } else {
         this.debug('Modo desconhecido: ' + mode + '. Usando inline.');
         this.renderInline(config);
       }
       this.listenForEvents();
     },

     listenForEvents: function() {
       if (this._listening) return;
       this._listening = true;
       
       window.addEventListener('message', (event) => {
         if (event.data && event.data.type === 'LEADFLOW_FORM_SUBMITTED') {
           this.debug('Form submission detected via message: ' + JSON.stringify(event.data));
           
           // Trigger a custom event in the parent window
           const customEvent = new CustomEvent('leadflow_submit', { 
             detail: { 
               formId: event.data.formId,
               formSlug: event.data.formSlug
             } 
           });
           window.dispatchEvent(customEvent);
           
           // DataLayer push if available (GTM)
           if (window.dataLayer && window.dataLayer.push) {
             window.dataLayer.push({
               event: 'leadflow_form_submission',
               form_id: event.data.formId,
               form_slug: event.data.formSlug
             });
           }
         }
       });
     },

    renderInline: function(config) {
      this.debug('Rendering inline form...');
      const render = () => {
        const container = document.querySelector(config.target);
        if (!container) {
          this.debug('Target container not found: ' + config.target);
          return;
        }
        
        const existing = container.querySelector('iframe[data-leadflow]');
        if (existing) return; 

        const iframe = document.createElement('iframe');
        iframe.setAttribute('data-leadflow', 'true');
        const url = this.buildUrl(config.formId);
        this.debug('Iframe URL: ' + url);
        
        iframe.src = url;
        iframe.width = '100%';
        iframe.height = config.height || '800px'; 
        iframe.style.width = '100%';
        iframe.style.minWidth = '100%';
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        iframe.style.border = 'none';
        iframe.style.overflow = 'hidden';
        iframe.style.transition = 'height 0.3s ease';
        iframe.setAttribute('scrolling', 'no');
        
        container.appendChild(iframe);

        // Resize listener
        window.addEventListener('message', (event) => {
          if (event.data && event.data.type === 'LEADFLOW_RESIZE') {
             if (event.data.height) {
               iframe.height = event.data.height + 'px';
             }
          }
        });
      };

      // Try immediate render
      if (document.querySelector(config.target)) {
        render();
      } else {
        // If not found yet, poll briefly (faster than DOMContentLoaded if script is before element)
        const interval = setInterval(() => {
          if (document.querySelector(config.target)) {
            render();
            clearInterval(interval);
          }
        }, 100);
        // Safety fallback
        document.addEventListener('DOMContentLoaded', render);
        // Clear interval after 5 seconds to avoid memory leak if target never appears
        setTimeout(() => clearInterval(interval), 5000);
      }
    },

    popup: function(formId, options = {}) {
      /* `exit_intent` é o que a tela de publicação escreve no trecho; `exit` é
         o que este código esperava. A grafia não batia, então mesmo chamando a
         função direto nenhum ouvinte era instalado. Aceita as duas. */
      var trigger = options.trigger || 'exit_intent';
      if (trigger === 'exit' || trigger === 'exit_intent') {
        var self = this;
        var jaAbriu = false;
        /* `<= 0` e não `< 0`.
         *
         * A intenção de saída é o cursor deixando a página POR CIMA, rumo à
         * aba ou à barra de endereço. Dependendo do sistema e do zoom, o
         * último ponto registrado é 0 — não um número negativo. Com `< 0` o
         * gatilho simplesmente não disparava nesses casos, e o cliente
         * configurava o pop-up achando que estava ativo.
         *
         * `relatedTarget` nulo confirma que o ponteiro saiu da janela, e não
         * entrou num iframe ou num elemento filho.
         */
        var aoSair = function (e) {
          if (jaAbriu) return;
          if (e.clientY <= 0 && !e.relatedTarget) {
            jaAbriu = true;
            document.removeEventListener('mouseleave', aoSair);
            document.documentElement.removeEventListener('mouseleave', aoSair);
            self.showModal(formId);
          }
        };
        // Nos dois: navegadores divergem sobre qual dispara `mouseleave` ao
        // sair da janela. O `jaAbriu` garante uma abertura só.
        document.addEventListener('mouseleave', aoSair);
        document.documentElement.addEventListener('mouseleave', aoSair);
      } else if (trigger === 'delay') {
        setTimeout(() => this.showModal(formId), (options.delay || 5) * 1000);
      } else if (trigger === 'scroll') {
        var disparado = false;
        window.addEventListener('scroll', () => {
          if (disparado) return;
          var h = document.documentElement;
          var pct = (h.scrollTop + window.innerHeight) / h.scrollHeight;
          if (pct >= (options.percent || 0.5)) {
            disparado = true;
            this.showModal(formId);
          }
        }, { passive: true });
      } else {
        this.debug('Gatilho desconhecido: ' + trigger);
      }
    },

    floating: function(formId, options = {}) {
      const btn = document.createElement('div');
      btn.innerHTML = options.label || 'Fale Conosco';
      btn.style.position = 'fixed';
      btn.style.bottom = options.position === 'bottom-left' ? '20px' : 'unset';
      btn.style.right = options.position === 'bottom-right' ? '20px' : 'unset';
      btn.style.left = options.position === 'bottom-left' ? '20px' : 'unset';
      btn.style.bottom = '20px';
      if (!options.position || options.position === 'bottom-right') btn.style.right = '20px';
      
      // Preto por padrão destoava de qualquer site; o azul é o do produto e segue configurável.
      btn.style.backgroundColor = options.color || '#2563eb';
      btn.style.color = '#fff';
      btn.style.padding = '12px 24px';
      btn.style.borderRadius = '50px';
      btn.style.cursor = 'pointer';
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
      btn.style.zIndex = '9999';
      btn.style.fontWeight = 'bold';
      btn.style.fontFamily = 'sans-serif';

      btn.onclick = () => this.showModal(formId);
      document.body.appendChild(btn);
    },

    /**
     * Abre o formulário num modal.
     *
     * O modal antigo tinha altura FIXA de 600px — formulário de uma etapa
     * sobrava espaço, de cinco etapas cortava —, não tinha botão de fechar
     * visível, não fechava com Esc, não travava a rolagem do fundo e NÃO
     * fechava depois do envio: a pessoa enviava e a tela de sucesso ficava ali
     * para sempre. O SDK já recebia `LEADFLOW_RESIZE`, mas só aplicava no modo
     * inline.
     */
    showModal: function(formId, options = {}) {
      if (document.getElementById('lf-modal-overlay')) return;

      var self = this;
      var rolagemOriginal = document.body.style.overflow;

      var overlay = document.createElement('div');
      overlay.id = 'lf-modal-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.55);' +
        'display:flex;align-items:center;justify-content:center;z-index:2147483000;' +
        'padding:22px 20px;opacity:0;transition:opacity .18s ease';

      /* A `caixa` existe só para o botão de fechar poder sair PARA FORA do
         cartão. Ele ficava dentro, no canto superior direito, colado na barra
         de rolagem do formulário — dois elementos disputando os mesmos 14
         pixels. Fora do cartão não há o que disputar. */
      var caixa = document.createElement('div');
      caixa.style.cssText = 'position:relative;width:100%;max-width:' +
        (options.maxWidth || 520) + 'px;transform:translateY(8px);transition:transform .18s ease';
      caixa.onclick = function(e) { e.stopPropagation(); };

      var content = document.createElement('div');
      content.style.cssText = 'position:relative;width:100%;max-height:92vh;background:#fff;' +
        'border-radius:18px;overflow:hidden;box-shadow:0 24px 60px -16px rgba(15,23,42,.45)';

      var fechar = document.createElement('button');
      fechar.type = 'button';
      fechar.setAttribute('aria-label', 'Fechar');
      fechar.innerHTML = '&times;';
      // Fora do fluxo do conteúdo: com `top:8px` ele cobria o "100% completo"
      // do cabeçalho do formulário.
      fechar.style.cssText = 'position:absolute;top:10px;right:10px;z-index:2;width:30px;' +
        'height:32px;border:0;border-radius:999px;background:rgba(255,255,255,.92);' +
        'color:#334155;font-size:22px;line-height:1;cursor:pointer;' +
        'box-shadow:0 1px 3px rgba(0,0,0,.15)';

      var iframe = document.createElement('iframe');
      iframe.src = this.buildUrl(formId);
      iframe.setAttribute('data-leadflow-modal', 'true');
      iframe.setAttribute('scrolling', 'no');
      iframe.style.cssText = 'display:block;width:100%;height:' +
        (options.minHeight || 420) + 'px;border:0;transition:height .25s ease';

      function encerrar() {
        if (!overlay.parentNode) return;
        clearTimeout(prazoDaEspera);
        document.removeEventListener('keydown', aoTeclar);
        window.removeEventListener('message', aoReceber);
        window.removeEventListener('resize', aoRedimensionar);
        document.body.style.overflow = rolagemOriginal;
        overlay.style.opacity = '0';
        setTimeout(function() {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 180);
      }

      function aoTeclar(e) { if (e.key === 'Escape') encerrar(); }

      function ajustarAltura(conteudo) {
        /* O teto da janela vence o piso.
         *
         * A primeira versão fazia `Math.max(alturaLimitada, minHeight)`, e numa
         * janela baixa — medido com 409px de altura, onde 92vh dá 376px — o
         * piso de 420px passava por cima do teto e o modal ficava MAIOR que o
         * espaço disponível. O piso agora é ele próprio limitado pela janela.
         */
        // 22px de folga em cima e embaixo, mais 13px da saliência do botão.
        var teto = Math.max(window.innerHeight - 70, 240);
        var piso = Math.min(options.minHeight || 420, teto);
        var altura = Math.max(Math.min(conteudo || piso, teto), piso);
        iframe.style.height = altura + 'px';
        /* Quando o conteúdo não cabe no teto, a rolagem passa a ser do iframe —
         * com `scrolling="no"` o fim do formulário ficaria inalcançável em tela
         * baixa, que é justamente onde isso acontece. */
        var precisaRolar = (conteudo || 0) > teto;
        iframe.setAttribute('scrolling', precisaRolar ? 'auto' : 'no');
        iframe.style.overflow = precisaRolar ? 'auto' : 'hidden';
      }

      function aoReceber(e) {
        if (!e.data) return;
        // A altura vem do próprio formulário, como no modo inline.
        if (e.data.type === 'LEADFLOW_RESIZE' && e.data.height) {
          clearTimeout(prazoDaEspera);
          esconderEspera();
          ultimaAltura = e.data.height;
          ajustarAltura(e.data.height);
        }
        if (e.data.type === 'LEADFLOW_FORM_SUBMITTED' && options.closeOnSubmit !== false) {
          // Tempo de ler a confirmação antes de fechar.
          setTimeout(encerrar, options.closeDelay || 2500);
        }
      }

      var ultimaAltura = 0;
      var aoRedimensionar = function() { ajustarAltura(ultimaAltura); };

      overlay.onclick = encerrar;
      fechar.onclick = encerrar;
      document.addEventListener('keydown', aoTeclar);
      window.addEventListener('message', aoReceber);
      // Girar o celular muda o teto; sem isto o modal ficaria com a altura da
      // orientação anterior.
      window.addEventListener('resize', aoRedimensionar);

      /* Enquanto o formulário carrega, o modal era uma CAIXA BRANCA VAZIA —
         medido em celular: cerca de 10 segundos de nada, que a pessoa lê como
         travamento e fecha. O indicador sai quando o iframe termina. */
      var carregando = document.createElement('div');
      carregando.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;' +
        'justify-content:center;background:#fff;z-index:1';
      carregando.innerHTML =
        '<div style="width:26px;height:26px;border:2.5px solid #e3e9f2;border-top-color:#2563eb;' +
        'border-radius:50%;animation:lf-gira .7s linear infinite"></div>';
      if (!document.getElementById('lf-estilo-giro')) {
        var estilo = document.createElement('style');
        estilo.id = 'lf-estilo-giro';
        estilo.textContent = '@keyframes lf-gira{to{transform:rotate(360deg)}}';
        document.head.appendChild(estilo);
      }
      /* Sai quando o FORMULÁRIO aparece, não no `load` do iframe.
       *
       * O `load` dispara quando o HTML e os scripts terminam — o React ainda
       * precisa montar e buscar o formulário depois disso. Medido: o indicador
       * sumia e sobrava uma janela branca sem aviso nenhum. O primeiro
       * `LEADFLOW_RESIZE` só é enviado com o formulário já na tela, então é
       * esse o sinal certo.
       */
      var saiuDaEspera = false;
      function esconderEspera() {
        if (saiuDaEspera) return;
        saiuDaEspera = true;
        carregando.style.transition = 'opacity .2s ease';
        carregando.style.opacity = '0';
        setTimeout(function () {
          if (carregando.parentNode) carregando.parentNode.removeChild(carregando);
        }, 220);
      }
      // Rede de segurança: se a mensagem nunca vier (formulário despublicado,
      // erro de rede), o indicador não pode girar para sempre.
      var prazoDaEspera = setTimeout(esconderEspera, 12000);

      content.appendChild(carregando);
      content.appendChild(iframe);
      caixa.appendChild(fechar);
      caixa.appendChild(content);
      overlay.appendChild(caixa);
      document.body.appendChild(overlay);
      document.body.style.overflow = 'hidden';

      requestAnimationFrame(function() {
        overlay.style.opacity = '1';
        caixa.style.transform = 'translateY(0)';
      });

      self.debug('Modal aberto para o formulário ' + formId);
      return encerrar;
    },

    /** API pública: qualquer botão do site pode chamar. */
    open: function(formId, options) {
      return this.showModal(formId, options || {});
    },

    // E-commerce Helper
    trackProduct: function(productData) {
      window._lf_ecommerce = productData;
      console.log('LeadFlow: Product tracked', productData);
    }
  };

  window.LeadFlow = LeadFlow;

  /* Ligação declarativa: nada de JS para quem só quer colar o atributo.
   *
   *   <div data-lf-form="ID"></div>            formulário embutido ali
   *   <a href="#" data-lf-open="ID">Fale</a>   abre no modal
   *
   * `data-lf-open` é o que faltava: o modal existia, mas não havia como ligar
   * um botão JÁ EXISTENTE do site nele — só o botão flutuante que o próprio
   * SDK cria, que nem sempre é o que a página quer.
   */
  function iniciarEmbutidos() {
    // `querySelectorAll`, não `querySelector`: a versão anterior pegava apenas
    // o PRIMEIRO elemento, então duas âncoras na mesma página e a segunda
    // ficava vazia sem erro nenhum.
    var alvos = document.querySelectorAll('[data-lf-form]');
    for (var i = 0; i < alvos.length; i++) {
      var el = alvos[i];
      if (el.getAttribute('data-lf-pronto')) continue;
      el.setAttribute('data-lf-pronto', '1');
      if (!el.id) el.id = 'lf-embed-' + i + '-' + Date.now();
      LeadFlow.init({
        formId: el.getAttribute('data-lf-form'),
        target: '#' + el.id,
        mode: 'inline'
      });
    }
  }

  // Delegado no documento: funciona para botão que só aparece depois, vindo de
  // carrossel, menu ou de qualquer construtor de página.
  document.addEventListener('click', function(e) {
    var alvo = e.target && e.target.closest && e.target.closest('[data-lf-open]');
    if (!alvo) return;
    e.preventDefault();
    LeadFlow.open(alvo.getAttribute('data-lf-open'), {
      maxWidth: Number(alvo.getAttribute('data-lf-largura')) || undefined
    });
  });

  // Gatilho de saída/tempo/rolagem também por atributo, no <body> ou em qualquer
  // elemento: <div data-lf-popup="ID" data-lf-trigger="exit"></div>
  function iniciarPopups() {
    var els = document.querySelectorAll('[data-lf-popup]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.getAttribute('data-lf-pronto')) continue;
      el.setAttribute('data-lf-pronto', '1');
      LeadFlow.popup(el.getAttribute('data-lf-popup'), {
        trigger: el.getAttribute('data-lf-trigger') || 'exit_intent',
        delay: Number(el.getAttribute('data-lf-delay')) || undefined,
        percent: Number(el.getAttribute('data-lf-percent')) || undefined
      });
    }
  }

  function iniciarTudo() { iniciarEmbutidos(); iniciarPopups(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciarTudo);
  } else {
    iniciarTudo();
  }
  // Página montada por construtor visual troca o DOM depois do load.
  if (window.MutationObserver) {
    new MutationObserver(iniciarTudo).observe(document.documentElement, {
      childList: true, subtree: true
    });
  }

})(window);
