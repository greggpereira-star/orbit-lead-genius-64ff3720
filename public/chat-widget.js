/**
 * AltLeadflow Chat Widget Loader
 * Uso:
 *   <script src="https://www.altleadflow.com.br/chat-widget.js"
 *           data-company-id="SEU_COMPANY_ID"
 *           data-color="#4f46e5"
 *           defer></script>
 */
(function () {
  var script = document.currentScript;
  var companyId = script && script.getAttribute('data-company-id');
  if (!companyId) { console.warn('[AltChat] data-company-id ausente'); return; }
  var color = (script && script.getAttribute('data-color')) || '#4f46e5';
  var host = new URL(script.src).origin;

  var container = document.createElement('div');
  container.id = 'altchat-widget';
  container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;';

  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Abrir chat');
  btn.style.cssText = 'width:56px;height:56px;border-radius:9999px;border:none;cursor:pointer;background:' + color + ';color:#fff;box-shadow:0 10px 25px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;';
  btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var frame = document.createElement('iframe');
  frame.src = host + '/chat-embed/' + encodeURIComponent(companyId);
  frame.style.cssText = 'display:none;width:380px;height:560px;max-width:calc(100vw - 40px);max-height:calc(100vh - 120px);border:none;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.25);background:#fff;position:absolute;bottom:72px;right:0;';
  frame.title = 'Chat de atendimento';

  var open = false;
  btn.addEventListener('click', function () {
    open = !open;
    frame.style.display = open ? 'block' : 'none';
  });

  container.appendChild(frame);
  container.appendChild(btn);
  document.body.appendChild(container);
})();
