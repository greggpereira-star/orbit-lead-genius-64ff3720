/**
 * AltLeadflow Chat Widget Loader
 * Uso:
 *   <script src="https://www.altleadflow.com.br/chat-widget.js"
 *           data-company-id="SEU_COMPANY_ID"
 *           data-color="#4f46e5"
 *           data-invite-message="Posso ajudar? 👋"
 *           data-invite-delay="8"
 *           defer></script>
 */
(function () {
  var script = document.currentScript;
  var companyId = script && script.getAttribute('data-company-id');
  if (!companyId) { console.warn('[AltChat] data-company-id ausente'); return; }
  var color = (script && script.getAttribute('data-color')) || '#4f46e5';
  var inviteMessage = script && script.getAttribute('data-invite-message');
  var inviteDelay = parseInt((script && script.getAttribute('data-invite-delay')) || '0', 10);
  var host = new URL(script.src).origin;
  var storageKey = 'altchat_invite_' + companyId;

  var container = document.createElement('div');
  container.id = 'altchat-widget';
  container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;';

  var btn = document.createElement('button');
  btn.setAttribute('aria-label', 'Abrir chat');
  btn.style.cssText = 'width:56px;height:56px;border-radius:9999px;border:none;cursor:pointer;background:' + color + ';color:#fff;box-shadow:0 10px 25px rgba(0,0,0,0.15);display:flex;align-items:center;justify-content:center;';
  btn.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var frame = document.createElement('iframe');
  var trackingKeys = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','fbclid','fbc','fbp','gclid','gbraid','wbraid'];
  var parentQs = new URLSearchParams(window.location.search);
  var forward = new URLSearchParams();
  trackingKeys.forEach(function (k) { var v = parentQs.get(k); if (v) forward.set(k, v); });
  forward.set('lf_page', window.location.href);
  if (document.referrer) forward.set('lf_ref', document.referrer);
  frame.src = host + '/chat-embed/' + encodeURIComponent(companyId) + '?' + forward.toString();
  frame.style.cssText = 'display:none;width:380px;height:560px;max-width:calc(100vw - 40px);max-height:calc(100vh - 120px);border:none;border-radius:14px;box-shadow:0 20px 60px rgba(0,0,0,0.25);background:#fff;position:absolute;bottom:72px;right:0;';
  frame.title = 'Chat de atendimento';

  var invite = null;
  function dismissInvite() {
    if (invite && invite.parentNode) invite.parentNode.removeChild(invite);
    invite = null;
    try { sessionStorage.setItem(storageKey, '1'); } catch (e) { /* noop */ }
  }
  function showInvite() {
    if (open || invite) return;
    try { if (sessionStorage.getItem(storageKey)) return; } catch (e) { /* noop */ }
    invite = document.createElement('div');
    invite.style.cssText = 'position:absolute;bottom:72px;right:0;max-width:260px;background:#fff;color:#111;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,0.18);padding:12px 32px 12px 14px;font:14px/1.4 system-ui,-apple-system,sans-serif;cursor:pointer;animation:altchat-in .25s ease-out;';
    invite.textContent = inviteMessage;
    invite.addEventListener('click', function () { dismissInvite(); toggle(true); });
    var close = document.createElement('button');
    close.setAttribute('aria-label', 'Fechar');
    close.innerHTML = '×';
    close.style.cssText = 'position:absolute;top:4px;right:6px;background:transparent;border:none;font-size:18px;line-height:1;color:#666;cursor:pointer;padding:2px 6px;';
    close.addEventListener('click', function (e) { e.stopPropagation(); dismissInvite(); });
    invite.appendChild(close);
    container.appendChild(invite);
  }

  var open = false;
  function toggle(force) {
    open = typeof force === 'boolean' ? force : !open;
    frame.style.display = open ? 'block' : 'none';
    if (open) dismissInvite();
  }
  btn.addEventListener('click', function () { toggle(); });

  container.appendChild(frame);
  container.appendChild(btn);
  document.body.appendChild(container);

  if (inviteMessage && inviteDelay > 0) {
    setTimeout(showInvite, inviteDelay * 1000);
  }
})();
