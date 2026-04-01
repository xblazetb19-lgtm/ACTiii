/* ══════════════════════════════════════════
   ACT-III — app.js
   Full-stack music streaming app with Supabase
══════════════════════════════════════════ */

// ─────────────────────────────────────────
// ⚙️  CONFIG — Replace with your Supabase URL & anon key
// ─────────────────────────────────────────
const SUPABASE_URL = 'https://dkgthznjxzahhtchczaz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pgbAofMYMwwQAQeiPkdyiw_v0DvvOrx';

const supabase = supabase_js.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─────────────────────────────────────────
// 🌐 GLOBAL STATE
// ─────────────────────────────────────────
let currentUser = null;
let currentProfile = null;
let currentQueue = [];
let currentIndex = -1;
let isPlaying = false;
let allSongs = [];
let allAlbums = [];
let allArtists = [];
let favSongIds = new Set();
let favAlbumIds = new Set();
let userPlaylists = [];
let chartTopSongs = null;
let chartDaily = null;
let searchTimeout = null;

// ─────────────────────────────────────────
// 🚀 INIT
// ─────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Auth state listener
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.user) {
      currentUser = session.user;
      await loadUserProfile();
      showApp();
    } else {
      currentUser = null;
      currentProfile = null;
      showAuth();
    }
  });

  // Check existing session
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await loadUserProfile();
    showApp();
  } else {
    showAuth();
  }

  // Navigation
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });

  // Auth tabs
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => switchAuthTab(tab.dataset.tab));
  });

  // Library tabs
  document.querySelectorAll('.lib-tab').forEach(tab => {
    tab.addEventListener('click', () => switchLibTab(tab.dataset.lib));
  });
});

// ─────────────────────────────────────────
// 🔐 AUTH
// ─────────────────────────────────────────
function showAuth() {
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function showApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  initApp();
}

async function authLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const msg = document.getElementById('auth-message');
  msg.textContent = '';
  msg.className = 'auth-message';

  if (!email || !password) { msg.textContent = 'Remplissez tous les champs.'; return; }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { msg.textContent = error.message; }
}

async function authRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const msg = document.getElementById('auth-message');
  msg.textContent = '';
  msg.className = 'auth-message';

  if (!name || !email || !password) { msg.textContent = 'Remplissez tous les champs.'; return; }
  if (password.length < 6) { msg.textContent = 'Mot de passe trop court (min 6 chars).'; return; }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) { msg.textContent = error.message; return; }

  // Create profile
  const accessCode = 'ACT3-' + Math.random().toString(36).substring(2, 6).toUpperCase();
  await supabase.from('profiles').insert({
    user_id: data.user.id,
    display_name: name,
    access_code: accessCode,
    stats_json: {}
  });

  msg.className = 'auth-message success';
  msg.textContent = '✅ Compte créé ! Vérifiez votre email si nécessaire.';
}

async function authLogout() {
  await supabase.auth.signOut();
}

function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.querySelector(`.auth-tab[data-tab="${tab}"]`).classList.add('active');
  document.getElementById(`auth-${tab}`).classList.add('active');
  document.getElementById('auth-message').textContent = '';
}

// ─────────────────────────────────────────
// 👤 USER PROFILE
// ─────────────────────────────────────────
async function loadUserProfile() {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', currentUser.id)
    .single();
  currentProfile = data;
}

// ─────────────────────────────────────────
// 🎵 INIT APP
// ─────────────────────────────────────────
async function initApp() {
  // Load all data in parallel
  await Promise.all([
    loadPublicData(),
    loadFavorites(),
    loadPlaylists(),
  ]);

  renderHomePage();
  renderProfilePage();
}

// ─────────────────────────────────────────
// ☁️ DATA LOADERS
// ─────────────────────────────────────────
async function loadPublicData() {
  const [artistsRes, albumsRes, songsRes] = await Promise.all([
    supabase.from('artists').select('*').order('name'),
    supabase.from('albums').select('*, artists(name)').order('title'),
    supabase.from('songs').select('*, albums(title, cover_url, artists(name))').order('title'),
  ]);
  allArtists = artistsRes.data || [];
  allAlbums = albumsRes.data || [];
  allSongs = songsRes.data || [];
}

