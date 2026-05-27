(function () {
  // ── State ──────────────────────────────────────────────────────────────────
  let activeSource = '';
  let sortMode     = 'newest';
  let allListings  = [];
  let lastVisit    = +(localStorage.getItem('dw_last_visit') || 0);

  // pending feature action: { source, listing_url, days }
  let pendingFeature = null;

  const grid            = document.getElementById('listings-grid');
  const featuredSection = document.getElementById('featured-section');
  const featuredGrid    = document.getElementById('featured-grid');
  const featuredCount   = document.getElementById('featured-count');
  const lastUpdated     = document.getElementById('last-updated');
  const resultCount     = document.getElementById('result-count');
  const searchInput     = document.getElementById('search-input');
  const searchClear     = document.getElementById('search-clear');
  const sortSelect      = document.getElementById('sort-select');
  const minPrice        = document.getElementById('min-price');
  const maxPrice        = document.getElementById('max-price');
  const featureModal    = document.getElementById('feature-modal');
  const featureEmail    = document.getElementById('feature-email');
  const featurePayBtn   = document.getElementById('feature-pay');

  // ── Helpers ────────────────────────────────────────────────────────────────
  function esc(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function safeUrl(url) {
    try {
      const u = new URL(url);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? url : '#';
    } catch { return '#'; }
  }

  function formatTime(iso) {
    if (!iso) return 'desconhecida';
    return new Date(iso).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
  }

  function parsePrice(str) {
    if (!str) return null;
    const n = parseFloat(str.replace(/\./g, '').replace(',', '.').replace(/[^\d.]/g, ''));
    return isNaN(n) ? null : n;
  }

  function isNew(scrapedAt) {
    if (!scrapedAt) return false;
    const t = new Date(scrapedAt.replace(' ', 'T') + 'Z').getTime();
    return t > lastVisit;
  }

  function isFeatured(l) {
    if (!l.featured_until) return false;
    return new Date(l.featured_until.replace(' ', 'T') + 'Z') > new Date();
  }

  function featuredExpiresText(l) {
    if (!l.featured_until) return '';
    const exp  = new Date(l.featured_until.replace(' ', 'T') + 'Z');
    const days = Math.ceil((exp - new Date()) / 86400000);
    if (days <= 0) return '';
    return days === 1 ? 'expira amanhã' : `expira em ${days} dias`;
  }

  // ── Filter + Sort ──────────────────────────────────────────────────────────
  function applyFilters(listings) {
    const q   = searchInput.value.trim().toLowerCase();
    const min = minPrice.value ? parseFloat(minPrice.value) : null;
    const max = maxPrice.value ? parseFloat(maxPrice.value) : null;

    let result = listings.filter(l => {
      if (activeSource === 'featured' && !isFeatured(l)) return false;
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
        if (pa === null) return 1; if (pb === null) return -1;
        return pa - pb;
      });
    } else if (sortMode === 'price_desc') {
      result.sort((a, b) => {
        const pa = parsePrice(a.price), pb = parsePrice(b.price);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1; if (pb === null) return -1;
        return pb - pa;
      });
    }

    return result;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const PIN = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="flex-shrink:0;opacity:.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>`;
  const STAR_FILLED = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
  const STAR_EMPTY  = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;

  function renderCard(l, opts) {
    const compact    = opts && opts.compact;
    const isDealer   = l.source === 'dealer';
    const badgeClass = l.source === 'olx'          ? 'badge-olx'
      : l.source === 'facebook'    ? 'badge-facebook'
      : l.source === 'standvirtual'? 'badge-standvirtual'
      : l.source === 'custojusto'  ? 'badge-custojusto'
      : l.source === 'autosapo'    ? 'badge-autosapo'
      : 'badge-dealer';
    const badgeLabel = l.source === 'olx'          ? 'OLX'
      : l.source === 'facebook'    ? 'Facebook'
      : l.source === 'standvirtual'? 'StandVirtual'
      : l.source === 'custojusto'  ? 'CustoJusto'
      : l.source === 'autosapo'    ? 'AutoSapo'
      : 'Concessionária';
    const featured   = isFeatured(l);
    const hasImg     = l.image_url && !l.image_url.includes('no_thumbnail') && !l.image_url.includes('static/media');
    // Dealer images are direct URLs; scraped images go through the proxy
    const imgSrc     = hasImg
      ? (isDealer ? l.image_url : `/api/image?url=${encodeURIComponent(l.image_url)}`)
      : null;
    const safeTitle  = esc(l.title || '');
    const carEmoji   = (isDealer || l.source === 'standvirtual') ? '🚗' : '🛍';
    // When there IS an image: render img + hidden placeholder (shown only on error via event delegation)
    // When there is NO image: render only the placeholder
    const imgTag     = imgSrc ? `<img class="card-img" src="${imgSrc}" alt="${safeTitle}" loading="lazy"><div class="card-img-placeholder card-img-fallback">${carEmoji}</div>` : '';
    const placeholder = imgSrc ? '' : `<div class="card-img-placeholder">${carEmoji}</div>`;
    const newBadge   = isNew(l.scraped_at) ? '<span class="badge-new">Novo</span>' : '';
    const expText    = featured && !compact
      ? `<span style="font-size:0.65rem;color:#b45309;margin-left:auto">${esc(featuredExpiresText(l))}</span>` : '';

    // Dealer listings: show contact link instead of listing URL; no star button
    const linkHref  = isDealer ? safeUrl(l.contact_url || '#') : safeUrl(l.listing_url);
    const linkLabel = isDealer ? 'Contactar →' : 'Ver →';
    const starBtn   = isDealer ? '' : `<button class="star-btn${featured ? ' starred' : ''}"
      data-source="${esc(l.source)}"
      data-url="${esc(l.listing_url)}"
      title="${featured ? 'Remover destaque' : 'Adicionar destaque'}">${featured ? STAR_FILLED : STAR_EMPTY}</button>`;

    return `
      <article class="card${featured ? ' featured' : ''}${isDealer ? ' card-dealer' : ''}">
        <div class="card-img-wrap">
          ${imgTag}${placeholder}${newBadge}
        </div>
        <div class="card-body">
          <div class="card-title">${safeTitle}</div>
          ${l.price    ? `<div class="card-price">${esc(l.price)}</div>` : ''}
          ${l.location ? `<div class="card-location">${PIN} ${esc(l.location)}</div>` : ''}
        </div>
        <div class="card-footer">
          <span class="badge ${badgeClass}">${badgeLabel}</span>
          ${expText}
          ${starBtn}
          <a class="card-link card-link-${isDealer ? 'dealer' : 'default'}" href="${linkHref}" target="_blank" rel="noopener noreferrer">${linkLabel}</a>
        </div>
      </article>`;
  }

  function renderFeaturedSection() {
    const featured = allListings.filter(isFeatured);
    if (featured.length === 0 || activeSource === 'featured') {
      featuredSection.hidden = true;
      return;
    }
    featuredSection.hidden = false;
    featuredCount.textContent = featured.length;
    featuredGrid.innerHTML = featured.map(l => renderCard(l, { compact: true })).join('');
  }

  function renderGrid() {
    const filtered = applyFilters(allListings);
    const total    = activeSource === 'featured'
      ? allListings.filter(isFeatured).length
      : allListings.length;

    resultCount.textContent = filtered.length === total
      ? `${total} anúncios`
      : `${filtered.length} de ${total} anúncios`;

    if (!filtered.length && activeSource === 'facebook') {
      grid.innerHTML = `
        <div class="fb-login-prompt">
          <div class="fb-login-icon">f</div>
          <p class="fb-login-title">Sem anúncios do Facebook</p>
          <p class="fb-login-sub">Para ver anúncios do Facebook Marketplace, inicia sessão no Facebook e volta a este site.</p>
          <a class="fb-login-btn" href="https://www.facebook.com/marketplace/portugal/vehicles/cars/" target="_blank" rel="noopener noreferrer">Abrir Facebook Marketplace</a>
        </div>`;
    } else {
      grid.innerHTML = filtered.length
        ? filtered.map(l => renderCard(l)).join('')
        : '<p class="no-results">Nenhum anúncio encontrado para estes filtros.</p>';
    }

    renderFeaturedSection();
  }

  // ── Event delegation — image error ─────────────────────────────────────────
  document.addEventListener('error', (e) => {
    if (e.target.classList && e.target.classList.contains('card-img')) {
      e.target.style.display = 'none';
      const fallback = e.target.nextElementSibling;
      if (fallback && fallback.classList.contains('card-img-fallback')) {
        fallback.style.display = 'flex';
      }
    }
  }, true);

  // ── Star button click ──────────────────────────────────────────────────────
  function handleStarClick(btn) {
    const source = btn.dataset.source;
    const url    = btn.dataset.url;
    if (!source || !url) return;

    const listing = allListings.find(l => l.source === source && l.listing_url === url);
    if (!listing) return;

    if (isFeatured(listing)) {
      btn.classList.add('loading');
      fetch('/api/feature', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, listing_url: url }),
      }).then(r => r.json()).then(() => {
        listing.featured_until = null;
        renderGrid();
      }).catch(() => {}).finally(() => btn.classList.remove('loading'));
    } else {
      pendingFeature = { source, listing_url: url, days: null };
      featureEmail.value = '';
      featurePayBtn.disabled = true;
      featureModal.querySelectorAll('.day-btn').forEach(b => b.classList.remove('selected'));
      featureModal.hidden = false;
      featureModal.querySelector('.day-btn').focus();
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.star-btn');
    if (btn) { e.preventDefault(); handleStarClick(btn); }
  });

  // ── Feature modal ──────────────────────────────────────────────────────────
  function closeModal() {
    featureModal.hidden = true;
    pendingFeature = null;
  }

  function updatePayBtn() {
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(featureEmail.value.trim());
    featurePayBtn.disabled = !pendingFeature || !pendingFeature.days || !emailOk;
  }

  featureModal.addEventListener('click', (e) => {
    if (e.target === featureModal) { closeModal(); return; }
    const dayBtn = e.target.closest('.day-btn');
    if (dayBtn && pendingFeature) {
      featureModal.querySelectorAll('.day-btn').forEach(b => b.classList.remove('selected'));
      dayBtn.classList.add('selected');
      pendingFeature.days = parseInt(dayBtn.dataset.days, 10);
      updatePayBtn();
    }
  });

  featureEmail.addEventListener('input', updatePayBtn);

  featurePayBtn.addEventListener('click', () => {
    if (!pendingFeature || !pendingFeature.days) return;
    const email = featureEmail.value.trim();
    const { source, listing_url, days } = pendingFeature;
    closeModal();
    featurePayBtn.disabled = true;

    fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, listing_url, days, email }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.url) {
          window.location.href = data.url;
        } else {
          alert('Erro ao iniciar pagamento. Tenta novamente.');
        }
      })
      .catch(() => alert('Erro de rede. Tenta novamente.'));
  });

  document.getElementById('feature-cancel').addEventListener('click', closeModal);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // ── Load from API ──────────────────────────────────────────────────────────
  async function loadListings() {
    const q   = searchInput.value.trim();
    const src = activeSource === 'featured' ? '' : activeSource;
    let url   = '/api/listings?limit=500';
    if (src) url += `&source=${src}`;
    if (q)   url += `&q=${encodeURIComponent(q)}`;

    grid.innerHTML = '<div class="spinner"><div class="spinner-ring"></div><p>A carregar anúncios...</p></div>';
    resultCount.textContent = '';

    try {
      const [listRes, statusRes] = await Promise.all([fetch(url), fetch('/api/status')]);
      allListings = await listRes.json();
      const status = await statusRes.json();

      renderGrid();

      const lastRun = status.olx?.ran_at || status.facebook?.ran_at;
      lastUpdated.textContent = `Última atualização: ${formatTime(lastRun)}`;

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
      if (activeSource === 'featured') {
        renderGrid(); // client-side only, no API call needed
      } else {
        loadListings();
      }
    });
  });

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

  [minPrice, maxPrice].forEach(el => el.addEventListener('input', () => renderGrid()));

  document.getElementById('refresh-btn').addEventListener('click', loadListings);

  // ── PWA ────────────────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  loadListings();
  setInterval(loadListings, 5 * 60 * 1000);
})();
