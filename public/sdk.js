/**
 * LeadFlow Universal Form SDK
 * @version 1.0.0
 */
(function(window) {
  const LeadFlow = {
    init: function(config) {
      console.log('LeadFlow SDK Initialized', config);
      if (config.mode === 'inline') {
        this.renderInline(config);
      }
    },

    renderInline: function(config) {
      const container = document.querySelector(config.target);
      if (!container) return;

      const iframe = document.createElement('iframe');
      const publicUrl = `${window.location.origin}/f/${config.formId}`;
      
      iframe.src = publicUrl;
      iframe.width = '100%';
      iframe.height = config.height || '700px';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '12px';
      
      container.appendChild(iframe);
    },

    popup: function(formId, options = {}) {
      if (options.trigger === 'exit') {
        document.addEventListener('mouseleave', (e) => {
          if (e.clientY < 0) {
            this.showModal(formId);
          }
        }, { once: true });
      }
    },

    floating: function(formId, options = {}) {
      const btn = document.createElement('div');
      btn.innerHTML = 'Fale Conosco';
      btn.style.position = 'fixed';
      btn.style.bottom = '20px';
      btn.style.right = '20px';
      btn.style.backgroundColor = '#000';
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
      const overlay = document.createElement('div');
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
      content.onclick = (e) => e.stopPropagation();

      const iframe = document.createElement('iframe');
      iframe.src = `/f/${formId}`;
      iframe.width = '100%';
      iframe.height = '600px';
      iframe.style.border = 'none';

      content.appendChild(iframe);
      overlay.appendChild(content);
      document.body.appendChild(overlay);
    }
  };

  window.LeadFlow = LeadFlow;
})(window);