async function loadFavorites() {
  if (!currentUser) return;
  const { data } = await supabase
    .from('favorites')
    .select('*')
    .eq('user_id', currentUser.id);
  favSongIds = new Set((data || []).filter(f => f.type === 'song').map(f => f.item_id));
  favAlbumIds = new Set((data || []).filter(f => f.type === 'album').map(f => f.item_id));
}

async function loadPlaylists() {
  if (!currentUser) return;
  const { data } = await supabase
    .from('playlists')
    .select('*, playlist_songs(song_id, songs(title, albums(cover_url, artists(name))))')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });
  userPlaylists = data || [];
}

async function loadHistory() {
  if (!currentUser) return [];
  const { data } = await supabase
    .from('history')
    .select('*, songs(title, albums(artists(name)))')
    .eq('user_id', currentUser.id)
    .order('listened_at', { ascending: false })
    .limit(200);
  return data || [];
}

// ─────────────────────────────────────────
// 🏠 HOME PAGE
// ─────────────────────────────────────────
function renderHomePage() {
  // Greeting
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bon après-midi' : 'Bonsoir';
  const name = currentProfile?.display_name?.split(' ')[0] || 'ami';
  document.getElementById('greeting-name').textContent = name;
  document.querySelector('#page-home .page-title').innerHTML =
    `${greet}, <span>${name}</span> 👋`;

  // Artists
  const artistGrid = document.getElementById('home-artists');
  artistGrid.innerHTML = allArtists.slice(0, 8).map(a => cardArtist(a)).join('');

  // Albums
  const albumGrid = document.getElementById('home-albums');
  albumGrid.innerHTML = allAlbums.slice(0, 8).map(a => cardAlbum(a)).join('');

  // Songs
  const songList = document.getElementById('home-songs');
  const queue = allSongs.slice(0, 15);
  songList.innerHTML = queue.map((s, i) => songItem(s, i, queue)).join('');
}

