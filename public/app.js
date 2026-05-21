(function () {
  let activeSource = '';
  const grid        = document.getElementById('listings-grid');
  const lastUpdated = document.getElementById('last-updated');

  function formatTime(isoString) {
    if (!isoString) return 'desconhecida';
    return new Date(isoString).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
  }

  function renderCard(l) {
    const badgeClass = l.source === 'olx' ? 'badge-olx' : 'badge-facebook';
    const badgeLabel = l.source === 'olx' ? 'OLX' : 'Facebook';
    const safeTitle  = (l.title || '').replace(/"/g, '&quot;');
    const imgSrc     = l.image_url ? `/api/image?url=${encodeURIComponent(l.image_url)}` : null;
    const imgTag     = imgSrc
      ? `<img class="card-img" src="${imgSrc}" alt="${safeTitle}" loading="lazy"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const placeholder = `<div class="card-img-placeholder" ${l.image_url ? 'style="display:none"' : ''}>📦</div>`;

    return `
      <article class="card">
        ${imgTag}${placeholder}
        <div class="card-body">
          <div class="card-title">${(l.title || '').replace(/</g, '&lt;')}</div>
          ${l.price    ? `<div class="card-price">${l.price}</div>`          : ''}
          ${l.location ? `<div class="card-location">📍 ${l.location}</div>` : ''}
        </div>
        <div class="card-footer">
          <span class="badge ${badgeClass}">${badgeLabel}</span>
          <a class="card-link" href="${l.listing_url}" target="_blank" rel="noopener">Ver artigo</a>
        </div>
      </article>`;
  }

  async function loadListings() {
    const url = activeSource ? `/api/listings?source=${activeSource}` : '/api/listings';
    grid.innerHTML = '<div class="spinner">A carregar...</div>';

    try {
      const [listRes, statusRes] = await Promise.all([fetch(url), fetch('/api/status')]);
      const listings = await listRes.json();
      const status   = await statusRes.json();

      grid.innerHTML = listings.length
        ? listings.map(renderCard).join('')
        : '<p class="no-results">Nenhum artigo encontrado. Aguarda o próximo ciclo de scraping.</p>';

      const lastRun = status.olx?.ran_at || status.facebook?.ran_at;
      lastUpdated.textContent = `Última atualização: ${formatTime(lastRun)}`;
    } catch {
      grid.innerHTML = '<p class="no-results">Erro ao carregar artigos. O servidor está a correr?</p>';
    }
  }

  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      activeSource = btn.dataset.source;
      loadListings();
    });
  });

  document.getElementById('refresh-btn').addEventListener('click', loadListings);

  loadListings();
  setInterval(loadListings, 5 * 60 * 1000);
})();
