/* ─── Config ──────────────────────────────────────────────────── */
const DATA_URL = './data.json';

const PROJECT_TYPES = [
  'Branding','Web design','Print/editorial','Poster','Packaging',
  'Motion','Illustration','Typography','Social content','Environmental'
];
const THEMES = [
  'Minimal','Bold','Typographic','Street/urban','Retro','Brutalist',
  'Organic','Luxury','Playful','Dark','Colorful'
];

/* ─── State ───────────────────────────────────────────────────── */
let allItems   = [];
let activeTypes  = new Set();
let activeThemes = new Set();
let searchQuery  = '';

/* ─── DOM refs ────────────────────────────────────────────────── */
const grid        = document.getElementById('grid');
const emptyState  = document.getElementById('empty-state');
const itemCount   = document.getElementById('item-count');
const searchInput = document.getElementById('search');
const clearBtn    = document.getElementById('clear-filters');
const lightbox    = document.getElementById('lightbox');
const lbOverlay   = document.getElementById('lightbox-overlay');
const lbInner     = document.getElementById('lightbox-inner');
const lbMeta      = document.getElementById('lightbox-meta');
const lbClose     = document.getElementById('lightbox-close');

/* ─── Bootstrap ───────────────────────────────────────────────── */
async function init() {
  buildDropdowns();
  try {
    const res = await fetch(DATA_URL + '?t=' + Date.now());
    allItems = await res.json();
  } catch (e) {
    console.error('Failed to load data.json', e);
    allItems = [];
  }
  render();
  bindEvents();
}

/* ─── Dropdowns ───────────────────────────────────────────────── */
function buildDropdowns() {
  buildDropdown('projectType', PROJECT_TYPES, activeTypes);
  buildDropdown('theme', THEMES, activeThemes);
}

function buildDropdown(key, options, activeSet) {
  const el = document.getElementById('dropdown-' + key);
  el.innerHTML = '';
  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'dropdown-item' + (activeSet.has(opt) ? ' selected' : '');
    item.textContent = opt;
    item.addEventListener('click', e => {
      e.stopPropagation();
      toggleFilter(key, opt);
    });
    el.appendChild(item);
  });
}

function toggleFilter(key, value) {
  const set = key === 'projectType' ? activeTypes : activeThemes;
  if (set.has(value)) { set.delete(value); } else { set.add(value); }
  syncDropdownUI(key, set);
  syncFilterBtnState(key, set);
  updateClearBtn();
  render();
}

function syncDropdownUI(key, set) {
  const el = document.getElementById('dropdown-' + key);
  el.querySelectorAll('.dropdown-item').forEach(item => {
    item.classList.toggle('selected', set.has(item.textContent));
  });
}

function syncFilterBtnState(key, set) {
  const btn = document.querySelector('[data-filter="' + key + '"]');
  btn.classList.toggle('has-selection', set.size > 0);
  const label = key === 'projectType' ? 'Type' : 'Theme';
  const countStr = set.size > 0 ? ' · ' + set.size : '';
  btn.childNodes[0].textContent = label + countStr + ' ';
}

function updateClearBtn() {
  const any = activeTypes.size > 0 || activeThemes.size > 0 || searchQuery;
  clearBtn.hidden = !any;
}