// ─────────────────────────────────────────
// 🎨 CARD RENDERERS
// ─────────────────────────────────────────
function cardArtist(artist) {
  const cover = artist.cover_url
    ? `<img src="${esc(artist.cover_url)}" alt="${esc(artist.name)}" loading="lazy" />`
    : `<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  return `
    <div class="card" onclick="openArtist('${artist.id}')">
      <div class="card-cover">
        ${cover}
        <div class="card-play-overlay"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
      </div>
      <div class="card-body">
        <div class="card-title">${esc(artist.name)}</div>
        <div class="card-subtitle">Artiste</div>
      </div>
    </div>`;
}

function cardAlbum(album) {
  const cover = album.cover_url
    ? `<img src="${esc(album.cover_url)}" alt="${esc(album.title)}" loading="lazy" />`
    : `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>`;
  const artistName = album.artists?.name || '';
  return `
    <div class="card" onclick="openAlbum('${album.id}')">
      <div class="card-cover">
        ${cover}
        <div class="card-play-overlay"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
      </div>
      <div class="card-body">
        <div class="card-title">${esc(album.title)}</div>
        <div class="card-subtitle">${esc(artistName)}</div>
      </div>
    </div>`;
}

function songItem(song, index, queue) {
  const cover = getCover(song);
  const liked = favSongIds.has(song.id);
  const artistName = song.albums?.artists?.name || '';
  const duration = song.duration_sec ? formatDuration(song.duration_sec) : '—';
  return `
    <div class="song-item ${currentIndex !== -1 && currentQueue[currentIndex]?.id === song.id ? 'playing' : ''}"
         onclick="playSong(${index}, ${JSON.stringify(JSON.stringify(queue)).slice(1,-1)})">
      <div class="song-cover">
        ${cover ? `<img src="${esc(cover)}" loading="lazy" />` : `<svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`}
      </div>
      <div class="song-info">
        <div class="song-title">${esc(song.title)}</div>
        <div class="song-artist">${esc(artistName)}</div>
      </div>
      <span class="song-duration">${duration}</span>
      <div class="song-actions">
        <button class="song-action-btn ${liked ? 'liked' : ''}"
                onclick="event.stopPropagation(); toggleFavSong('${song.id}', this)">
          <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"${liked ? ' fill="currentColor"' : ''}/></svg>
        </button>
        <button class="song-action-btn"
                onclick="event.stopPropagation(); openAddToPlaylist('${song.id}')">
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>
      </div>
    </div>`;
}

// ─────────────────────────────────────────
// 🔍 SEARCH
// ─────────────────────────────────────────
function handleSearch(query) {
  clearTimeout(searchTimeout);
  const results = document.getElementById('search-results');
  if (!query.trim()) {
    results.innerHTML = `<div class="search-placeholder">
      <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <p>Tapez pour rechercher</p></div>`;
    return;
  }
  searchTimeout = setTimeout(() => {
    const q = query.toLowerCase();
    const artists = allArtists.filter(a => a.name.toLowerCase().includes(q));
    const albums = allAlbums.filter(a => a.title.toLowerCase().includes(q));
    const songs = allSongs.filter(s =>
      s.title.toLowerCase().includes(q) ||
      (s.albums?.artists?.name || '').toLowerCase().includes(q)
    );

    let html = '';
    if (artists.length) {
      html += `<div class="search-section"><div class="search-section-title">Artistes</div>
        <div class="cards-grid">${artists.slice(0, 6).map(a => cardArtist(a)).join('')}</div></div>`;
    }
    if (albums.length) {
      html += `<div class="search-section"><div class="search-section-title">Albums</div>
        <div class="cards-grid">${albums.slice(0, 6).map(a => cardAlbum(a)).join('')}</div></div>`;
    }
    if (songs.length) {
      html += `<div class="search-section"><div class="search-section-title">Titres</div>
        <div class="song-list">${songs.slice(0, 20).map((s, i) => songItem(s, i, songs)).join('')}</div></div>`;
    }
    if (!html) html = `<div class="empty-state">Aucun résultat pour "${esc(query)}"</div>`;
    results.innerHTML = html;
  }, 250);
}

// ─────────────────────────────────────────
// 📚 LIBRARY
// ─────────────────────────────────────────
function switchLibTab(lib) {
  document.querySelectorAll('.lib-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.lib-panel').forEach(p => p.classList.remove('active'));
  document.querySelector(`.lib-tab[data-lib="${lib}"]`).classList.add('active');
  document.getElementById(`lib-${lib}`).classList.add('active');
  if (lib === 'playlists') renderPlaylists();
  if (lib === 'fav-songs') renderFavSongs();
  if (lib === 'fav-albums') renderFavAlbums();
}

function renderPlaylists() {
  const el = document.getElementById('playlists-list');
  if (!userPlaylists.length) {
    el.innerHTML = `<div class="empty-state">Aucune playlist. Créez-en une !</div>`;
    return;
  }
  el.innerHTML = userPlaylists.map(p => `
    <div class="playlist-item" onclick="openPlaylist('${p.id}')">
      <div class="playlist-icon">
        <svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
      </div>
      <div class="playlist-info">
        <div class="playlist-name">${esc(p.name)}</div>
        <div class="playlist-count">${(p.playlist_songs || []).length} titre(s)</div>
      </div>
    </div>`).join('');
}

function renderFavSongs() {
  const favSongs = allSongs.filter(s => favSongIds.has(s.id));
  const el = document.getElementById('fav-songs-list');
  if (!favSongs.length) {
    el.innerHTML = `<div class="empty-state">Aucun titre favori.</div>`;
    return;
  }
  el.innerHTML = favSongs.map((s, i) => songItem(s, i, favSongs)).join('');
}

function renderFavAlbums() {
  const favAlbums = allAlbums.filter(a => favAlbumIds.has(a.id));
  const el = document.getElementById('fav-albums-list');
  if (!favAlbums.length) {
    el.innerHTML = `<div class="empty-state">Aucun album favori.</div>`;
    return;
  }
  el.innerHTML = favAlbums.map(a => cardAlbum(a)).join('');
}

// ─────────────────────────────────────────
// 👤 PROFILE PAGE
// ─────────────────────────────────────────
async function renderProfilePage() {
  if (!currentProfile) return;

  document.getElementById('profile-name').textContent = currentProfile.display_name || 'Utilisateur';
  document.getElementById('profile-code').textContent = currentProfile.access_code || '—';
  document.getElementById('profile-avatar').textContent =
    (currentProfile.display_name || 'U')[0].toUpperCase();

  const history = await loadHistory();

  // Stats
  const stats = currentProfile.stats_json || {};
  document.getElementById('stat-minutes').textContent = stats.minutes || 0;
  document.getElementById('stat-likes').textContent = favSongIds.size;
  document.getElementById('stat-genre').textContent = stats.genre || '—';

  // Badges
  renderBadges(history, stats);

  // Tier List
  renderTierList(history);

  // Charts
  renderCharts(history);
}

// ─────────────────────────────────────────
// 🎖️ BADGES
// ─────────────────────────────────────────
function renderBadges(history, stats) {
  const badges = [];
  const now = new Date();

  const lateNight = history.some(h => {
    const d = new Date(h.listened_at);
    return d.getHours() >= 0 && d.getHours() < 5;
  });
  if (lateNight) badges.push({ icon: '🌙', name: 'Lève-tard', desc: 'Écoute après minuit' });

  const uniqueArtists = new Set(history.map(h => h.songs?.albums?.artists?.name).filter(Boolean));
  if (uniqueArtists.size >= 10) badges.push({ icon: '🗺️', name: 'Explorateur', desc: '10+ artistes écoutés' });

  if ((stats.minutes || 0) >= 500) badges.push({ icon: '🔥', name: 'Addict', desc: '500+ minutes d\'écoute' });

  if (favSongIds.size >= 20) badges.push({ icon: '❤️', name: 'Mélomane', desc: '20+ titres likés' });

  if (history.length >= 50) badges.push({ icon: '🎵', name: 'Assidu', desc: '50+ écoutes' });

  const el = document.getElementById('badges-grid');
  if (!badges.length) {
    el.innerHTML = `<div class="empty-state">Écoutez de la musique pour débloquer des badges !</div>`;
    return;
  }
  el.innerHTML = badges.map(b => `
    <div class="badge">
      <span class="badge-icon">${b.icon}</span>
      <span class="badge-name">${b.name}</span>
      <span class="badge-desc">— ${b.desc}</span>
    </div>`).join('');
}

// ─────────────────────────────────────────
// 🏆 TIER LIST
// ─────────────────────────────────────────
function renderTierList(history) {
  // Count plays per artist
  const artistCounts = {};
  history.forEach(h => {
    const name = h.songs?.albums?.artists?.name;
    if (name) artistCounts[name] = (artistCounts[name] || 0) + 1;
  });

  const sorted = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]);

  if (!sorted.length) {
    document.getElementById('tier-list').innerHTML =
      `<div class="empty-state">Écoutez de la musique pour voir votre Tier List !</div>`;
    return;
  }

  const s = sorted.slice(0, 5).map(a => a[0]);
  const a = sorted.slice(5, 10).map(a => a[0]);
  const b = sorted.slice(10, 15).map(a => a[0]);
  const c = sorted.slice(15).map(a => a[0]);

  const tiers = [
    { label: 'S', artists: s, cls: 'tier-s' },
    { label: 'A', artists: a, cls: 'tier-a' },
    { label: 'B', artists: b, cls: 'tier-b' },
    { label: 'C', artists: c, cls: 'tier-c' },
  ].filter(t => t.artists.length > 0);

  document.getElementById('tier-list').innerHTML = tiers.map(t => `
    <div class="tier-row ${t.cls}">
      <div class="tier-label">${t.label}</div>
      <div class="tier-artists">
        ${t.artists.map(name => `<span class="tier-artist-chip">${esc(name)}</span>`).join('')}
      </div>
    </div>`).join('');
}

// ─────────────────────────────────────────
// 📈 CHARTS
// ─────────────────────────────────────────
function renderCharts(history) {
  // Top 5 songs
  const songCounts = {};
  history.forEach(h => {
    const title = h.songs?.title;
    if (title) songCounts[title] = (songCounts[title] || 0) + 1;
  });
  const topSongs = Object.entries(songCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

  const ctx1 = document.getElementById('chart-top-songs').getContext('2d');
  if (chartTopSongs) chartTopSongs.destroy();
  chartTopSongs = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: topSongs.map(s => s[0].length > 15 ? s[0].slice(0, 15) + '…' : s[0]),
      datasets: [{
        data: topSongs.map(s => s[1]),
        backgroundColor: '#1db954',
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b6b6b', font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: '#6b6b6b', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });

  // Daily listens (last 7 days)
  const days = [];
  const dayCounts = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(key);
    dayCounts[key] = 0;
  }
  history.forEach(h => {
    const key = h.listened_at?.slice(0, 10);
    if (dayCounts.hasOwnProperty(key)) dayCounts[key]++;
  });

  const ctx2 = document.getElementById('chart-daily').getContext('2d');
  if (chartDaily) chartDaily.destroy();
  chartDaily = new Chart(ctx2, {
    type: 'line',
    data: {
      labels: days.map(d => d.slice(5)),
      datasets: [{
        data: days.map(d => dayCounts[d]),
        borderColor: '#1db954',
        backgroundColor: 'rgba(29,185,84,0.1)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: '#1db954',
        pointRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b6b6b', font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: '#6b6b6b', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
      }
    }
  });
}

// ─────────────────────────────────────────
// 🎵 PLAYER
// ─────────────────────────────────────────
function playSong(index, queueJson) {
  let queue;
  try { queue = JSON.parse(queueJson); } catch { queue = allSongs; }
  currentQueue = queue;
  currentIndex = index;
  isPlaying = true;
  updatePlayer();
  recordHistory(currentQueue[currentIndex]);
  showToast(`▶ ${currentQueue[currentIndex]?.title || '—'}`);
}

function playerToggle() {
  isPlaying = !isPlaying;
  updatePlayIcons();
}

function playerNext() {
  if (!currentQueue.length) return;
  currentIndex = (currentIndex + 1) % currentQueue.length;
  isPlaying = true;
  updatePlayer();
  recordHistory(currentQueue[currentIndex]);
}

function playerPrev() {
  if (!currentQueue.length) return;
  currentIndex = (currentIndex - 1 + currentQueue.length) % currentQueue.length;
  isPlaying = true;
  updatePlayer();
}

function updatePlayer() {
  const song = currentQueue[currentIndex];
  if (!song) return;

  const cover = getCover(song);
  const title = song.title || '—';
  const artist = song.albums?.artists?.name || '';

  // Mini player
  document.getElementById('mp-title').textContent = title;
  document.getElementById('mp-artist').textContent = artist;
  const mpCover = document.getElementById('mp-cover');
  mpCover.innerHTML = cover
    ? `<img src="${esc(cover)}" style="width:100%;height:100%;object-fit:cover;" />`
    : `<svg viewBox="0 0 24 24" style="width:20px;height:20px;stroke:#6b6b6b;fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

  // Full player
  document.getElementById('fp-title').textContent = title;
  document.getElementById('fp-artist').textContent = artist;
  const fpCover = document.getElementById('fp-cover');
  fpCover.innerHTML = cover
    ? `<img src="${esc(cover)}" style="width:100%;height:100%;object-fit:cover;" />`
    : `<svg viewBox="0 0 24 24" style="width:64px;height:64px;stroke:#6b6b6b;fill:none;stroke-width:1;stroke-linecap:round;stroke-linejoin:round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

  // Like button state
  const likeBtn = document.getElementById('fp-like-btn');
  likeBtn.className = 'fp-like-btn' + (favSongIds.has(song.id) ? ' liked' : '');

  updatePlayIcons();
}

function updatePlayIcons() {
  const pauseIcon = `<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
  const playIcon = `<polygon points="5 3 19 12 5 21 5 3"/>`;
  const icon = isPlaying ? pauseIcon : playIcon;
  document.getElementById('mp-play-icon').innerHTML = icon;
  document.getElementById('fp-play-icon').innerHTML = icon;
}

