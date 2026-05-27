(function () {
  let TOKEN = sessionStorage.getItem('dw_admin_token') || '';

  // ── Auth ──────────────────────────────────────────────────────────────────
  function apiFetch(path, opts = {}) {
    return fetch(path, {
      ...opts,
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers || {}) },
    });
  }

  async function tryLogin() {
    const t = document.getElementById('token-input').value.trim();
    if (!t) return;
    const r = await fetch('/api/admin/stats', { headers: { 'Authorization': `Bearer ${t}` } });
    if (r.status === 401 || r.status === 503) {
      document.getElementById('login-error').textContent = 'Token inválido.';
      return;
    }
    TOKEN = t;
    sessionStorage.setItem('dw_admin_token', t);
    showApp();
    loadOverview();
  }

  function showApp() {
    document.getElementById('login').style.display = 'none';
    document.getElementById('app').style.display = 'block';
  }

  document.getElementById('login-btn').addEventListener('click', tryLogin);
  document.getElementById('token-input').addEventListener('keydown', e => { if (e.key === 'Enter') tryLogin(); });
  document.getElementById('logout-btn').addEventListener('click', () => {
    sessionStorage.removeItem('dw_admin_token');
    location.reload();
  });

  if (TOKEN) { showApp(); loadOverview(); }

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const tabLoaders = { overview: loadOverview, dealers: loadDealers, featured: loadFeatured, payments: loadPayments };

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.getElementById(`tab-${tab}`).classList.add('active');
      tabLoaders[tab]?.();
    });
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function fmtDate(s) { if (!s) return '—'; return new Date(s.replace(' ','T')+'Z').toLocaleString('pt-PT',{dateStyle:'short',timeStyle:'short'}); }
  function fmtEur(cents) { return '€' + (cents / 100).toFixed(2).replace('.',','); }

  // ── Overview ──────────────────────────────────────────────────────────────
  async function loadOverview() {
    const [statsRes, statusRes] = await Promise.all([
      apiFetch('/api/admin/stats'),
      apiFetch('/api/status'),
    ]);
    const stats = await statsRes.json();
    const scrapeStatus = await statusRes.json();

    const grid = document.getElementById('stats-grid');
    const totalListings = (stats.counts || []).reduce((s, r) => s + r.total, 0);
    const cards = [
      { val: totalListings, lbl: 'Total anúncios' },
      { val: stats.active_dealers, lbl: 'Concessionárias ativas' },
      { val: stats.pending_dealers, lbl: 'Concessionárias pendentes' },
      { val: stats.featured_active, lbl: 'Destaques ativos' },
      { val: fmtEur(stats.revenue_cents), lbl: 'Receita total (pago)' },
    ];
    grid.innerHTML = cards.map(c => `<div class="stat-card"><div class="val">${esc(String(c.val))}</div><div class="lbl">${esc(c.lbl)}</div></div>`).join('');

    const tbody = document.getElementById('scrape-tbody');
    const sources = ['olx', 'facebook', 'standvirtual', 'custojusto', 'autosapo'];
    tbody.innerHTML = sources.map(src => {
      const s = scrapeStatus[src];
      const statusClass = !s ? '' : s.status === 'ok' ? 'ok' : 'err';
      return `<tr class="scrape-row">
        <td>${src}</td>
        <td class="${statusClass}">${s ? s.status : '—'}</td>
        <td>${s ? s.count : '—'}</td>
        <td>${s ? fmtDate(s.ran_at) : '—'}</td>
      </tr>`;
    }).join('');
  }

  // ── Dealers ───────────────────────────────────────────────────────────────
  async function loadDealers() {
    const r = await apiFetch('/api/admin/dealers');
    const dealers = await r.json();
    const tbody = document.getElementById('dealers-tbody');
    if (!dealers.length) { tbody.innerHTML = `<tr><td colspan="8" class="empty">Nenhuma concessionária.</td></tr>`; return; }
    tbody.innerHTML = dealers.map(d => `
      <tr>
        <td><strong>${esc(d.company)}</strong><br><small>${esc(d.contact_name)}</small></td>
        <td>${esc(d.email)}</td>
        <td>${esc(d.plan)}</td>
        <td>${d.car_count} / ${d.car_limit === 9999 ? '∞' : d.car_limit}</td>
        <td><span class="badge badge-${esc(d.status)}">${esc(d.status)}</span></td>
        <td>${fmtDate(d.created_at)}</td>
        <td>
          <code class="token-code">${esc(d.token.slice(0,8))}…</code>
          <button class="btn btn-ghost btn-copy" data-action="copy-token" data-token="${esc(d.token)}">copiar</button>
        </td>
        <td class="td-actions">
          ${d.status !== 'active' ? `<button class="btn btn-success btn-action" data-action="set-status" data-token="${esc(d.token)}" data-status="active">Ativar</button>` : ''}
          ${d.status === 'active' ? `<button class="btn btn-ghost btn-action" data-action="set-status" data-token="${esc(d.token)}" data-status="inactive">Desativar</button>` : ''}
        </td>
      </tr>`).join('');
  }

  document.getElementById('dealers-tbody').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    if (btn.dataset.action === 'copy-token') {
      navigator.clipboard.writeText(btn.dataset.token).then(() => alert('Token copiado!'));
    } else if (btn.dataset.action === 'set-status') {
      await apiFetch(`/api/admin/dealers/${encodeURIComponent(btn.dataset.token)}`, { method: 'PATCH', body: JSON.stringify({ status: btn.dataset.status }) });
      loadDealers();
    }
  });

  document.getElementById('reload-dealers').addEventListener('click', loadDealers);

  document.getElementById('create-dealer-btn').addEventListener('click', async () => {
    const body = {
      company:      document.getElementById('d-company').value.trim(),
      contact_name: document.getElementById('d-contact').value.trim(),
      email:        document.getElementById('d-email').value.trim(),
      phone:        document.getElementById('d-phone').value.trim(),
      plan:         document.getElementById('d-plan').value,
      activate:     document.getElementById('d-activate').value === '1',
    };
    const msg = document.getElementById('create-msg');
    if (!body.company || !body.contact_name || !body.email) { msg.className = 'msg-error'; msg.textContent = 'Preenche empresa, contacto e email.'; return; }
    const r = await apiFetch('/api/admin/dealers', { method: 'POST', body: JSON.stringify(body) });
    const data = await r.json();
    if (data.ok) {
      msg.className = 'msg-ok';
      msg.textContent = `Criada! Token: ${data.token}`;
      navigator.clipboard.writeText(data.token).catch(() => {});
      loadDealers();
    } else {
      msg.className = 'msg-error';
      msg.textContent = data.error || 'Erro.';
    }
  });

  // ── Featured ──────────────────────────────────────────────────────────────
  async function loadFeatured() {
    const r = await apiFetch('/api/admin/featured');
    const items = await r.json();
    const tbody = document.getElementById('featured-tbody');
    if (!items.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty">Nenhum destaque ativo.</td></tr>`; return; }
    tbody.innerHTML = items.map(l => `
      <tr>
        <td><a href="${esc(l.listing_url)}" target="_blank" rel="noopener" class="listing-link">${esc(l.title)}</a></td>
        <td>${esc(l.source)}</td>
        <td>${esc(l.price || '—')}</td>
        <td>${esc(l.location || '—')}</td>
        <td>${fmtDate(l.featured_until)}</td>
        <td><button class="btn btn-danger" data-action="remove-featured" data-source="${esc(l.source)}" data-url="${esc(l.listing_url)}">Remover</button></td>
      </tr>`).join('');
  }

  document.getElementById('featured-tbody').addEventListener('click', async e => {
    const btn = e.target.closest('[data-action="remove-featured"]');
    if (!btn) return;
    if (!confirm('Remover destaque?')) return;
    await apiFetch('/api/admin/featured', { method: 'DELETE', body: JSON.stringify({ source: btn.dataset.source, listing_url: btn.dataset.url }) });
    loadFeatured();
  });

  document.getElementById('reload-featured').addEventListener('click', loadFeatured);

  // ── Payments ──────────────────────────────────────────────────────────────
  async function loadPayments() {
    const r = await apiFetch('/api/admin/payments');
    const payments = await r.json();
    const tbody = document.getElementById('payments-tbody');
    if (!payments.length) { tbody.innerHTML = `<tr><td colspan="6" class="empty">Sem pagamentos.</td></tr>`; return; }
    tbody.innerHTML = payments.map(p => `
      <tr>
        <td>${esc(p.email)}</td>
        <td>${esc(p.source)}</td>
        <td>${p.days} dia${p.days !== 1 ? 's' : ''}</td>
        <td>${fmtEur(p.amount_cents)}</td>
        <td><span class="badge badge-${p.status === 'paid' ? 'paid' : 'pending'}">${esc(p.status)}</span></td>
        <td>${fmtDate(p.created_at)}</td>
      </tr>`).join('');
  }

  document.getElementById('reload-payments').addEventListener('click', loadPayments);
})();
