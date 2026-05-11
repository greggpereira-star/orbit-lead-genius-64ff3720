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
       if (config.mode === 'inline') {
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
      if (options.trigger === 'exit') {
        document.addEventListener('mouseleave', (e) => {
          if (e.clientY < 0) {
            this.showModal(formId);
          }
        }, { once: true });
      } else if (options.trigger === 'delay') {
        setTimeout(() => this.showModal(formId), (options.delay || 5) * 1000);
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
      
      btn.style.backgroundColor = options.color || '#000';
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

    showModal: function(formId) {
      if (document.getElementById('lf-modal-overlay')) return;

      const overlay = document.createElement('div');
      overlay.id = 'lf-modal-overlay';
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '10000';
      overlay.onclick = () => document.body.removeChild(overlay);

      const content = document.createElement('div');
      content.style.width = '90%';
      content.style.maxWidth = '500px';
      content.style.backgroundColor = '#fff';
      content.style.borderRadius = '16px';
      content.style.overflow = 'hidden';
      content.style.boxShadow = '0 25px 50px -12px rgba(0, 0, 0, 0.25)';
      content.onclick = (e) => e.stopPropagation();

      const iframe = document.createElement('iframe');
      iframe.src = this.buildUrl(formId);
      iframe.width = '100%';
      iframe.height = '600px';
      iframe.style.border = 'none';

      content.appendChild(iframe);
      overlay.appendChild(content);
      document.body.appendChild(overlay);
    },

    // E-commerce Helper
    trackProduct: function(productData) {
      window._lf_ecommerce = productData;
      console.log('LeadFlow: Product tracked', productData);
    }
  };

  window.LeadFlow = LeadFlow;

  // Auto-init via data attributes if present
  document.addEventListener('DOMContentLoaded', () => {
    const el = document.querySelector('[data-lf-form]');
    if (el) {
      LeadFlow.init({
        formId: el.getAttribute('data-lf-form'),
        target: '[data-lf-form]',
        mode: 'inline'
      });
    }
  });
})(window);