function openFullPlayer() {
  document.getElementById('full-player-overlay').classList.add('open');
}

function closeFullPlayer(e) {
  if (!e || e.target === document.getElementById('full-player-overlay')) {
    document.getElementById('full-player-overlay').classList.remove('open');
  }
}

async function toggleCurrentLike() {
  const song = currentQueue[currentIndex];
  if (!song) return;
  await toggleFavSong(song.id, document.getElementById('fp-like-btn'));
}

async function toggleFavSong(songId, btn) {
  if (!currentUser) return;
  const liked = favSongIds.has(songId);
  if (liked) {
    await supabase.from('favorites').delete()
      .eq('user_id', currentUser.id).eq('type', 'song').eq('item_id', songId);
    favSongIds.delete(songId);
    showToast('Retiré des favoris');
  } else {
    await supabase.from('favorites').insert({
      user_id: currentUser.id, type: 'song', item_id: songId
    });
    favSongIds.add(songId);
    showToast('❤️ Ajouté aux favoris', 'success');
  }
  // Update button
  if (btn) {
    btn.className = 'song-action-btn' + (favSongIds.has(songId) ? ' liked' : '');
    const path = btn.querySelector('path');
    if (path) path.setAttribute('fill', favSongIds.has(songId) ? 'currentColor' : 'none');
  }
  const fpBtn = document.getElementById('fp-like-btn');
  if (fpBtn && currentQueue[currentIndex]?.id === songId) {
    fpBtn.className = 'fp-like-btn' + (favSongIds.has(songId) ? ' liked' : '');
  }
  // Update stats
  document.getElementById('stat-likes').textContent = favSongIds.size;
}