/* ─── Filter + Search ─────────────────────────────────────────── */
function filteredItems() {
  return allItems.filter(item => {
    if (activeTypes.size > 0) {
      const match = item.tags.projectType.some(t => activeTypes.has(t));
      if (!match) return false;
    }
    if (activeThemes.size > 0) {
      const match = item.tags.theme.some(t => activeThemes.has(t));
      if (!match) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!item.title.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

/* ─── Render ──────────────────────────────────────────────────── */
function render() {
  const items = filteredItems();

  grid.innerHTML = '';

  if (items.length === 0) {
    emptyState.hidden = false;
    itemCount.textContent = '0';
    return;
  }
  emptyState.hidden = true;
  itemCount.textContent = items.length + (items.length === 1 ? ' item' : ' items');

  items.forEach((item, i) => {
    const card = buildCard(item);
    grid.appendChild(card);
  });
}

function buildCard(item) {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-thumb">${thumbHTML(item)}</div>
    <div class="card-meta">
      <p class="card-title">${escHtml(item.title)}</p>
      <div class="card-tags">${tagsHTML(item)}</div>
      <p class="card-date">${formatDate(item.dateSaved)}</p>
    </div>
  `;
  // Lazy-load images
  const img = card.querySelector('img');
  if (img) {
    img.classList.add('loading');
    img.addEventListener('load', () => img.classList.remove('loading'));
    img.addEventListener('error', () => {
      img.parentElement.style.background = '#1a1a1a';
      img.style.display = 'none';
    });
  }

  card.addEventListener('click', () => openLightbox(item));
  return card;
}

function thumbHTML(item) {
  const badge = item.type === 'page'
    ? '<span class="card-type-badge">Page</span>'
    : item.type !== 'image' ? `<span class="card-type-badge">${item.type}</span>` : '';

  const url = item.thumbnail;
  if (!url) return '<div style="height:120px"></div>';

  if (url.match(/\.(mp4|webm)$/i)) {
    return `<video src="${url}" autoplay loop muted playsinline></video>${badge}`;
  }
  return `<img src="${url}" alt="${escHtml(item.title)}" loading="lazy" decoding="async" />${badge}`;
}

function tagsHTML(item) {
  const all = [...(item.tags.projectType || []), ...(item.tags.theme || [])];
  return all.slice(0, 3).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');
}

function formatDate(str) {
  if (!str) return '';
  const d = new Date(str + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ─── Lightbox ────────────────────────────────────────────────── */
function openLightbox(item) {
  lightbox.hidden = false;
  lbOverlay.classList.add('visible');
  document.body.style.overflow = 'hidden';

  lbInner.innerHTML = lightboxContentHTML(item);
  lbMeta.innerHTML  = lightboxMetaHTML(item);

  // If it's a page type, try iframe; detect if blocked
  if (item.type === 'page') {
    const iframe = lbInner.querySelector('iframe');
    if (iframe) {
      const timer = setTimeout(() => {
        // Iframe likely blocked — show fallback
        showLightboxFallback(item);
      }, 4000);

      iframe.addEventListener('load', () => {
        clearTimeout(timer);
        try {
          // If cross-origin, this throws → blocked
          const _ = iframe.contentDocument;
        } catch (e) {
          clearTimeout(timer);
          showLightboxFallback(item);
        }
      });

      iframe.addEventListener('error', () => {
        clearTimeout(timer);
        showLightboxFallback(item);
      });
    }
  }
}

function lightboxContentHTML(item) {
  const url = item.thumbnail;
  if (item.type === 'page') {
    return `<iframe src="${item.url}" sandbox="allow-scripts allow-same-origin allow-forms" title="${escHtml(item.title)}"></iframe>`;
  }
  if (url && url.match(/\.(mp4|webm)$/i)) {
    return `<video src="${url}" controls autoplay loop muted playsinline></video>`;
  }
  if (url && url.match(/\.gif$/i)) {
    return `<img src="${url}" alt="${escHtml(item.title)}" />`;
  }
  return `<img src="${url || ''}" alt="${escHtml(item.title)}" />`;
}

function lightboxMetaHTML(item) {
  const allTags = [...(item.tags.projectType || []), ...(item.tags.theme || [])];
  return `
    <span class="lb-title">${escHtml(item.title)}</span>
    <div class="lb-tags">${allTags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('')}</div>
    <a class="lb-link" href="${item.url}" target="_blank" rel="noopener">↗ Source</a>
  `;
}

function showLightboxFallback(item) {
  lbInner.innerHTML = `
    <div class="lb-blocked">
      <p>This site blocks embedding. Open it directly in a new tab.</p>
      <a href="${item.url}" target="_blank" rel="noopener">Open ${escHtml(item.title)} ↗</a>
    </div>
  `;
}

function closeLightbox() {
  lightbox.hidden = true;
  lbOverlay.classList.remove('visible');
  document.body.style.overflow = '';
  lbInner.innerHTML = '';
  lbMeta.innerHTML = '';
}

/* ─── Event Bindings ──────────────────────────────────────────── */
function bindEvents() {
  // Dropdown toggles
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key = btn.dataset.filter;
      const dd = document.getElementById('dropdown-' + key);
      const isOpen = dd.classList.contains('open');
      closeAllDropdowns();
      if (!isOpen) {
        dd.classList.add('open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Close dropdowns on outside click
  document.addEventListener('click', closeAllDropdowns);

  // Prevent dropdown itself from closing on click inside
  document.querySelectorAll('.dropdown').forEach(dd => {
    dd.addEventListener('click', e => e.stopPropagation());
  });

  // Clear filters
  clearBtn.addEventListener('click', () => {
    activeTypes.clear();
    activeThemes.clear();
    searchQuery = '';
    searchInput.value = '';
    buildDropdowns();
    ['projectType', 'theme'].forEach(key => {
      const set = key === 'projectType' ? activeTypes : activeThemes;
      syncFilterBtnState(key, set);
    });
    updateClearBtn();
    render();
  });

  // Search
  let searchTimer;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchQuery = searchInput.value.trim();
      updateClearBtn();
      render();
    }, 150);
  });

  // Lightbox close
  lbClose.addEventListener('click', closeLightbox);
  lbOverlay.addEventListener('click', closeLightbox);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeLightbox();
  });
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown.open').forEach(dd => dd.classList.remove('open'));
  document.querySelectorAll('.filter-btn').forEach(btn => btn.setAttribute('aria-expanded', 'false'));
}

/* ─── Utils ───────────────────────────────────────────────────── */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─── Go ──────────────────────────────────────────────────────── */
init();
