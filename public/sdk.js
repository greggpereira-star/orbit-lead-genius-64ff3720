/**
 * LeadFlow Universal Form SDK
 * @version 1.1.0
 */
(function(window) {
  const LeadFlow = {
    // UTM & Tracking Persistence
    getTrackingData: function() {
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

      return tracking;
    },

    // Build Public URL with UTM forward
    buildUrl: function(formId) {
      const tracking = this.getTrackingData();
      const baseUrl = window.location.origin;
      // If formId is a UUID, use the embed route. Otherwise use slug route.
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formId);
      const url = isUuid 
        ? new URL(`${baseUrl}/embed-form/${formId}`)
        : new URL(`${baseUrl}/f/${formId}`);
      
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
      console.log('LeadFlow SDK Initialized', config);
      if (config.mode === 'inline') {
        this.renderInline(config);
      }
    },

     renderInline: function(config) {
       const render = () => {
         const container = document.querySelector(config.target);
         if (!container) return;
         if (container.querySelector('iframe')) return; // Prevent double render
 
         const iframe = document.createElement('iframe');
         iframe.src = this.buildUrl(config.formId);
         iframe.width = '100%';
         iframe.height = config.height || '700px';
         iframe.style.border = 'none';
         iframe.style.borderRadius = '12px';
         iframe.setAttribute('loading', 'lazy');
         
         container.appendChild(iframe);
       };

       if (document.readyState === 'complete') {
         render();
       } else {
         window.addEventListener('load', render);
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