async function recordHistory(song) {
  if (!currentUser || !song) return;
  await supabase.from('history').insert({
    user_id: currentUser.id,
    song_id: song.id,
    listened_at: new Date().toISOString()
  });
  // Update minutes stat
  const dur = song.duration_sec || 0;
  const stats = currentProfile?.stats_json || {};
  stats.minutes = (stats.minutes || 0) + Math.floor(dur / 60);
  await supabase.from('profiles').update({ stats_json: stats })
    .eq('user_id', currentUser.id);
  if (currentProfile) currentProfile.stats_json = stats;
  document.getElementById('stat-minutes').textContent = stats.minutes || 0;
}

// ─────────────────────────────────────────
// 📁 ARTIST / ALBUM VIEWS
// ─────────────────────────────────────────
function openArtist(artistId) {
  const artist = allArtists.find(a => a.id === artistId);
  const albums = allAlbums.filter(a => a.artist_id === artistId);
  const songs = allSongs.filter(s => albums.some(a => a.id === s.album_id));

  openGenericModal(
    `🎤 ${artist?.name || 'Artiste'}`,
    `<div class="section">
      <div class="section-title" style="font-size:0.9rem;margin-bottom:12px;">Albums</div>
      <div class="cards-grid" style="grid-template-columns:repeat(auto-fill,minmax(120px,1fr))">
        ${albums.map(a => cardAlbum(a)).join('')}
      </div>
    </div>
    <div class="section" style="margin-top:16px">
      <div class="section-title" style="font-size:0.9rem;margin-bottom:12px;">Titres</div>
      <div class="song-list">${songs.slice(0, 10).map((s, i) => songItem(s, i, songs)).join('')}</div>
    </div>`,
    null
  );
}

