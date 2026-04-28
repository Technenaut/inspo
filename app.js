/* ─── Config ──────────────────────────────────────────────────── */
const DATA_URL = './data.json';
const GITHUB_OWNER = 'technenaut';
const GITHUB_REPO  = 'inspo';
const GITHUB_FILE  = 'data.json';
const GITHUB_API   = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`;

const PROJECT_TYPES = [
  'Branding','Web design','Print/editorial','Poster','Packaging',
  'Motion','Illustration','Typography','Social content','Environmental'
];
const THEMES = [
  'Minimal','Bold','Typographic','Street/urban','Retro','Brutalist',
  'Organic','Luxury','Playful','Dark','Colorful'
];

/* ─── State ───────────────────────────────────────────────────── */
let allItems     = [];
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

/* ─── GitHub Token ────────────────────────────────────────────── */
function getToken() {
  return localStorage.getItem('inspo_gh_token') || null;
}

function promptForToken() {
  const token = prompt(
    '🔑 Inspo needs your GitHub token to save edits.\n\n' +
    'Paste a Personal Access Token with "Contents: Read & Write" permission.\n' +
    '(Settings → Developer settings → Personal access tokens → Fine-grained)\n\n' +
    'It will be stored only in this browser.'
  );
  if (token && token.trim()) {
    localStorage.setItem('inspo_gh_token', token.trim());
    return token.trim();
  }
  return null;
}

function ensureToken() {
  return getToken() || promptForToken();
}

/* ─── GitHub API Write ────────────────────────────────────────── */
async function saveAllItemsToGitHub(token) {
  // 1. Get current SHA of the file (required for update)
  const headRes = await fetch(GITHUB_API, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    }
  });
  if (!headRes.ok) throw new Error(`GitHub GET failed: ${headRes.status}`);
  const headData = await headRes.json();
  const sha = headData.sha;

  // 2. Encode updated content as base64
  const json    = JSON.stringify(allItems, null, 2);
  const encoded = btoa(unescape(encodeURIComponent(json))); // handles Unicode

  // 3. Push update
  const putRes = await fetch(GITHUB_API, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'Update title via Inspo web app',
      content: encoded,
      sha,
    })
  });
  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}));
    throw new Error(`GitHub PUT failed: ${putRes.status} — ${err.message || ''}`);
  }
}

/* ─── Inline Title Editing ────────────────────────────────────── */

// Called by card title clicks and lightbox title clicks
// itemId: the item's unique id
// currentEl: the element to replace with an input
// onSaved: optional callback(newTitle) after a successful save
function startTitleEdit(itemId, currentEl, onSaved) {
  const item = allItems.find(i => i.id === itemId);
  if (!item) return;

  const original = item.title;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = original;
  input.className = 'title-edit-input';
  input.setAttribute('aria-label', 'Edit title');

  // Replace the element with the input
  currentEl.replaceWith(input);
  input.focus();
  input.select();

  let committed = false;

  async function commit() {
    if (committed) return;
    committed = true;

    const newTitle = input.value.trim() || original;

    // Restore element with new title
    currentEl.textContent = newTitle;
    input.replaceWith(currentEl);

    if (newTitle === original) return; // No change

    // Optimistic update in state
    item.title = newTitle;

    // Also update any other rendered card for this item
    syncCardTitle(itemId, newTitle);

    // Sync to GitHub
    const token = ensureToken();
    if (!token) {
      // User cancelled token prompt — revert
      item.title = original;
      currentEl.textContent = original;
      syncCardTitle(itemId, original);
      return;
    }

    currentEl.classList.add('title-saving');

    try {
      await saveAllItemsToGitHub(token);
      currentEl.classList.remove('title-saving');
      currentEl.classList.add('title-saved');
      setTimeout(() => currentEl.classList.remove('title-saved'), 1500);
      if (onSaved) onSaved(newTitle);
    } catch (e) {
      console.error('Failed to save title:', e);
      currentEl.classList.remove('title-saving');
      currentEl.classList.add('title-error');
      setTimeout(() => currentEl.classList.remove('title-error'), 2000);

      // If auth error, clear token so next attempt re-prompts
      if (e.message.includes('401') || e.message.includes('403')) {
        localStorage.removeItem('inspo_gh_token');
      }

      // Revert on failure
      item.title = original;
      currentEl.textContent = original;
      syncCardTitle(itemId, original);
    }
  }

  function cancel() {
    if (committed) return;
    committed = true;
    currentEl.textContent = original;
    input.replaceWith(currentEl);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { input.value = original; input.blur = cancel; input.blur(); }
  });
}

// Update all rendered card titles for a given item id
function syncCardTitle(itemId, newTitle) {
  document.querySelectorAll(`.card[data-id="${itemId}"] .card-title`).forEach(el => {
    el.textContent = newTitle;
  });
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

  items.forEach(item => {
    const card = buildCard(item);
    grid.appendChild(card);
  });
}

function buildCard(item) {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.id = item.id; // needed for syncCardTitle

  const titleEl = document.createElement('p');
  titleEl.className = 'card-title';
  titleEl.textContent = item.title;
  titleEl.title = 'Click to edit title';

  // Edit on click — don't open lightbox
  titleEl.addEventListener('click', e => {
    e.stopPropagation();
    startTitleEdit(item.id, titleEl);
  });

  const thumbDiv = document.createElement('div');
  thumbDiv.className = 'card-thumb';
  thumbDiv.innerHTML = thumbHTML(item);

  const tagsDiv = document.createElement('div');
  tagsDiv.className = 'card-tags';
  tagsDiv.innerHTML = tagsHTML(item);

  const dateP = document.createElement('p');
  dateP.className = 'card-date';
  dateP.textContent = formatDate(item.dateSaved);

  const metaDiv = document.createElement('div');
  metaDiv.className = 'card-meta';
  metaDiv.append(titleEl, tagsDiv, dateP);

  card.append(thumbDiv, metaDiv);

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

  // Click card body (not title) → lightbox
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
let currentLightboxItem = null;

function openLightbox(item) {
  currentLightboxItem = item;
  lightbox.hidden = false;
  lbClose.classList.add('visible');
  lbOverlay.classList.add('visible');
  document.body.style.overflow = 'hidden';

  lbInner.innerHTML = lightboxContentHTML(item);
  lbMeta.innerHTML  = '';
  lbMeta.appendChild(buildLightboxMeta(item));

  // If it's a page type, try iframe; detect if blocked
  if (item.type === 'page') {
    const iframe = lbInner.querySelector('iframe');
    if (iframe) {
      const timer = setTimeout(() => {
        showLightboxFallback(item);
      }, 4000);

      iframe.addEventListener('load', () => {
        clearTimeout(timer);
        try {
          const _ = iframe.contentDocument; // throws if cross-origin
        } catch (e) {
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
  return `<img src="${url || ''}" alt="${escHtml(item.title)}" />`;
}

function buildLightboxMeta(item) {
  const frag = document.createDocumentFragment();

  // Editable title
  const titleEl = document.createElement('span');
  titleEl.className = 'lb-title';
  titleEl.textContent = item.title;
  titleEl.title = 'Click to edit title';
  titleEl.addEventListener('click', () => {
    startTitleEdit(item.id, titleEl, newTitle => {
      // Also sync the card in grid if visible
      syncCardTitle(item.id, newTitle);
    });
  });
  frag.appendChild(titleEl);

  // Tags
  const tagsDiv = document.createElement('div');
  tagsDiv.className = 'lb-tags';
  const allTags = [...(item.tags.projectType || []), ...(item.tags.theme || [])];
  tagsDiv.innerHTML = allTags.map(t => `<span class="tag">${escHtml(t)}</span>`).join('');
  frag.appendChild(tagsDiv);

  // Source link
  const link = document.createElement('a');
  link.className = 'lb-link';
  link.href = item.url;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = '↗ Source';
  frag.appendChild(link);

  return frag;
}

function showLightboxFallback(item) {
  lbInner.innerHTML = `
    <div class="lb-blocked">
      <p>This site blocks embedding.</p>
      <a href="${item.url}" target="_blank" rel="noopener">Open ${escHtml(item.title)} ↗</a>
    </div>
  `;
}

function closeLightbox() {
  currentLightboxItem = null;
  lightbox.hidden = true;
  lbClose.classList.remove('visible');
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
