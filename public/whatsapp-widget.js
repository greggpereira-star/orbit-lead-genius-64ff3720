(function () {
  'use strict';
  var script = document.currentScript;
  if (!script) return;
  var companyId = script.getAttribute('data-company-id');
  var phone = script.getAttribute('data-phone');
  if (!companyId || !phone) {
    console.warn('[AltLeadFlow WA] data-company-id and data-phone are required');
    return;
  }
  var message = script.getAttribute('data-message') || '';
  var label = script.getAttribute('data-label') || 'Fale no WhatsApp';
  var color = script.getAttribute('data-color') || '#25D366';
  var position = script.getAttribute('data-position') || 'bottom-right';
  var host = script.getAttribute('data-host') || (script.src ? new URL(script.src).origin : window.location.origin);
  var endpoint = host + '/api/public/whatsapp-click';

  var VID_KEY = 'lf_wa_vid';
  var visitorId = localStorage.getItem(VID_KEY);
  if (!visitorId) {
    visitorId = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    try { localStorage.setItem(VID_KEY, visitorId); } catch (_) {}
  }

  var trackingKeys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','fbc','fbp','gclid','gbraid','wbraid'];
  var qs = new URLSearchParams(window.location.search);
  var tracking = {};
  trackingKeys.forEach(function (k) { var v = qs.get(k); if (v) tracking[k] = v; });
  function readCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
    return m ? decodeURIComponent(m[1]) : null;
  }
  if (!tracking.fbp) { var fbp = readCookie('_fbp'); if (fbp) tracking.fbp = fbp; }
  if (!tracking.fbc) { var fbc = readCookie('_fbc'); if (fbc) tracking.fbc = fbc; }

  var btn = document.createElement('button');
  btn.type = 'button';
  btn.setAttribute('aria-label', label);
  var pos = position === 'bottom-left'
    ? 'left:20px;'
    : 'right:20px;';
  btn.style.cssText = 'position:fixed;bottom:20px;' + pos + 'z-index:2147483647;background:' + color + ';color:#fff;border:none;border-radius:9999px;padding:14px 18px;font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,0.2);cursor:pointer;display:inline-flex;align-items:center;gap:10px;';
  btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20.52 3.48A11.94 11.94 0 0012 0C5.37 0 0 5.37 0 12a11.9 11.9 0 001.64 6.02L0 24l6.17-1.62A11.94 11.94 0 0012 24c6.63 0 12-5.37 12-12 0-3.2-1.25-6.21-3.48-8.52zM12 21.82a9.8 9.8 0 01-5-1.37l-.36-.21-3.66.96.98-3.57-.23-.37A9.8 9.8 0 1121.82 12 9.82 9.82 0 0112 21.82zm5.36-7.34c-.29-.15-1.72-.85-1.99-.95-.27-.1-.46-.15-.66.15-.19.29-.75.95-.92 1.14-.17.19-.34.22-.63.07-.29-.15-1.23-.45-2.35-1.45-.87-.77-1.46-1.72-1.63-2.01-.17-.29-.02-.45.13-.6.13-.13.29-.34.44-.51.15-.17.19-.29.29-.48.1-.19.05-.36-.02-.51-.07-.15-.66-1.59-.9-2.18-.24-.58-.49-.5-.66-.51h-.56c-.19 0-.51.07-.78.36-.27.29-1.02 1-1.02 2.44 0 1.44 1.05 2.83 1.19 3.03.15.19 2.06 3.14 4.99 4.4.7.3 1.24.48 1.66.62.7.22 1.34.19 1.85.12.56-.08 1.72-.7 1.96-1.38.24-.68.24-1.27.17-1.38-.07-.11-.26-.18-.55-.33z"/></svg><span>' + label + '</span>';

  btn.addEventListener('click', function () {
    var payload = {
      companyId: companyId,
      phone: phone,
      message: message || undefined,
      visitorId: visitorId,
      pageUrl: window.location.href,
      referrer: document.referrer || undefined,
      userAgent: navigator.userAgent,
      tracking: tracking,
    };
    var opened = false;
    function go(url) {
      if (opened) return; opened = true;
      window.open(url, '_blank', 'noopener');
    }
    var timeout = setTimeout(function () {
      go('https://wa.me/' + phone.replace(/\D+/g, '') + (message ? '?text=' + encodeURIComponent(message) : ''));
    }, 800);
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) {
        clearTimeout(timeout);
        go(data && data.whatsappUrl ? data.whatsappUrl : 'https://wa.me/' + phone.replace(/\D+/g, ''));
      })
      .catch(function () {
        clearTimeout(timeout);
        go('https://wa.me/' + phone.replace(/\D+/g, '') + (message ? '?text=' + encodeURIComponent(message) : ''));
      });
  });

  function mount() { document.body.appendChild(btn); }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else { mount(); }
})();