function openAlbum(albumId) {
  const album = allAlbums.find(a => a.id === albumId);
  const songs = allSongs.filter(s => s.album_id === albumId);
  const cover = album?.cover_url;
  const artist = album?.artists?.name || '';
  const favAlb = favAlbumIds.has(albumId);

  openGenericModal(
    `💿 ${album?.title || 'Album'}`,
    `<div style="display:flex;gap:16px;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap">
      ${cover ? `<img src="${esc(cover)}" style="width:100px;height:100px;object-fit:cover;border-radius:8px;"/>` : ''}
      <div>
        <p style="color:var(--text2);font-size:0.9rem;margin-bottom:8px">${esc(artist)}</p>
        <button class="btn-add ${favAlb ? 'fav-active' : ''}"
          onclick="toggleFavAlbum('${albumId}', this)"
          style="${favAlb ? 'border-color:var(--accent);color:var(--accent)' : ''}">
          ${favAlb ? '❤️ Favori' : '♡ Ajouter aux favoris'}
        </button>
      </div>
    </div>
    <div class="song-list">${songs.map((s, i) => songItem(s, i, songs)).join('')}</div>`,
    null
  );
}

async function toggleFavAlbum(albumId, btn) {
  if (!currentUser) return;
  const liked = favAlbumIds.has(albumId);
  if (liked) {
    await supabase.from('favorites').delete()
      .eq('user_id', currentUser.id).eq('type', 'album').eq('item_id', albumId);
    favAlbumIds.delete(albumId);
    if (btn) { btn.textContent = '♡ Ajouter aux favoris'; btn.style.cssText = ''; }
    showToast('Retiré des albums favoris');
  } else {
    await supabase.from('favorites').insert({
      user_id: currentUser.id, type: 'album', item_id: albumId
    });
    favAlbumIds.add(albumId);
    if (btn) { btn.textContent = '❤️ Favori'; btn.style.cssText = 'border-color:var(--accent);color:var(--accent)'; }
    showToast('❤️ Album ajouté aux favoris', 'success');
  }
}

