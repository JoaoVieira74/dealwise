(function () {
  const params    = new URLSearchParams(location.search);
  const sessionId = params.get('session_id');
  const icon      = document.getElementById('status-icon');
  const title     = document.getElementById('status-title');
  const sub       = document.getElementById('status-sub');
  const back      = document.getElementById('status-back');

  function showError() {
    icon.textContent   = '❌';
    title.textContent  = 'Erro ao verificar pagamento';
    sub.textContent    = 'Se o pagamento foi concluído, o anúncio ficará em destaque em breve. Podes voltar à página principal.';
    back.classList.remove('u-hidden');
  }

  if (!sessionId) { showError(); return; }

  fetch('/api/verify?session_id=' + encodeURIComponent(sessionId))
    .then(r => r.json())
    .then(data => {
      if (data.paid) {
        icon.textContent  = '⭐';
        title.textContent = 'Pagamento confirmado!';
        sub.textContent   = `O teu anúncio está em destaque por ${data.days} ${data.days === 1 ? 'dia' : 'dias'}.`;
      } else {
        icon.textContent  = '⏳';
        title.textContent = 'Pagamento em processamento';
        sub.textContent   = 'Aguarda um momento. O destaque será ativado assim que o pagamento for confirmado.';
      }
      back.classList.remove('u-hidden');
    })
    .catch(showError);
})();
