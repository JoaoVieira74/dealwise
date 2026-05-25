(function () {
  const params = new URLSearchParams(location.search);
  const token  = params.get('token');
  const root   = document.getElementById('portal-root');

  if (!token) {
    root.innerHTML = '<div class="portal-loading"><p>Token inválido. <a href="/advertise.html">Subscrever →</a></p></div>';
    return;
  }

  // Image error fallback via event delegation (avoids inline onerror blocked by CSP)
  root.addEventListener('error', function (e) {
    if (e.target.classList && e.target.classList.contains('car-thumb')) {
      e.target.classList.add('car-thumb-hidden');
      const ph = e.target.nextElementSibling;
      if (ph) ph.style.display = 'flex';
    }
  }, true);

  function esc(s) {
    return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function safeHref(url) {
    if (!url) return '#';
    try {
      const u = new URL(url);
      return ['http:','https:','tel:','mailto:'].includes(u.protocol) ? url : '#';
    } catch { return '#'; }
  }

  function renderPlanLabel(plan) {
    const map = { basic: 'Básico', standard: 'Standard', premium: 'Premium' };
    return map[plan] || plan;
  }

  function renderCars(cars) {
    if (cars.length === 0) {
      return '<div class="no-cars">Ainda não tens carros publicados. Adiciona o primeiro abaixo!</div>';
    }
    return '<div class="car-list">' + cars.map(function (c) {
      const thumb = c.image_url
        ? '<img class="car-thumb" src="' + esc(c.image_url) + '" alt="' + esc(c.title) + '" loading="lazy"><div class="car-thumb-placeholder" style="display:none">🚗</div>'
        : '<div class="car-thumb-placeholder">🚗</div>';
      const contact = c.contact_url
        ? '<a href="' + esc(safeHref(c.contact_url)) + '" target="_blank" rel="noopener" class="car-contact-link">Contacto ↗</a>'
        : '';
      return '<div class="car-row" data-car-id="' + c.id + '">'
        + thumb
        + '<div class="car-info">'
        + '<div class="car-title">' + esc(c.title) + '</div>'
        + '<div class="car-meta">'
        + (c.price    ? '<span>' + esc(c.price) + '</span>' : '')
        + (c.location ? '<span>📍 ' + esc(c.location) + '</span>' : '')
        + contact
        + '</div></div>'
        + '<button class="remove-btn" data-id="' + c.id + '">Remover</button>'
        + '</div>';
    }).join('') + '</div>';
  }

  function render(dealer, cars) {
    const used    = cars.length;
    const limit   = dealer.car_limit === 9999 ? '∞' : dealer.car_limit;
    const planCls = 'plan-' + dealer.plan;
    const canAdd  = dealer.car_limit === 9999 || used < dealer.car_limit;

    document.getElementById('dealer-badge').textContent = dealer.company;

    root.innerHTML =
      '<div class="portal-body">'

      + '<div class="portal-stats">'
      + '<div class="portal-stat">'
      + '<div class="portal-stat-label">Carros publicados</div>'
      + '<div class="portal-stat-value">' + used + ' <span class="portal-stat-secondary">/ ' + limit + '</span></div>'
      + '</div>'
      + '<div class="portal-stat">'
      + '<div class="portal-stat-label">Plano atual</div>'
      + '<div class="portal-stat-value portal-stat-plan"><span class="plan-badge ' + planCls + '">' + renderPlanLabel(dealer.plan) + '</span></div>'
      + '</div>'
      + '<div class="portal-stat">'
      + '<div class="portal-stat-label">Conta</div>'
      + '<div class="portal-stat-value portal-stat-email">' + esc(dealer.email) + '</div>'
      + '</div>'
      + '</div>'

      + '<div class="section-card">'
      + '<div class="section-header">'
      + '<span class="section-title">Os seus carros</span>'
      + (!canAdd ? '<span class="section-limit-warn">Limite de carros atingido</span>' : '')
      + '</div>'
      + '<div id="car-list-wrap">' + renderCars(cars) + '</div>'
      + '</div>'

      + '<div class="section-card">'
      + '<div class="section-header"><span class="section-title">Adicionar carro</span></div>'
      + '<form class="add-form' + (!canAdd ? ' add-form-disabled' : '') + '" id="add-car-form">'
      + '<div class="add-form-row">'
      + '<div class="add-form-field"><label for="car-title">Título *</label><input type="text" id="car-title" name="title" required placeholder="BMW Série 3 320d Sport Line" maxlength="200" /></div>'
      + '<div class="add-form-field"><label for="car-price">Preço</label><input type="text" id="car-price" name="price" placeholder="28 900€" maxlength="50" /></div>'
      + '</div>'
      + '<div class="add-form-row">'
      + '<div class="add-form-field"><label for="car-location">Localização</label><input type="text" id="car-location" name="location" placeholder="Lisboa" maxlength="100" /></div>'
      + '<div class="add-form-field"><label for="car-contact">Link de contacto</label><input type="url" id="car-contact" name="contact_url" placeholder="https://wa.me/351912345678" maxlength="500" /><span class="add-form-hint">WhatsApp, website ou link de email</span></div>'
      + '</div>'
      + '<div class="add-form-field"><label for="car-image">URL da imagem</label><input type="url" id="car-image" name="image_url" placeholder="https://exemplo.com/carro.jpg" maxlength="1000" /><span class="add-form-hint">Link direto para a imagem (JPEG ou PNG). Pode usar Imgur ou outra plataforma de hospedagem.</span></div>'
      + '<div class="add-form-error" id="add-error"></div>'
      + '<button type="submit" class="add-btn" id="add-btn">Publicar carro →</button>'
      + '</form>'
      + '</div>'

      + '</div>';

    document.getElementById('add-car-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      const f     = e.target;
      const btn   = document.getElementById('add-btn');
      const errEl = document.getElementById('add-error');
      errEl.style.display = 'none';

      const payload = {
        token,
        title:       f.title.value.trim(),
        price:       f.price.value.trim() || null,
        location:    f.location.value.trim() || null,
        image_url:   f.image_url.value.trim() || null,
        contact_url: f.contact_url.value.trim() || null,
      };

      if (!payload.title) {
        errEl.textContent = 'O título é obrigatório.';
        errEl.style.display = 'block';
        return;
      }

      btn.disabled = true;
      btn.textContent = 'A publicar…';

      try {
        const res  = await fetch('/api/dealers/cars', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        if (json.ok) {
          f.reset();
          await loadPortal();
        } else {
          errEl.textContent = json.error || 'Erro ao adicionar. Tenta novamente.';
          errEl.style.display = 'block';
        }
      } catch {
        errEl.textContent = 'Erro de rede. Tenta novamente.';
        errEl.style.display = 'block';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Publicar carro →';
      }
    });

    document.getElementById('car-list-wrap').addEventListener('click', async function (e) {
      const btn = e.target.closest('.remove-btn');
      if (!btn) return;
      const id = btn.dataset.id;
      if (!confirm('Remover este carro dos anúncios?')) return;
      btn.classList.add('loading');
      try {
        await fetch('/api/dealers/cars/' + id, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        await loadPortal();
      } catch {
        btn.classList.remove('loading');
      }
    });
  }

  async function loadPortal() {
    try {
      const res = await fetch('/api/dealers/portal?token=' + encodeURIComponent(token));
      if (res.status === 403) {
        root.innerHTML = '<div class="portal-loading"><p>Acesso não autorizado. <a href="/advertise.html">Subscrever →</a></p></div>';
        return;
      }
      const data = await res.json();
      render(data.dealer, data.cars);
    } catch {
      root.innerHTML = '<div class="portal-loading"><p>Erro ao carregar. Recarrega a página.</p></div>';
    }
  }

  loadPortal();
})();