// ─────────────────────────────────────────
// 📁 PLAYLISTS
// ─────────────────────────────────────────
function openCreatePlaylist() {
  openGenericModal('Nouvelle playlist',
    `<input type="text" class="modal-input" id="new-playlist-name" placeholder="Nom de la playlist" />`,
    async () => {
      const name = document.getElementById('new-playlist-name').value.trim();
      if (!name) { showToast('Entrez un nom', 'error'); return; }
      const { data, error } = await supabase.from('playlists').insert({
        user_id: currentUser.id, name
      }).select().single();
      if (error) { showToast('Erreur', 'error'); return; }
      userPlaylists.unshift(data);
      renderPlaylists();
      closeGenericModal();
      showToast('✅ Playlist créée', 'success');
    }
  );
}

function openPlaylist(playlistId) {
  const playlist = userPlaylists.find(p => p.id === playlistId);
  const songs = (playlist?.playlist_songs || []).map(ps => {
    const song = allSongs.find(s => s.id === ps.song_id);
    return song;
  }).filter(Boolean);

  openGenericModal(`🎵 ${playlist?.name || 'Playlist'}`,
    `<div class="song-list">
      ${songs.length ? songs.map((s, i) => songItem(s, i, songs)).join('') : '<div class="empty-state">Playlist vide.</div>'}
    </div>`,
    null
  );
}

async function openAddToPlaylist(songId) {
  if (!userPlaylists.length) {
    showToast('Créez d\'abord une playlist', 'error');
    return;
  }
  openGenericModal('Ajouter à une playlist',
    `<div class="song-list">
      ${userPlaylists.map(p => `
        <div class="playlist-item" onclick="addSongToPlaylist('${songId}', '${p.id}')">
          <div class="playlist-icon"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
          <div class="playlist-info"><div class="playlist-name">${esc(p.name)}</div></div>
        </div>`).join('')}
    </div>`,
    null
  );
}

async function addSongToPlaylist(songId, playlistId) {
  const { error } = await supabase.from('playlist_songs').insert({
    playlist_id: playlistId, song_id: songId
  });
  if (error && error.code !== '23505') {
    showToast('Erreur', 'error');
  } else {
    showToast('✅ Ajouté à la playlist', 'success');
  }
  closeGenericModal();
}

// ─────────────────────────────────────────
// ➕ ADD CONTENT
// ─────────────────────────────────────────
function openAddArtist() {
  openGenericModal('Ajouter un artiste',
    `<input type="text" class="modal-input" id="add-artist-name" placeholder="Nom de l'artiste" />
     <input type="url" class="modal-input" id="add-artist-cover" placeholder="URL photo (optionnel)" />`,
    async () => {
      const name = document.getElementById('add-artist-name').value.trim();
      if (!name) { showToast('Entrez un nom', 'error'); return; }
      const cover_url = document.getElementById('add-artist-cover').value.trim() || null;
      const { data, error } = await supabase.from('artists').insert({ name, cover_url }).select().single();
      if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
      allArtists.push(data);
      renderHomePage();
      closeGenericModal();
      showToast('✅ Artiste ajouté !', 'success');
    }
  );
}

