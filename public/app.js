(function () {
  // ── State ──────────────────────────────────────────────────────────────────
  let activeSource = '';
  let sortMode     = 'newest';
  let allListings  = [];   // raw from API
  let lastVisit    = +(localStorage.getItem('dw_last_visit') || 0);

  const grid        = document.getElementById('listings-grid');
  const lastUpdated = document.getElementById('last-updated');
  const resultCount = document.getElementById('result-count');
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const sortSelect  = document.getElementById('sort-select');
  const minPrice    = document.getElementById('min-price');
  const maxPrice    = document.getElementById('max-price');

  // ── Helpers ────────────────────────────────────────────────────────────────
  function formatTime(iso) {
    if (!iso) return 'desconhecida';
    return new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
  }

  function parsePrice(str) {
    if (!str) return null;
    // "1.200,50 €" → 1200.50, "125 €" → 125
    const n = parseFloat(str.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
    return isNaN(n) ? null : n;
  }

  function isNew(scrapedAt) {
    if (!scrapedAt) return false;
    const t = new Date(scrapedAt.replace(' ', 'T') + 'Z').getTime();
    return t > lastVisit;
  }

  // ── Filter + Sort ──────────────────────────────────────────────────────────
  function applyFilters(listings) {
    const q   = searchInput.value.trim().toLowerCase();
    const min = minPrice.value ? parseFloat(minPrice.value) : null;
    const max = maxPrice.value ? parseFloat(maxPrice.value) : null;

    let result = listings.filter(l => {
      if (q && !(l.title || '').toLowerCase().includes(q) && !(l.location || '').toLowerCase().includes(q)) return false;
      const p = parsePrice(l.price);
      if (min !== null && (p === null || p < min)) return false;
      if (max !== null && (p === null || p > max)) return false;
      return true;
    });

    if (sortMode === 'price_asc') {
      result.sort((a, b) => {
        const pa = parsePrice(a.price), pb = parsePrice(b.price);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pa - pb;
      });
    } else if (sortMode === 'price_desc') {
      result.sort((a, b) => {
        const pa = parsePrice(a.price), pb = parsePrice(b.price);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pb - pa;
      });
    }

    return result;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const PIN = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;opacity:.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;

  function renderCard(l) {
    const badgeClass = l.source === 'olx' ? 'badge-olx' : 'badge-facebook';
    const badgeLabel = l.source === 'olx' ? 'OLX' : 'Facebook';
    const safeTitle  = (l.title || '').replace(/"/g, '&quot;');
    const hasImg     = l.image_url && !l.image_url.includes('no_thumbnail') && !l.image_url.includes('static/media');
    const imgSrc     = hasImg ? `/api/image?url=${encodeURIComponent(l.image_url)}` : null;
    const imgTag     = imgSrc
      ? `<img class="card-img" src="${imgSrc}" alt="${safeTitle}" loading="lazy"
              onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const placeholder = `<div class="card-img-placeholder" ${imgSrc ? 'style="display:none"' : ''}>🛍</div>`;
    const newBadge    = isNew(l.scraped_at) ? '<span class="badge-new">Novo</span>' : '';

    return `
      <article class="card">
        <div class="card-img-wrap">
          ${imgTag}${placeholder}
          ${newBadge}
        </div>
        <div class="card-body">
          <div class="card-title">${(l.title || '').replace(/</g, '&lt;')}</div>
          ${l.price    ? `<div class="card-price">${l.price}</div>` : ''}
          ${l.location ? `<div class="card-location">${PIN} ${l.location}</div>` : ''}
        </div>
        <div class="card-footer">
          <span class="badge ${badgeClass}">${badgeLabel}</span>
          <a class="card-link" href="${l.listing_url}" target="_blank" rel="noopener">Ver anúncio →</a>
        </div>
      </article>`;
  }

  function renderGrid() {
    const filtered = applyFilters(allListings);
    const total    = allListings.length;
    const shown    = filtered.length;

    resultCount.textContent = shown === total
      ? `${total} anúncios`
      : `${shown} de ${total} anúncios`;

    grid.innerHTML = filtered.length
      ? filtered.map(renderCard).join('')
      : '<p class="no-results">Nenhum anúncio encontrado para estes filtros.</p>';
  }

  // ── Load from API ──────────────────────────────────────────────────────────
  async function loadListings() {
    const q = searchInput.value.trim();
    let url = '/api/listings?limit=500';
    if (activeSource) url += `&source=${activeSource}`;
    if (q)            url += `&q=${encodeURIComponent(q)}`;

    grid.innerHTML = '<div class="spinner"><div class="spinner-ring"></div><p>A carregar anúncios...</p></div>';
    resultCount.textContent = '';

    try {
      const [listRes, statusRes] = await Promise.all([fetch(url), fetch('/api/status')]);
      allListings = await listRes.json();
      const status = await statusRes.json();

      renderGrid();

      const lastRun = status.olx?.ran_at || status.facebook?.ran_at;
      lastUpdated.textContent = `Última atualização: ${formatTime(lastRun)}`;

      // Update last visit after rendering so badges show correctly this session
      localStorage.setItem('dw_last_visit', Date.now());
    } catch {
      grid.innerHTML = '<p class="no-results">Erro ao carregar anúncios. O servidor está a correr?</p>';
    }
  }

  // ── Event listeners ────────────────────────────────────────────────────────
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSource = btn.dataset.source;
      loadListings();
    });
  });

  // Search: debounce 300ms then hit API
  let searchTimer;
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    searchClear.style.display = q ? 'flex' : 'none';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(loadListings, 300);
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    loadListings();
  });

  sortSelect.addEventListener('change', () => {
    sortMode = sortSelect.value;
    renderGrid();
  });

  [minPrice, maxPrice].forEach(el => {
    el.addEventListener('input', () => renderGrid());
  });

  document.getElementById('refresh-btn').addEventListener('click', loadListings);

  // ── PWA ────────────────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  loadListings();
  setInterval(loadListings, 5 * 60 * 1000);
})();
