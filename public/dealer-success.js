(function () {
  const params    = new URLSearchParams(location.search);
  const sessionId = params.get('session_id');
  const el        = document.getElementById('content');

  function escHtml(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escAttr(s) {
    return (s || '').replace(/"/g,'&quot;');
  }

  function showError() {
    el.innerHTML =
      '<div class="page-icon">❌</div>'
      + '<p class="page-title">Erro ao verificar subscrição</p>'
      + '<p class="page-sub">Se o pagamento foi concluído, o teu acesso será ativado em breve. Guarda este link para aceder ao painel mais tarde.</p>'
      + '<a href="/" class="btn-secondary">Voltar ao início</a>';
  }

  if (!sessionId) { showError(); return; }

  fetch('/api/dealers/verify?session_id=' + encodeURIComponent(sessionId))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (!data.ok) {
        el.innerHTML =
          '<div class="page-icon">⏳</div>'
          + '<p class="page-title">Pagamento em processamento</p>'
          + '<p class="page-sub">O teu acesso será ativado assim que o pagamento for confirmado pela Stripe. Isso pode demorar alguns segundos.</p>'
          + '<a href="/" class="btn-secondary">Voltar ao início</a>';
        return;
      }

      const portalUrl = location.origin + '/dealer-portal.html?token=' + encodeURIComponent(data.token);

      el.innerHTML =
        '<div class="page-icon">🎉</div>'
        + '<p class="page-title">Bem-vindo, ' + escHtml(data.company) + '!</p>'
        + '<p class="page-sub">A tua subscrição foi confirmada. Guarda o link do painel — é a tua chave de acesso exclusiva.</p>'
        + '<div class="portal-link-box">'
        + '<div class="portal-link-label">O teu painel de gestão</div>'
        + '<code class="portal-link-url">' + escHtml(portalUrl) + '</code>'
        + '<p class="portal-link-note">⚠️ Guarda este link — não é possível recuperá-lo depois.</p>'
        + '</div>'
        + '<a class="btn-portal" href="' + escAttr(portalUrl) + '">Aceder ao painel →</a>'
        + '<a href="/" class="btn-secondary">Ver anúncios</a>';
    })
    .catch(showError);
})();