function openAddAlbum() {
  const artistOptions = allArtists.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  openGenericModal('Ajouter un album',
    `<select class="modal-input" id="add-album-artist">
       <option value="">-- Sélectionner un artiste --</option>
       ${artistOptions}
     </select>
     <input type="text" class="modal-input" id="add-album-title" placeholder="Titre de l'album" />
     <input type="url" class="modal-input" id="add-album-cover" placeholder="URL cover (optionnel)" />
     <input type="number" class="modal-input" id="add-album-year" placeholder="Année" min="1900" max="2099" />`,
    async () => {
      const artist_id = document.getElementById('add-album-artist').value;
      const title = document.getElementById('add-album-title').value.trim();
      const cover_url = document.getElementById('add-album-cover').value.trim() || null;
      const year = document.getElementById('add-album-year').value || null;
      if (!artist_id || !title) { showToast('Artiste et titre requis', 'error'); return; }
      const { data, error } = await supabase.from('albums')
        .insert({ artist_id, title, cover_url, year }).select('*, artists(name)').single();
      if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
      allAlbums.push(data);
      renderHomePage();
      closeGenericModal();
      showToast('✅ Album ajouté !', 'success');
    }
  );
}

function openAddSong() {
  const albumOptions = allAlbums.map(a => `<option value="${a.id}">${esc(a.title)} — ${esc(a.artists?.name || '')}</option>`).join('');
  openGenericModal('Ajouter un titre',
    `<select class="modal-input" id="add-song-album">
       <option value="">-- Sélectionner un album --</option>
       ${albumOptions}
     </select>
     <input type="text" class="modal-input" id="add-song-title" placeholder="Titre du son" />
     <input type="url" class="modal-input" id="add-song-url" placeholder="URL audio (mp3, etc.)" />
     <input type="url" class="modal-input" id="add-song-cover" placeholder="URL cover (si différent de l'album)" />
     <input type="number" class="modal-input" id="add-song-duration" placeholder="Durée en secondes" />
     <input type="text" class="modal-input" id="add-song-genre" placeholder="Genre musical" />`,
    async () => {
      const album_id = document.getElementById('add-song-album').value;
      const title = document.getElementById('add-song-title').value.trim();
      const audio_url = document.getElementById('add-song-url').value.trim() || null;
      const cover_url = document.getElementById('add-song-cover').value.trim() || null;
      const duration_sec = parseInt(document.getElementById('add-song-duration').value) || null;
      const genre = document.getElementById('add-song-genre').value.trim() || null;
      if (!album_id || !title) { showToast('Album et titre requis', 'error'); return; }
      const { data, error } = await supabase.from('songs')
        .insert({ album_id, title, audio_url, cover_url, duration_sec, genre })
        .select('*, albums(title, cover_url, artists(name))').single();
      if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
      allSongs.push(data);
      renderHomePage();
      closeGenericModal();
      showToast('✅ Titre ajouté !', 'success');
    }
  );
}

// ─────────────────────────────────────────
// 🪟 MODAL
// ─────────────────────────────────────────
let modalConfirmFn = null;

function openGenericModal(title, bodyHtml, onConfirm) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  const confirmBtn = document.getElementById('modal-confirm-btn');
  if (onConfirm) {
    modalConfirmFn = onConfirm;
    confirmBtn.style.display = '';
    confirmBtn.onclick = onConfirm;
  } else {
    confirmBtn.style.display = 'none';
    modalConfirmFn = null;
  }
  document.getElementById('generic-modal-overlay').classList.add('open');
}

function closeGenericModal(e) {
  if (!e || e.target === document.getElementById('generic-modal-overlay')) {
    document.getElementById('generic-modal-overlay').classList.remove('open');
  }
}

// ─────────────────────────────────────────
// 🧭 NAVIGATION
// ─────────────────────────────────────────
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('[data-page]').forEach(b => b.classList.remove('active'));

  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(b => b.classList.add('active'));

  if (page === 'library') renderPlaylists();
  if (page === 'profile') renderProfilePage();
}

// ─────────────────────────────────────────
// 🍞 TOAST
// ─────────────────────────────────────────
let toastTimeout;
function showToast(message, type = '') {
  const toast = document.getElementById('toast');
  clearTimeout(toastTimeout);
  toast.textContent = message;
  toast.className = `toast show${type ? ' ' + type : ''}`;
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─────────────────────────────────────────
// 🛠️ UTILS
// ─────────────────────────────────────────
function getCover(song) {
  return song.cover_url || song.albums?.cover_url || null;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
