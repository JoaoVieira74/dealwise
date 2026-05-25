(function () {
  document.querySelectorAll('.adv-plan-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.getElementById('f-plan').value = btn.dataset.plan;
      document.getElementById('registo').scrollIntoView({ behavior: 'smooth' });
      setTimeout(function () { document.getElementById('f-company').focus(); }, 400);
    });
  });

  document.getElementById('dealer-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    const form  = e.target;
    const btn   = document.getElementById('submit-btn');
    const errEl = document.getElementById('form-error');
    errEl.style.display = 'none';

    const data = {
      company:      form.company.value.trim(),
      contact_name: form.contact_name.value.trim(),
      email:        form.email.value.trim(),
      phone:        form.phone.value.trim() || null,
      plan:         form.plan.value,
    };

    if (!data.company || !data.contact_name || !data.email) {
      errEl.textContent = 'Preencha todos os campos obrigatórios.';
      errEl.style.display = 'block';
      return;
    }

    btn.disabled = true;
    btn.textContent = 'A processar…';

    try {
      const res  = await fetch('/api/dealers/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else {
        errEl.textContent = json.error || 'Erro ao processar. Tenta novamente.';
        errEl.style.display = 'block';
        btn.disabled = false;
        btn.textContent = 'Subscrever agora →';
      }
    } catch {
      errEl.textContent = 'Erro de rede. Verifica a tua ligação e tenta novamente.';
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Subscrever agora →';
    }
  });
})();
