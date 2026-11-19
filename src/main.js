// YANDEX MUSIC WORKSTATION CONTROLLER - REFINED & ACCESSIBLE
const { invoke } = window.__TAURI__ ? window.__TAURI__.core : { invoke: async () => null };

// State
let currentUser = null;
let currentStation = 'user:onyourwave';
let currentStationName = 'Моя волна';
let currentSourceMode = 'wave'; // 'wave' | 'favorites' | 'search'
let isShuffle = false;
let currentBatchId = '';
let currentTrack = null;
let currentTrackIndex = -1;
let trackQueue = [];
let isPlaying = false;
let playStartTime = 0;
let isSeeking = false;
let favoritesList = [];

// Dual-Engine Audio Architecture with Proxy for Seamless DJ Mixing
const audioA = document.getElementById('audio-engine');
const audioB = document.getElementById('audio-engine-b');
let currentDeck = 'A'; // 'A' or 'B'
function getActiveAudio() {
  return currentDeck === 'A' ? audioA : audioB;
}
function getInactiveAudio() {
  return currentDeck === 'A' ? audioB : audioA;
}
const audio = new Proxy({}, {
  get(target, prop) {
    const act = getActiveAudio();
    const val = act[prop];
    if (typeof val === 'function') {
      return val.bind(act);
    }
    return val;
  },
  set(target, prop, value) {
    const act = getActiveAudio();
    act[prop] = value;
    if (prop === 'volume') {
      if (audioA) audioA.volume = value;
      if (audioB) audioB.volume = value;
    }
    return true;
  }
});

// DJ Engine State & Controls
let isDjMode = localStorage.getItem('ymusic_dj_mode') !== 'false';
let djCrossfadeDuration = parseInt(localStorage.getItem('ymusic_dj_duration') || '5', 10);
let djBassSwap = localStorage.getItem('ymusic_dj_bass_swap') !== 'false';
let djStyle = localStorage.getItem('ymusic_dj_style') || 'auto';
let djEarlyMix = localStorage.getItem('ymusic_dj_early_mix') !== 'false';
let djDropToDrop = localStorage.getItem('ymusic_dj_drop_to_drop') !== 'false';
let djHarmonicMatch = localStorage.getItem('ymusic_dj_harmonic_match') !== 'false';
let djVocalFreeMix = localStorage.getItem('ymusic_dj_vocal_free') !== 'false';
let isTransitioning = false;
let preloadedTrack = null;
const btnDj = document.getElementById('btn-dj');
const btnDjDrop = document.getElementById('btn-dj-drop');
const btnLaunchWave = document.getElementById('btn-launch-wave');
const btnWaveByTrack = document.getElementById('btn-wave-by-track');

// Artist View Elements & State
const viewArtist = document.getElementById('view-artist');
const artistCoverImg = document.getElementById('artist-cover-img');
const artistNameHeading = document.getElementById('artist-name-heading');
const artistGenresTags = document.getElementById('artist-genres-tags');
const artistCountsStat = document.getElementById('artist-counts-stat');
const btnArtistPlayPopular = document.getElementById('btn-artist-play-popular');
const btnArtistWave = document.getElementById('btn-artist-wave');
const btnArtistShuffle = document.getElementById('btn-artist-shuffle');
const tabArtPopular = document.getElementById('tab-art-popular');
const tabArtRecent = document.getElementById('tab-art-recent');
const tabArtAlbums = document.getElementById('tab-art-albums');
const artistTracksContainer = document.getElementById('artist-tracks-container');
const artistAlbumsContainer = document.getElementById('artist-albums-container');

let currentArtistData = null;
let currentArtistTab = 'popular';
let artistRecentTracks = null;
const spectrumCanvas = document.getElementById('spectrum-canvas');
const specCtx = spectrumCanvas ? spectrumCanvas.getContext('2d') : null;

// GLOBAL SUSPENSION & LOW-POWER ENGINE (Zero GPU & Low CPU/RAM when minimized)
let isWindowSuspended = false;
let visAnimFrameId = null;
let triggerVisualizerLoop = null;

function setAppSuspended(suspended) {
  if (isWindowSuspended === suspended) return;
  isWindowSuspended = suspended;
  document.body.classList.toggle('app-minimized', suspended);

  if (suspended) {
    if (visAnimFrameId) {
      cancelAnimationFrame(visAnimFrameId);
      visAnimFrameId = null;
    }
    if (specCtx && spectrumCanvas) {
      specCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
    }
    try {
      if (window.__TAURI__?.core?.invoke) {
        window.__TAURI__.core.invoke('trim_memory').catch(() => {});
      }
    } catch (_) {}
  } else {
    if (!visAnimFrameId && typeof triggerVisualizerLoop === 'function') {
      triggerVisualizerLoop();
    }
  }
}
window.setAppSuspended = setAppSuspended;

// Native Tauri Window Visibility Event
if (window.__TAURI__?.event?.listen) {
  window.__TAURI__.event.listen('window-visibility', (event) => {
    setAppSuspended(!event.payload);
  });
}

document.addEventListener('visibilitychange', () => {
  setAppSuspended(document.hidden);
});

window.addEventListener('blur', () => {
  setAppSuspended(true);
});

window.addEventListener('focus', () => {
  setAppSuspended(false);
});

// Titlebar & User
const titlebarStationName = document.getElementById('titlebar-station-name');
const userAvatarImg = document.getElementById('user-avatar-img');
const userDisplayName = document.getElementById('user-display-name');
const winMinBtn = document.getElementById('win-min-btn');
const winMaxBtn = document.getElementById('win-max-btn');
const winCloseBtn = document.getElementById('win-close-btn');

// Stage & Track Identity
const heroStationLabel = document.getElementById('hero-station-label');
const trackCoverMain = document.getElementById('track-cover-main');
const trackTitleMain = document.getElementById('track-title-main');
const trackArtistMain = document.getElementById('track-artist-main');
const trackAlbumMain = document.getElementById('track-album-main');
const btnLikeMain = document.getElementById('btn-like-main');
const btnDislikeMain = document.getElementById('btn-dislike-main');

// Persistent Universal Dock Elements
const dockThumb = document.getElementById('dock-thumb');
const dockTitle = document.getElementById('dock-title');
const dockArtist = document.getElementById('dock-artist');
const dockLikeBtn = document.getElementById('dock-like-btn');

// Transport Controls
const btnShuffle = document.getElementById('btn-shuffle');
const btnPrev = document.getElementById('btn-prev');
const btnPlayPause = document.getElementById('btn-play-pause');
const playPauseIcon = document.getElementById('play-pause-icon');
const btnNext = document.getElementById('btn-next');
const timeCurrent = document.getElementById('time-current');
const timeTotal = document.getElementById('time-total');
const progressContainer = document.getElementById('progress-container');
const progressFill = document.getElementById('progress-fill');
const progressThumb = document.getElementById('progress-thumb');

// Master Volume
const volumeSlider = document.getElementById('volume-slider');
const volMuteBtn = document.getElementById('vol-mute-btn');
const volPercentText = document.getElementById('vol-percent-text');

// Queue & Views
const queueScrollDeck = document.getElementById('queue-scroll-deck');
const queueCounterTag = document.getElementById('queue-counter-tag');
const viewWave = document.getElementById('view-wave');
const viewSearch = document.getElementById('view-search');
const viewFavorites = document.getElementById('view-favorites');

// Search & Favorites
const searchInput = document.getElementById('search-input');
const searchClearBtn = document.getElementById('search-clear-btn');
const searchResultsList = document.getElementById('search-results-list');
const favoritesResultsList = document.getElementById('favorites-results-list');
const favCountBanner = document.getElementById('fav-count-banner');
const btnFavPlayAll = document.getElementById('btn-fav-play-all');
const btnFavShuffle = document.getElementById('btn-fav-shuffle');

// INITIALIZATION
window.addEventListener('DOMContentLoaded', async () => {
  setupWindowControls();
  setupSidebarNavigation();
  setupAudioEvents();
  setupSpectrumVisualizer();
  setupKeyboardShortcuts();
  setupFavoritesControls();
  setupArtistControls();
  setupTransportShuffle();
  setupEqualizerUI();
  setupSettingsModal();
  setupThemeController();
  setupFullscreenLyrics();

  window.addEventListener('click', () => ensureAudioContext(), { once: true });
  window.addEventListener('keydown', () => ensureAudioContext(), { once: true });

  try {
    const profile = await invoke('init_auth');
    if (profile) {
      handleAuthSuccess(profile);
      await loadWaveTracks(false);
    } else {
      openAuthModal(false);
    }
  } catch (err) {
    console.error('Init error:', err);
    openAuthModal(false);
  }

  const userPill = document.getElementById('user-pill');
  if (userPill) {
    userPill.addEventListener('click', () => {
      if (currentUser) {
        document.getElementById('btn-open-settings')?.click();
      } else {
        openAuthModal(false);
      }
    });
  }
});

// WINDOW TITLEBAR CONTROLS (TAURI COMMANDS)
function setupWindowControls() {
  if (winMinBtn) {
    winMinBtn.addEventListener('click', () => {
      setAppSuspended(true);
      invoke('win_minimize');
    });
  }
  if (winMaxBtn) {
    winMaxBtn.addEventListener('click', () => invoke('win_toggle_maximize'));
  }
  if (winCloseBtn) {
    winCloseBtn.addEventListener('click', () => invoke('win_close'));
  }
}

// SETUP FULLSCREEN SPOTIFY-STYLE LYRICS CONTROLS
function setupFullscreenLyrics() {
  const btnMainLyrics = document.getElementById('btn-main-lyrics');
  const btnFullscreenLyrics = document.getElementById('btn-fullscreen-lyrics');
  const btnDockLyrics = document.getElementById('btn-dock-lyrics');
  const btnCloseFsLyrics = document.getElementById('btn-close-fs-lyrics');
  const fsBtnPlay = document.getElementById('fs-btn-play');
  const fsBtnPrev = document.getElementById('fs-btn-prev');
  const fsBtnNext = document.getElementById('fs-btn-next');
  const fsProgressContainer = document.getElementById('fs-progress-container');
  const fsLyricsStage = document.getElementById('fs-lyrics-stage');

  if (btnMainLyrics) {
    btnMainLyrics.addEventListener('click', openFullscreenLyrics);
  }
  if (btnFullscreenLyrics) {
    btnFullscreenLyrics.addEventListener('click', openFullscreenLyrics);
  }
  if (btnDockLyrics) {
    btnDockLyrics.addEventListener('click', toggleFullscreenLyrics);
  }
  if (btnCloseFsLyrics) {
    btnCloseFsLyrics.addEventListener('click', closeFullscreenLyrics);
  }
  if (fsBtnPlay) {
    fsBtnPlay.addEventListener('click', togglePlayPause);
  }
  if (fsBtnPrev) {
    fsBtnPrev.addEventListener('click', playPrevTrack);
  }
  if (fsBtnNext) {
    fsBtnNext.addEventListener('click', () => {
      if (currentSourceMode === 'wave') sendFeedback('skip');
      playNextTrack();
    });
  }
  if (fsProgressContainer) {
    fsProgressContainer.addEventListener('click', (e) => {
      const rect = fsProgressContainer.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const act = getActiveAudio();
      if (act && !isNaN(act.duration)) {
        act.currentTime = pct * act.duration;
      }
    });
  }
  if (fsLyricsStage) {
    fsLyricsStage.addEventListener('wheel', () => {
      fsUserManualScrollUntil = Date.now() + 3500;
    }, { passive: true });
    fsLyricsStage.addEventListener('touchstart', () => {
      fsUserManualScrollUntil = Date.now() + 3500;
    }, { passive: true });
  }
}

// AUTHENTICATION & LOGIN WORKFLOW
function openAuthModal(canClose = false) {
  const modal = document.getElementById('token-modal');
  const closeBtn = document.getElementById('auth-modal-close-btn');
  const authStatus = document.getElementById('auth-status-indicator');
  if (authStatus) authStatus.style.display = 'none';
  if (closeBtn) closeBtn.style.display = canClose ? 'flex' : 'none';
  if (modal) modal.style.display = 'flex';
}
window.openAuthModal = openAuthModal;

function handleAuthSuccess(profile) {
  currentUser = profile;
  userDisplayName.textContent = profile.display_name || profile.login;
  if (profile.avatar_url) {
    userAvatarImg.src = profile.avatar_url;
  }
  syncSettingsUser();
  const modal = document.getElementById('token-modal');
  if (modal) modal.style.display = 'none';
  const authStatus = document.getElementById('auth-status-indicator');
  if (authStatus) authStatus.style.display = 'none';
}

// Native Tauri event for token intercepted from Yandex Passport OAuth window
if (window.__TAURI__?.event?.listen) {
  window.__TAURI__.event.listen('auth-token-received', async (event) => {
    const token = event.payload;
    if (!token) return;
    try {
      const authStatus = document.getElementById('auth-status-indicator');
      if (authStatus) {
        authStatus.style.display = 'flex';
        const txt = authStatus.querySelector('span');
        if (txt) txt.textContent = 'Вход выполнен! Загрузка профиля...';
      }
      const profile = await invoke('login_with_token', { token });
      handleAuthSuccess(profile);
      await loadWaveTracks(true);
    } catch (err) {
      alert('Ошибка авторизации: ' + err);
      const authStatus = document.getElementById('auth-status-indicator');
      if (authStatus) authStatus.style.display = 'none';
    }
  });
}

// Button: Official "Войти через Яндекс ID"
const btnOAuthLogin = document.getElementById('btn-oauth-login');
if (btnOAuthLogin) {
  btnOAuthLogin.addEventListener('click', async () => {
    try {
      const authStatus = document.getElementById('auth-status-indicator');
      if (authStatus) {
        authStatus.style.display = 'flex';
        const txt = authStatus.querySelector('span');
        if (txt) txt.textContent = 'Окно входа открыто. Завершите авторизацию в Яндекс...';
      }
      await invoke('open_login_window');
    } catch (err) {
      alert('Не удалось открыть окно входа: ' + err);
      const authStatus = document.getElementById('auth-status-indicator');
      if (authStatus) authStatus.style.display = 'none';
    }
  });
}

// Close Auth Modal if allowed
const authModalCloseBtn = document.getElementById('auth-modal-close-btn');
if (authModalCloseBtn) {
  authModalCloseBtn.addEventListener('click', () => {
    const modal = document.getElementById('token-modal');
    if (modal) modal.style.display = 'none';
  });
}

// Toggle manual token accordion
const btnToggleManualToken = document.getElementById('btn-toggle-manual-token');
const manualTokenContainer = document.getElementById('manual-token-container');
if (btnToggleManualToken && manualTokenContainer) {
  btnToggleManualToken.addEventListener('click', () => {
    const isShown = manualTokenContainer.style.display !== 'none';
    manualTokenContainer.style.display = isShown ? 'none' : 'block';
    btnToggleManualToken.textContent = isShown 
      ? 'У меня есть токен (ручной ввод) ▼' 
      : 'Скрыть ручной ввод ▲';
    if (!isShown) {
      const inp = document.getElementById('modal-token-input');
      if (inp) inp.focus();
    }
  });
}

// Manual token submit button
const modalSubmitBtn = document.getElementById('modal-submit-btn');
if (modalSubmitBtn) {
  modalSubmitBtn.addEventListener('click', async () => {
    const token = document.getElementById('modal-token-input')?.value;
    if (!token) return;
    try {
      const profile = await invoke('login_with_token', { token });
      handleAuthSuccess(profile);
      await loadWaveTracks(true);
    } catch (err) {
      alert('Ошибка входа: ' + err);
    }
  });
}

// REORGANIZED SIDEBAR NAVIGATION
function setupSidebarNavigation() {
  // Menu items (Главная + Коллекция)
  document.querySelectorAll('.menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
      document.querySelectorAll('.vibe-pill').forEach(v => v.classList.remove('active'));
      item.classList.add('active');

      const tab = item.dataset.tab;
      switchTab(tab);

      // Station items (Моя волна, Открытия, Хиты) immediately switch and load tracks
      if (item.dataset.station) {
        const isDifferentStation = (currentStation !== item.dataset.station) || (currentSourceMode !== 'wave');
        currentSourceMode = 'wave';
        currentStation = item.dataset.station;
        currentStationName = item.dataset.name;
        updateStationDisplay();

        if (isDifferentStation || !isPlaying) {
          await loadWaveTracks(true);
        }
      }
    });
  });

  // Vibe / Mood pills
  document.querySelectorAll('.vibe-pill').forEach(pill => {
    pill.addEventListener('click', async () => {
      document.querySelectorAll('.vibe-pill').forEach(v => v.classList.remove('active'));
      document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
      pill.classList.add('active');

      currentSourceMode = 'wave';
      switchTab('wave');

      currentStation = pill.dataset.station;
      currentStationName = pill.dataset.name;
      updateStationDisplay();

      await loadWaveTracks(true);
    });
  });

  // Dedicated Button to explicitly launch "Моя волна"
  if (btnLaunchWave) {
    btnLaunchWave.addEventListener('click', async () => {
      currentSourceMode = 'wave';
      currentStation = 'user:onyourwave';
      currentStationName = 'Моя волна';
      updateStationDisplay();
      await loadWaveTracks(true);
    });
  }
}

function switchTab(tab) {
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));

  // Toggle in-main-view body class so bottom dock track info is ONLY visible outside the main menu
  const isMain = (tab === 'wave');
  document.body.classList.toggle('in-main-view', isMain);

  if (tab === 'wave') {
    currentSourceMode = 'wave';
    viewWave.classList.add('active');
    updateStationDisplay();
  } else if (tab === 'search') {
    currentSourceMode = 'search';
    viewSearch.classList.add('active');
    updateStationDisplay();
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 60);
    }
  } else if (tab === 'favorites') {
    currentSourceMode = 'favorites';
    viewFavorites.classList.add('active');
    updateStationDisplay();
    loadFavorites();
  } else if (tab === 'artist') {
    currentSourceMode = 'artist';
    if (viewArtist) viewArtist.classList.add('active');
    updateStationDisplay();
  }
}

function updateStationDisplay() {
  const label = currentSourceMode === 'favorites' 
    ? 'ЛЮБИМЫЕ ТРЕКИ' 
    : (currentSourceMode === 'search' ? 'ПОИСК' : currentStationName.toUpperCase());

  if (titlebarStationName) {
    titlebarStationName.textContent = label;
  }
  if (heroStationLabel) {
    heroStationLabel.textContent = `ИСТОЧНИК: ${label.toUpperCase()}`;
  }
}

// ROTOR LOADER
async function loadWaveTracks(autoPlayFirst = false) {
  try {
    currentSourceMode = 'wave';
    updateStationDisplay();
    const res = await invoke('get_my_wave', { stationId: currentStation });
    currentBatchId = res.batch_id;
    trackQueue = res.tracks;
    renderQueue();

    if (autoPlayFirst && trackQueue.length > 0) {
      playTrackAtIndex(0, 'next');
    } else if (currentTrackIndex === -1 && trackQueue.length > 0) {
      setTrackPreview(trackQueue[0], 'next');
    }
  } catch (err) {
    console.error('Wave load error:', err);
  }
}

function renderQueue() {
  if (queueCounterTag) queueCounterTag.textContent = trackQueue.length;
  if (!queueScrollDeck) return;
  if (trackQueue.length === 0) {
    queueScrollDeck.innerHTML = '<div class="empty-state-notice">Очередь пуста</div>';
    return;
  }

  queueScrollDeck.innerHTML = trackQueue.map((t, idx) => {
    const isCur = idx === currentTrackIndex;
    const isNext = idx === currentTrackIndex + 1;
    let matchPill = '';
    if (isNext && isDjMode && djHarmonicMatch && currentTrack) {
      const matchScore = calculateDjMatchScore(currentTrack, t);
      if (matchScore >= 60) {
        matchPill = `<div class="q-match-pill" title="Идеальная гармония по BPM и тональности">⚡ Сведение ${matchScore}%</div>`;
      }
    }
    return `
      <div class="queue-card-row ${isCur ? 'active' : ''}" data-idx="${idx}">
        <img src="${t.cover_url || 'assets/default-cover.svg'}" class="q-cover" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.src='assets/default-cover.svg'" />
        <div class="q-info">
          <div class="q-title">${escapeHtml(t.title)}</div>
          <div class="q-artist">${escapeHtml(t.artists.join(', '))}</div>
          ${matchPill}
        </div>
        ${isCur ? `
          <div class="mini-equalizer" title="Сейчас играет">
            <span class="mini-eq-bar"></span>
            <span class="mini-eq-bar"></span>
            <span class="mini-eq-bar"></span>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');

  queueScrollDeck.querySelectorAll('.queue-card-row').forEach(row => {
    row.addEventListener('click', () => {
      const idx = parseInt(row.dataset.idx, 10);
      if (idx === currentTrackIndex) {
        togglePlayPause();
        return;
      }
      const dir = idx > currentTrackIndex ? 'next' : 'prev';
      playTrackAtIndex(idx, dir);
    });
  });

  const activeRow = queueScrollDeck.querySelector('.queue-card-row.active');
  if (activeRow) {
    activeRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function setTrackPreview(track, direction = 'next') {
  if (!track) return;
  const cover = track.cover_url || 'assets/default-cover.svg';

  const trackCoverBack = document.getElementById('track-cover-back');
  const coverSheen = document.getElementById('cover-sheen');

  // Preserve previous cover in back layer so the new cover liquidly washes/pours over it
  if (trackCoverBack && trackCoverMain && trackCoverMain.src && trackCoverMain.src !== cover) {
    trackCoverBack.src = trackCoverMain.src;
  }

  trackCoverMain.src = cover;
  trackTitleMain.textContent = track.title;

  // Shimmering iridescent text wave on title ("переливание букв названия")
  trackTitleMain.classList.remove('anim-title-shimmer-next', 'anim-title-shimmer-prev');
  void trackTitleMain.offsetWidth;
  trackTitleMain.classList.add(direction === 'prev' ? 'anim-title-shimmer-prev' : 'anim-title-shimmer-next');
  trackTitleMain.addEventListener('animationend', () => {
    trackTitleMain.classList.remove('anim-title-shimmer-next', 'anim-title-shimmer-prev');
  }, { once: true });

  // Liquid light sheen sweep across the cover
  if (coverSheen) {
    coverSheen.classList.remove('sheen-sweep-next', 'sheen-sweep-prev');
    void coverSheen.offsetWidth;
    coverSheen.classList.add(direction === 'prev' ? 'sheen-sweep-prev' : 'sheen-sweep-next');
  }

  // Directional liquid morph animation on cover
  trackCoverMain.classList.remove('anim-cover-next', 'anim-cover-prev');
  void trackCoverMain.offsetWidth;
  trackCoverMain.classList.add(direction === 'prev' ? 'anim-cover-prev' : 'anim-cover-next');
  
  if (typeof onTrackChangedForTheme === 'function') {
    onTrackChangedForTheme(cover, track.title);
  }
  
  // Interactive Clickable Artist Links
  trackArtistMain.innerHTML = '';
  track.artists.forEach((artName, i) => {
    const span = document.createElement('span');
    span.textContent = artName;
    const artId = track.artist_ids?.[i];
    if (artId) {
      span.className = 'artist-clickable-link';
      span.title = `Перейти к артисту: ${artName}`;
      span.addEventListener('click', (e) => {
        e.stopPropagation();
        openArtistPage(artId, artName);
      });
    }
    trackArtistMain.appendChild(span);
    if (i < track.artists.length - 1) {
      trackArtistMain.appendChild(document.createTextNode(', '));
    }
  });

  trackAlbumMain.textContent = track.album ? `АЛЬБОМ: ${track.album.toUpperCase()}` : '';
  timeTotal.textContent = formatTime(track.duration_ms / 1000);

  // Sync Universal Bottom Dock
  if (dockThumb) {
    dockThumb.src = cover;
    dockThumb.classList.remove('anim-dock-thumb-next', 'anim-dock-thumb-prev');
    void dockThumb.offsetWidth; // force reflow
    dockThumb.classList.add(direction === 'prev' ? 'anim-dock-thumb-prev' : 'anim-dock-thumb-next');
  }
  if (dockTitle) dockTitle.textContent = track.title;
  if (dockArtist) {
    dockArtist.innerHTML = '';
    track.artists.forEach((artName, i) => {
      const span = document.createElement('span');
      span.textContent = artName;
      const artId = track.artist_ids?.[i];
      if (artId) {
        span.className = 'artist-clickable-link';
        span.title = `Перейти к артисту: ${artName}`;
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          openArtistPage(artId, artName);
        });
      }
      dockArtist.appendChild(span);
      if (i < track.artists.length - 1) {
        dockArtist.appendChild(document.createTextNode(', '));
      }
    });
  }

  const dockMeta = document.getElementById('dock-meta');
  if (dockMeta) {
    dockMeta.classList.remove('anim-dock-meta-next', 'anim-dock-meta-prev');
    void dockMeta.offsetWidth; // force reflow
    dockMeta.classList.add(direction === 'prev' ? 'anim-dock-meta-prev' : 'anim-dock-meta-next');
  }

  // Directional liquid typography slide-in for info deck
  const infoDeck = document.querySelector('.track-info-deck');
  if (infoDeck) {
    infoDeck.classList.remove('anim-text-next', 'anim-text-prev', 'track-anim-enter');
    void infoDeck.offsetWidth;
    infoDeck.classList.add(direction === 'prev' ? 'anim-text-prev' : 'anim-text-next');
  }

  // Update MediaSession & Windows SMTC Overlay
  updateMediaSession(track);

  // Load and sync animated live lyrics for this track
  loadLyricsForTrack(track);
}

// LIVE ANIMATED KARAOKE LYRICS ENGINE (INLINE & SPOTIFY FULLSCREEN)
let currentLyrics = null;
let currentActiveLyricIdx = -1;
let lyricsLoadingTrackId = null;
let isFsLyricsOpen = false;
let fsUserManualScrollUntil = 0;
let fsLyricsAnimId = null;

function startFsLyricsLoop() {
  if (fsLyricsAnimId) return;
  function tick() {
    if (!isFsLyricsOpen) {
      fsLyricsAnimId = null;
      return;
    }
    const act = getActiveAudio();
    if (act && isPlaying && !act.paused) {
      updateLyricsHighlight(act.currentTime);
    }
    fsLyricsAnimId = requestAnimationFrame(tick);
  }
  fsLyricsAnimId = requestAnimationFrame(tick);
}

function stopFsLyricsLoop() {
  if (fsLyricsAnimId) {
    cancelAnimationFrame(fsLyricsAnimId);
    fsLyricsAnimId = null;
  }
}

function openFullscreenLyrics() {
  const overlay = document.getElementById('fullscreen-lyrics-overlay');
  const btnDock = document.getElementById('btn-dock-lyrics');
  if (!overlay) return;
  isFsLyricsOpen = true;
  overlay.style.display = 'flex';
  if (btnDock) btnDock.classList.add('active');

  updateFullscreenLyricsMeta();
  const act = getActiveAudio();
  if (act) updateLyricsHighlight(act.currentTime);
  startFsLyricsLoop();
}

function closeFullscreenLyrics() {
  const overlay = document.getElementById('fullscreen-lyrics-overlay');
  const btnDock = document.getElementById('btn-dock-lyrics');
  if (!overlay) return;
  isFsLyricsOpen = false;
  overlay.style.display = 'none';
  if (btnDock) btnDock.classList.remove('active');
  stopFsLyricsLoop();
}

function toggleFullscreenLyrics() {
  if (isFsLyricsOpen) {
    closeFullscreenLyrics();
  } else {
    openFullscreenLyrics();
  }
}

function updateFullscreenLyricsMeta() {
  if (!currentTrack) return;
  const fsCover = document.getElementById('fs-lyrics-cover');
  const fsTitle = document.getElementById('fs-lyrics-title');
  const fsArtist = document.getElementById('fs-lyrics-artist');
  const fsPlayIcon = document.getElementById('fs-play-icon');
  const fsTot = document.getElementById('fs-time-total');
  const act = getActiveAudio();

  if (fsCover) {
    fsCover.src = currentTrack.cover_url || 'assets/default-cover.svg';
  }
  if (fsTitle) fsTitle.textContent = currentTrack.title || 'Без названия';
  if (fsArtist) fsArtist.textContent = currentTrack.artists?.join(', ') || '';

  if (fsPlayIcon) {
    fsPlayIcon.innerHTML = isPlaying
      ? '<rect x="6" y="4" width="3.5" height="16" rx="1.5"></rect><rect x="14.5" y="4" width="3.5" height="16" rx="1.5"></rect>'
      : '<polygon points="8 5 19 12 8 19"></polygon>';
  }

  if (fsTot && act && !isNaN(act.duration) && act.duration > 0) {
    fsTot.textContent = formatTime(act.duration);
  }
}

async function loadLyricsForTrack(track) {
  if (!track) return;
  const lyricsLinesDeck = document.getElementById('lyrics-lines-deck');
  const lyricsSyncPill = document.getElementById('lyrics-sync-pill');
  const fsScroller = document.getElementById('fs-lyrics-scroller');

  lyricsLoadingTrackId = track.id;
  currentLyrics = null;
  currentActiveLyricIdx = -1;
  if (lyricsLinesDeck) lyricsLinesDeck.innerHTML = '<div class="lyrics-placeholder">Поиск и загрузка текста песни...</div>';
  if (fsScroller) fsScroller.innerHTML = '<div class="fs-lyrics-placeholder">Поиск и загрузка текста песни...</div>';

  if (lyricsSyncPill) {
    lyricsSyncPill.textContent = 'ПОИСК...';
    lyricsSyncPill.className = 'lyrics-sync-pill plain';
  }

  try {
    const artist = track.artists?.join(', ') || '';
    const title = track.title || '';
    console.log(`[Lyrics] Loading lyrics for "${artist} - ${title}" (track ID: ${track.id})`);
    const data = await invoke('get_lyrics', {
      trackId: String(track.id),
      artist,
      title
    });
    console.log(`[Lyrics] Fetched lyrics:`, data);

    if (lyricsLoadingTrackId !== track.id) return; // Ignore stale track response

    currentLyrics = data;
    if (!data.lines || data.lines.length === 0) {
      if (lyricsLinesDeck) lyricsLinesDeck.innerHTML = '<div class="lyrics-placeholder">Текст песни не найден</div>';
      if (fsScroller) fsScroller.innerHTML = '<div class="fs-lyrics-placeholder">Текст для этого трека пока не найден</div>';
      if (lyricsSyncPill) {
        lyricsSyncPill.textContent = 'НЕТ ТЕКСТА';
        lyricsSyncPill.className = 'lyrics-sync-pill plain';
      }
      updateFullscreenLyricsMeta();
      return;
    }

    if (lyricsSyncPill) {
      if (data.synced) {
        lyricsSyncPill.textContent = 'СИНХРОНИЗИРОВАН';
        lyricsSyncPill.className = 'lyrics-sync-pill';
      } else {
        lyricsSyncPill.textContent = 'ТЕКСТ';
        lyricsSyncPill.className = 'lyrics-sync-pill plain';
      }
    }

    // 1. Render Inline Lyrics if present
    if (lyricsLinesDeck) {
      lyricsLinesDeck.innerHTML = data.lines.map((line, idx) => {
        return `<div class="lyric-line" data-time="${line.time}" data-index="${idx}">${escapeHtml(line.text)}</div>`;
      }).join('');

      lyricsLinesDeck.querySelectorAll('.lyric-line').forEach(el => {
        el.addEventListener('click', () => {
          const lineTime = parseFloat(el.dataset.time);
          if (!isNaN(lineTime)) {
            const act = getActiveAudio();
            if (act) act.currentTime = lineTime;
          }
        });
      });
    }

    // Helper: Wrap text into word containers and individual characters for wrapped-line immune karaoke
    function formatLyricLineToWordsAndChars(text) {
      if (!text) return { html: '', count: 0 };
      const parts = text.split(/(\s+)/);
      let charCounter = 0;
      const html = parts.map(part => {
        if (!part) return '';
        if (/^\s+$/.test(part)) {
          return ' ';
        }
        const charsHtml = Array.from(part).map(ch => {
          const ci = charCounter++;
          return `<span class="char" data-ci="${ci}">${escapeHtml(ch)}</span>`;
        }).join('');
        return `<span class="lyric-word">${charsHtml}</span>`;
      }).join('');
      return { html, count: charCounter };
    }

    // 2. Render Fullscreen Spotify-Style Lyrics
    if (fsScroller) {
      fsScroller.innerHTML = data.lines.map((line, idx) => {
        const parsed = formatLyricLineToWordsAndChars(line.text);
        return `<div class="fs-lyric-line" data-time="${line.time}" data-index="${idx}" data-total-chars="${parsed.count}">${parsed.html}</div>`;
      }).join('');

      fsScroller.querySelectorAll('.fs-lyric-line').forEach(el => {
        el.addEventListener('click', () => {
          const lineTime = parseFloat(el.dataset.time);
          if (!isNaN(lineTime)) {
            const act = getActiveAudio();
            if (act) act.currentTime = lineTime;
            fsUserManualScrollUntil = 0; // instantly snap back to tracking
          }
        });
      });
    }

    updateFullscreenLyricsMeta();

    const act = getActiveAudio();
    if (act) updateLyricsHighlight(act.currentTime);

  } catch (err) {
    console.warn('[Lyrics] Fetch error:', err);
    if (lyricsLoadingTrackId !== track.id) return;
    if (lyricsLinesDeck) lyricsLinesDeck.innerHTML = '<div class="lyrics-placeholder">Текст для этого трека пока не найден</div>';
    if (fsScroller) fsScroller.innerHTML = '<div class="fs-lyrics-placeholder">Текст для этого трека пока не найден</div>';
    if (lyricsSyncPill) {
      lyricsSyncPill.textContent = 'НЕТ ТЕКСТА';
      lyricsSyncPill.className = 'lyrics-sync-pill plain';
    }
    updateFullscreenLyricsMeta();
  }
}

function updateLyricsHighlight(curTime) {
  if (isWindowSuspended || document.hidden) return;
  if (!currentLyrics || !currentLyrics.lines || currentLyrics.lines.length === 0) return;

  const lines = currentLyrics.lines;
  let activeIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (curTime >= lines[i].time) {
      activeIdx = i;
    } else {
      break;
    }
  }

  const act = getActiveAudio();

  // 1. Fullscreen Spotify Lyrics View Scroller
  if (isFsLyricsOpen) {
    const fsStage = document.getElementById('fs-lyrics-stage');
    const fsScroller = document.getElementById('fs-lyrics-scroller');
    const fsLines = fsScroller?.querySelectorAll('.fs-lyric-line');

    if (fsLines && fsLines.length > 0) {
      // Calculate smooth character sweep progress for active singing line
      let p = 0;
      if (activeIdx >= 0 && activeIdx < lines.length) {
        const curLine = lines[activeIdx];
        const nextLine = lines[activeIdx + 1];
        const lineStart = curLine.time;
        // Natural line duration: characters * 0.18s, bounded between 1.8s and interval to next line
        const naturalDur = Math.max(1.8, (curLine.text || '').length * 0.18);
        const interval = nextLine ? Math.max(0.6, nextLine.time - lineStart) : naturalDur;
        const effectiveDur = Math.max(0.6, Math.min(interval, Math.max(1.8, naturalDur)));
        p = Math.min(1, Math.max(0, (curTime - lineStart) / effectiveDur));
      }

      fsLines.forEach((el, i) => {
        if (i === activeIdx) {
          if (!el.classList.contains('active')) {
            el.classList.add('active');
            el.classList.remove('past');
            el._lastFilledIndex = -1;
          }

          const totalChars = parseInt(el.dataset.totalChars || '0', 10);
          if (totalChars > 0) {
            const currentPos = p * totalChars;
            const filledIndex = Math.min(totalChars, Math.floor(currentPos));

            if (el._lastFilledIndex !== filledIndex) {
              el._lastFilledIndex = filledIndex;
              if (!el._chars) {
                el._chars = el.querySelectorAll('.char');
              }
              const chars = el._chars;
              for (let c = 0; c < chars.length; c++) {
                if (c < filledIndex) {
                  chars[c].className = 'char char-active';
                } else if (c === filledIndex && p < 1) {
                  chars[c].className = 'char char-active char-current';
                } else {
                  chars[c].className = 'char';
                }
              }
            }
          }
        } else if (i < activeIdx) {
          if (!el.classList.contains('past')) {
            el.classList.remove('active');
            el.classList.add('past');
            el._lastFilledIndex = -1;
          }
        } else {
          if (el.classList.contains('active') || el.classList.contains('past')) {
            el.classList.remove('active');
            el.classList.remove('past');
            el._lastFilledIndex = -1;
            if (el._chars) {
              for (let c = 0; c < el._chars.length; c++) {
                el._chars[c].className = 'char';
              }
            }
          }
        }
      });

      if (Date.now() > fsUserManualScrollUntil && fsStage && fsScroller && activeIdx >= 0) {
        const activeEl = fsLines[activeIdx];
        if (activeEl) {
          const targetTop = activeEl.offsetTop - (fsStage.clientHeight / 2) + (activeEl.clientHeight / 2);
          fsScroller.style.transform = `translate3d(0, ${-Math.max(0, targetTop)}px, 0)`;
        }
      }
    }

    // Sync fullscreen scrubber & time
    const fsCur = document.getElementById('fs-time-current');
    const fsTot = document.getElementById('fs-time-total');
    const fsProg = document.getElementById('fs-progress-fill');
    if (fsCur) fsCur.textContent = formatTime(curTime);
    if (act && !isNaN(act.duration) && act.duration > 0) {
      if (fsTot) fsTot.textContent = formatTime(act.duration);
      if (fsProg) fsProg.style.width = `${(curTime / act.duration) * 100}%`;
    }
  }

  // 2. Inline Lyrics Viewport
  if (activeIdx !== currentActiveLyricIdx && activeIdx >= 0) {
    currentActiveLyricIdx = activeIdx;
    const viewport = document.getElementById('lyrics-viewport');
    const lineEls = viewport?.querySelectorAll('.lyric-line');
    if (!lineEls || lineEls.length === 0) return;

    lineEls.forEach((el, i) => {
      el.classList.toggle('active', i === activeIdx);
    });

    const activeEl = lineEls[activeIdx];
    if (activeEl && viewport) {
      const topOffset = activeEl.offsetTop - (viewport.clientHeight / 2) + (activeEl.clientHeight / 2);
      viewport.scrollTo({ top: Math.max(0, topOffset), behavior: 'smooth' });
    }
  }
}

// WINDOWS MEDIA OVERLAY & MEDIASESSION FIX
function updateMediaSession(track) {
  if (!track) return;
  const fullTitle = `${track.title} — ${track.artists.join(', ')}`;
  document.title = fullTitle;
  if (audio) {
    audio.title = fullTitle;
  }

  if ('mediaSession' in navigator) {
    const artworkList = [];
    if (track.cover_url && !track.cover_url.includes('default-cover')) {
      artworkList.push(
        { src: track.cover_url, sizes: '512x512', type: 'image/jpeg' },
        { src: track.cover_url, sizes: '300x300', type: 'image/jpeg' },
        { src: track.cover_url, sizes: '128x128', type: 'image/jpeg' }
      );
    }

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artists.join(', '),
      album: track.album || 'Яндекс Музыка',
      artwork: artworkList
    });

    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

    try {
      navigator.mediaSession.setActionHandler('play', togglePlayPause);
      navigator.mediaSession.setActionHandler('pause', togglePlayPause);
      navigator.mediaSession.setActionHandler('previoustrack', playPrevTrack);
      navigator.mediaSession.setActionHandler('nexttrack', playNextTrack);
      navigator.mediaSession.setActionHandler('seekto', details => {
        if (details.seekTime !== undefined && !isNaN(audio.duration)) {
          audio.currentTime = details.seekTime;
        }
      });
    } catch (e) {
      // Ignore unsupported action handler errors
    }
  }
}

// Variables for DJ Transitions & Tempo Sync
let transitionTimer = null;
let tempoRampInterval = null;

function getTrackNormalizedGain(track) {
  if (!track || typeof track.lufs !== 'number') return 1.0;
  // Professional DJ streaming loudness target (-9.0 LUFS)
  const deltaDb = -9.0 - track.lufs;
  return Math.max(0.67, Math.min(1.38, Math.pow(10, deltaDb / 20)));
}

function resetDeckEq(deck) {
  if (!audioCtx) return;
  const isoLow = deck === 'A' ? isoLowA : isoLowB;
  const isoMid = deck === 'A' ? isoMidA : isoMidB;
  const isoHigh = deck === 'A' ? isoHighA : isoHighB;
  const hpf = deck === 'A' ? filterHpfA : filterHpfB;
  const lpf = deck === 'A' ? filterLpfA : filterLpfB;
  const send = deck === 'A' ? djDelaySendA : djDelaySendB;
  const now = audioCtx.currentTime;
  try {
    if (isoLow) {
      isoLow.gain.cancelScheduledValues(now);
      isoLow.gain.setValueAtTime(0, now);
    }
    if (isoMid) {
      isoMid.gain.cancelScheduledValues(now);
      isoMid.gain.setValueAtTime(0, now);
    }
    if (isoHigh) {
      isoHigh.gain.cancelScheduledValues(now);
      isoHigh.gain.setValueAtTime(0, now);
    }
    if (hpf) {
      hpf.frequency.cancelScheduledValues(now);
      hpf.frequency.setValueAtTime(20, now);
      hpf.Q.setValueAtTime(1.0, now);
    }
    if (lpf) {
      lpf.frequency.cancelScheduledValues(now);
      lpf.frequency.setValueAtTime(22000, now);
      lpf.Q.setValueAtTime(1.0, now);
    }
    if (send) {
      send.gain.cancelScheduledValues(now);
      send.gain.setValueAtTime(0, now);
    }
  } catch (e) {}
}

// PLAY TRACK (With directional animation, DJ seamless transitions, and deduplication)
async function playTrackAtIndex(idx, direction = 'next') {
  if (idx < 0 || idx >= trackQueue.length) return;

  ensureAudioContext();

  // Cancel any in-flight DJ transition and restore clean audio state immediately
  if (transitionTimer) {
    clearTimeout(transitionTimer);
    transitionTimer = null;
  }
  if (tempoRampInterval) {
    clearInterval(tempoRampInterval);
    tempoRampInterval = null;
  }
  isTransitioning = false;
  if (btnDj) btnDj.classList.remove('is-mixing');

  const outDeck = getActiveAudio();
  try {
    outDeck.pause();
    outDeck.playbackRate = 1.0;
  } catch (e) {}

  resetDeckEq('A');
  resetDeckEq('B');

  if (currentTrack && isPlaying && currentSourceMode === 'wave') {
    sendFeedback('skip');
  }

  currentTrackIndex = idx;
  currentTrack = trackQueue[idx];
  setTrackPreview(currentTrack, direction);
  updateLikeState(currentTrack.liked);
  renderQueue();
  updateFavoritesActiveRow();
  updateArtistActiveRow();
  updateMediaSession(currentTrack);

  // If the target track was preloaded into inactive deck, switch deck immediately for 0ms delay
  const inDeck = getInactiveAudio();
  const isPreloaded = Boolean(preloadedTrack && preloadedTrack.id === currentTrack.id && inDeck.src);

  if (isPreloaded) {
    currentDeck = currentDeck === 'A' ? 'B' : 'A';
    preloadedTrack = null;
  }

  const act = getActiveAudio();
  const actGain = currentDeck === 'A' ? deckGainA : deckGainB;
  const inactGain = currentDeck === 'A' ? deckGainB : deckGainA;

  if (audioCtx) {
    const targetGain = getTrackNormalizedGain(currentTrack);
    if (actGain) {
      actGain.gain.cancelScheduledValues(audioCtx.currentTime);
      actGain.gain.setValueAtTime(targetGain, audioCtx.currentTime);
    }
    if (inactGain) {
      inactGain.gain.cancelScheduledValues(audioCtx.currentTime);
      inactGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
    }
  }

  try {
    if (!isPreloaded || !act.src) {
      const streamUrl = await invoke('get_stream_url', { trackId: currentTrack.id });
      act.src = streamUrl;
    }

    act.playbackRate = 1.0;
    // Silence trimming: jump straight to music start if available
    if (currentTrack.fade && typeof currentTrack.fade.in_start === 'number' && currentTrack.fade.in_start > 0.05 && currentTrack.fade.in_start < 4.0) {
      act.currentTime = currentTrack.fade.in_start;
    } else {
      act.currentTime = 0;
    }

    await act.play();
    isPlaying = true;
    updatePlayState(true);
    if (currentSourceMode === 'wave') {
      sendFeedback('trackStarted');
    }
    playStartTime = Date.now();

    if (currentSourceMode === 'wave' && trackQueue.length - idx <= 2) {
      prefetchNextBatch();
    }
  } catch (err) {
    console.error('Play error:', err);
    playNextTrack();
  }
}

// HARMONIC & RHYTHMIC DJ TRACK MATCHER
function calculateDjMatchScore(current, candidate) {
  if (!current || !candidate) return 0;
  if (current.id === candidate.id) return -999;

  let score = 50; // base score

  // 1. BPM Compatibility (Weight: up to 35 points)
  if (current.bpm && candidate.bpm) {
    const b1 = current.bpm;
    const b2 = candidate.bpm;

    let minDiff = Math.abs(b1 - b2) / b1;
    // Check half-time / double-time (e.g. 70 bpm vs 140 bpm)
    const half = Math.abs(b1 * 2 - b2) / (b1 * 2);
    const dbl = Math.abs(b1 / 2 - b2) / (b1 / 2);
    minDiff = Math.min(minDiff, half, dbl);

    if (minDiff <= 0.04) {
      score += 35; // Perfect tempo lock!
    } else if (minDiff <= 0.08) {
      score += 26;
    } else if (minDiff <= 0.14) {
      score += 15;
    } else {
      score -= Math.min(30, (minDiff - 0.14) * 80);
    }
  }

  // 2. Strict Energy Tier Management (Real DJ Flow)
  if (typeof current.energy === 'number' && typeof candidate.energy === 'number') {
    const e1 = current.energy;
    const e2 = candidate.energy;
    const diff = e2 - e1;

    // Fatal clash prevention: never drop an energetic track into a sleepy track!
    if (e1 >= 0.62 && e2 < 0.50) {
      score -= 75; // Severe penalty: mood killer
    } else if (e1 < 0.45 && e2 >= 0.75) {
      score -= 45; // Shock jump: jarring sudden energy blast
    } else if (Math.abs(diff) <= 0.08) {
      score += 35; // Ideal dancefloor groove continuity
    } else if (diff > 0 && diff <= 0.20) {
      score += 30; // Driving the room upward!
    } else if (diff < 0 && Math.abs(diff) <= 0.15) {
      score += 15; // Natural smooth breather
    } else {
      score -= Math.min(40, Math.abs(diff) * 60);
    }
  }

  // 3. Harmonic Hue / Mood (Weight: up to 25 points)
  if (typeof current.hue === 'number' && typeof candidate.hue === 'number') {
    let hueDiff = Math.abs(current.hue - candidate.hue);
    if (hueDiff > 180) hueDiff = 360 - hueDiff;
    const huePercent = hueDiff / 180;
    if (huePercent <= 0.12) {
      score += 25; // Harmonic twin!
    } else if (huePercent <= 0.28) {
      score += 18; // Close harmonic neighbor
    } else if (huePercent <= 0.45) {
      score += 8;
    } else {
      score -= Math.min(20, (huePercent - 0.45) * 40);
    }
  }

  // 4. Artist Variety (+5 points)
  const sameArtist = current.artists?.some(a => candidate.artists?.includes(a));
  if (!sameArtist) {
    score += 5;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

let isPrefetching = false;
async function prefetchNextBatch() {
  if (isPrefetching || currentSourceMode !== 'wave') return;
  isPrefetching = true;
  try {
    // In DJ mode with Harmonic Match: seed rotor directly with current track!
    const station = (isDjMode && djHarmonicMatch && currentTrack) ? `track:${currentTrack.id}` : currentStation;
    const res = await invoke('get_my_wave', { stationId: station });
    if (res && res.tracks && res.tracks.length > 0) {
      const existingIds = new Set(trackQueue.map(t => t.id));
      const freshTracks = res.tracks.filter(t => !existingIds.has(t.id));
      if (freshTracks.length > 0) {
        trackQueue = [...trackQueue, ...freshTracks];
        renderQueue();
      }
    }
  } catch (e) {
    console.warn('Prefetch wave batch warning:', e);
  } finally {
    isPrefetching = false;
  }
}

function getNextTrackIndex() {
  if (trackQueue.length === 0) return null;

  // In DJ Mode with Harmonic/Energy Matching: find the best compatible match in upcoming queue!
  if (isDjMode && currentTrack && trackQueue.length > currentTrackIndex + 1) {
    const startIdx = currentTrackIndex + 1;
    const lookAheadEnd = Math.min(trackQueue.length, startIdx + 15);
    let bestIdx = startIdx;
    let bestScore = calculateDjMatchScore(currentTrack, trackQueue[startIdx]);

    for (let i = startIdx + 1; i < lookAheadEnd; i++) {
      const candidate = trackQueue[i];
      const score = calculateDjMatchScore(currentTrack, candidate);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    // If a much better candidate was found down the queue, dynamically promote it to startIdx!
    const immediateScore = calculateDjMatchScore(currentTrack, trackQueue[startIdx]);
    if (bestIdx !== startIdx && (bestScore >= immediateScore + 12 || immediateScore < 45)) {
      const bestTrack = trackQueue.splice(bestIdx, 1)[0];
      trackQueue.splice(startIdx, 0, bestTrack);
      renderQueue();
    }

    // Auto-replenish if queue is running low
    if (currentSourceMode === 'wave' && trackQueue.length - startIdx <= 3) {
      prefetchNextBatch();
    }

    return startIdx;
  }

  if (currentTrackIndex + 1 < trackQueue.length) {
    return currentTrackIndex + 1;
  }
  if (currentSourceMode === 'favorites' && trackQueue.length > 0) {
    return 0; // Wrap around in favorites
  }
  return null;
}

async function preloadNextTrack() {
  const nextIdx = getNextTrackIndex();
  if (nextIdx === null) {
    if (currentSourceMode === 'wave') {
      prefetchNextBatch();
    }
    return;
  }
  const nextTrack = trackQueue[nextIdx];
  if (!nextTrack || preloadedTrack?.id === nextTrack.id) return;

  try {
    const inact = getInactiveAudio();
    const inactGain = currentDeck === 'A' ? deckGainB : deckGainA;
    if (inactGain && audioCtx) {
      inactGain.gain.setValueAtTime(0.0, audioCtx.currentTime);
    }
    const streamUrl = await invoke('get_stream_url', { trackId: nextTrack.id });
    inact.src = streamUrl;
    inact.load();
    preloadedTrack = nextTrack;
  } catch (err) {
    console.warn('Preload warning:', err);
  }
}

function getIncomingCuePoint(nextTrack, currentTrack = null, isManualTrigger = false, technique = 'auto', blendDuration = 7.5) {
  if (!nextTrack) return 0;
  const durSec = (nextTrack.duration_ms || 180000) / 1000;
  const bpm = nextTrack.bpm || currentTrack?.bpm || 120;
  const barSec = (60 / bpm) * 4;
  const phraseSec = barSec * 4; // 16 beats (4 bars, ~7.5s)
  const sectionSec = barSec * 16; // 64 beats (16 bars, ~30s)

  const curE = currentTrack?.energy ?? 0.5;
  const nextE = nextTrack?.energy ?? 0.5;

  // 1. Mid-Track Peak Drop / Chorus 2 (Around 40% - 55% of the song)
  // Real DJs drop into the middle of the track when:
  // - User manually triggers Drop ("⚡ ДРОП" button)
  // - High-energy club/dance flow where a quiet 30s intro would kill the dancefloor momentum
  // - Slam drop or high-impact transitions
  const shouldDropMidway = (isManualTrigger || technique === 'slam_drop' || (curE >= 0.58 && nextE >= 0.56)) && durSec >= 110;

  if (shouldDropMidway) {
    const midTarget = durSec * 0.48; // midpoint target (~half of the track)
    // Phrase-align to 16-bar section boundary
    let targetDrop = Math.round(midTarget / sectionSec) * sectionSec;
    if (targetDrop < durSec * 0.35 || targetDrop > durSec * 0.65) {
      targetDrop = Math.round(midTarget / phraseSec) * phraseSec;
    }
    // Incoming track starts blendDuration seconds before the drop so Track B builds alongside Track A
    const cueStart = Math.max(0, targetDrop - blendDuration);
    return cueStart;
  }

  // 2. First Drop / In-Stop (Drop 1 / Intro resolution)
  // When Track B has a marked in_stop (where the intro resolves into the main groove/verse)
  if (nextTrack.fade && typeof nextTrack.fade.in_stop === 'number' && nextTrack.fade.in_stop >= 6.0 && nextTrack.fade.in_stop <= 45.0) {
    const targetDrop = nextTrack.fade.in_stop;
    if (targetDrop > blendDuration) {
      return targetDrop - blendDuration;
    }
    return 0;
  }

  // 3. Phrase-aligned early drop (e.g. 8 bars or 16 bars from start)
  if (durSec > 90 && barSec >= 1.2 && curE >= 0.50) {
    const eightBars = barSec * 8; // ~15-16s
    if (eightBars > blendDuration) {
      return eightBars - blendDuration;
    }
  }

  // 4. Natural Intro (with silence trimming)
  if (nextTrack.fade && typeof nextTrack.fade.in_start === 'number' && nextTrack.fade.in_start > 0.05 && nextTrack.fade.in_start < 4.0) {
    return nextTrack.fade.in_start;
  }

  return 0;
}

// SYNTHESIZED DJ FX & ACCELERATORS
function playDjNoiseRiser(startTime, duration = 1.2) {
  if (!audioCtx) return;
  try {
    const bufferSize = Math.floor(audioCtx.sampleRate * duration);
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const bpFilter = audioCtx.createBiquadFilter();
    bpFilter.type = 'bandpass';
    bpFilter.Q.value = 3.6;
    bpFilter.frequency.setValueAtTime(350, startTime);
    bpFilter.frequency.exponentialRampToValueAtTime(6800, startTime + duration);

    const riserGain = audioCtx.createGain();
    riserGain.gain.setValueAtTime(0.005, startTime);
    riserGain.gain.exponentialRampToValueAtTime(0.35, startTime + duration - 0.1);
    riserGain.gain.linearRampToValueAtTime(0.0, startTime + duration);

    noise.connect(bpFilter);
    bpFilter.connect(riserGain);
    if (deckMixer) {
      riserGain.connect(deckMixer);
    } else {
      riserGain.connect(audioCtx.destination);
    }

    noise.start(startTime);
    noise.stop(startTime + duration);
  } catch (e) {
    console.warn('Noise riser warning:', e);
  }
}

function executeDjBackspin(deckAudio, startTime, duration = 1.0) {
  if (!deckAudio) return;
  try {
    const now = audioCtx ? audioCtx.currentTime : 0;
    const delayMs = Math.max(0, (startTime - now) * 1000);
    setTimeout(() => {
      try {
        deckAudio.playbackRate = 2.4;
        setTimeout(() => {
          try {
            deckAudio.playbackRate = 0.25;
          } catch (e) {}
        }, 220);
      } catch (e) {}
    }, delayMs);
  } catch (e) {}
}

async function executeDjTransition(nextIdx, isManualTrigger = false) {
  if (isTransitioning) return;
  if (nextIdx < 0 || nextIdx >= trackQueue.length) return;

  const nextTrack = trackQueue[nextIdx];
  if (!nextTrack) return;

  isTransitioning = true;
  ensureAudioContext();
  if (btnDj) btnDj.classList.add('is-mixing');

  const outgoingAudio = getActiveAudio();
  const incomingAudio = getInactiveAudio();

  const outgoingIsoLow = currentDeck === 'A' ? isoLowA : isoLowB;
  const outgoingIsoMid = currentDeck === 'A' ? isoMidA : isoMidB;
  const outgoingIsoHigh = currentDeck === 'A' ? isoHighA : isoHighB;
  const outgoingHpf = currentDeck === 'A' ? filterHpfA : filterHpfB;
  const outgoingLpf = currentDeck === 'A' ? filterLpfA : filterLpfB;
  const outgoingGain = currentDeck === 'A' ? deckGainA : deckGainB;
  const outgoingSend = currentDeck === 'A' ? djDelaySendA : djDelaySendB;

  const incomingIsoLow = currentDeck === 'A' ? isoLowB : isoLowA;
  const incomingIsoMid = currentDeck === 'A' ? isoMidB : isoMidA;
  const incomingIsoHigh = currentDeck === 'A' ? isoHighB : isoHighA;
  const incomingHpf = currentDeck === 'A' ? filterHpfB : filterHpfA;
  const incomingLpf = currentDeck === 'A' ? filterLpfB : filterLpfA;
  const incomingGain = currentDeck === 'A' ? deckGainB : deckGainA;
  const incomingSend = currentDeck === 'A' ? djDelaySendB : djDelaySendA;

  // Ensure incoming audio is loaded
  if (!incomingAudio.src || incomingAudio.src === '' || preloadedTrack?.id !== nextTrack.id) {
    try {
      const streamUrl = await invoke('get_stream_url', { trackId: nextTrack.id });
      incomingAudio.src = streamUrl;
    } catch (err) {
      console.error('DJ transition failed to get URL:', err);
      isTransitioning = false;
      if (btnDj) btnDj.classList.remove('is-mixing');
      playTrackAtIndex(nextIdx, 'next');
      return;
    }
  }

  // Tempo Sync (BPM phase matching)
  const curBpm = currentTrack?.bpm || 124;
  const nextBpm = nextTrack?.bpm || curBpm;
  let tempoRatio = 1.0;
  if (curBpm > 50 && nextBpm > 50) {
    const ratio = curBpm / nextBpm;
    if (ratio >= 0.88 && ratio <= 1.12) {
      tempoRatio = ratio;
    }
  }
  incomingAudio.playbackRate = tempoRatio;

  // Musical Phrase Timing (4/4 time signature)
  const effectiveBpm = curBpm || nextBpm || 124;
  const beatSec = 60 / effectiveBpm;
  const barSec = beatSec * 4;

  // Delay FX sync (dotted 1/8 note)
  const beatDelay = Math.min(1.0, Math.max(0.18, beatSec * 0.75));
  if (djDelayNode && audioCtx) {
    djDelayNode.delayTime.setValueAtTime(beatDelay, audioCtx.currentTime);
  }

  // Phase Quantization: align incoming kick to outgoing downbeat
  const curAudioTime = outgoingAudio.currentTime || 0;
  const remaining = outgoingAudio.duration ? Math.max(0, outgoingAudio.duration - curAudioTime) : 30;
  const timeToNextBeat = (beatSec - (curAudioTime % beatSec)) % beatSec;
  const timeToNextBar = (barSec - (curAudioTime % barSec)) % barSec;
  const quantizeDelay = isManualTrigger ? Math.max(0.04, timeToNextBeat) : Math.max(0.05, timeToNextBar);

  // Phrase duration selection (16 beats for standard smooth blend, 8 beats for manual drop)
  let phraseBars = 4; // 16 beats (4 bars)
  if (isManualTrigger) {
    phraseBars = remaining < 6 ? 1 : 2;
  } else if (remaining < 10) {
    phraseBars = 2; // 8 beats if near the end of track
  }
  const blendDuration = phraseBars * barSec; // in seconds

  // Technique selection
  let technique = djStyle;
  if (technique === 'auto') {
    const curE = currentTrack?.energy ?? 0.5;
    const nextE = nextTrack?.energy ?? 0.5;
    const bpmRatio = Math.max(curBpm, nextBpm) / Math.min(curBpm, nextBpm);

    if (bpmRatio > 1.14) {
      technique = 'spinback'; // Big tempo change -> vinyl spinback
    } else if (curE >= 0.65 && nextE >= 0.65) {
      technique = 'slam_drop'; // Peak energy dance bangers -> Slam Drop
    } else if (nextE - curE < -0.16) {
      technique = 'submerge'; // Track cooling down -> Lowpass filter submerge
    } else if (curE >= 0.52 && nextE >= 0.52) {
      technique = 'club_drop'; // Pioneer HPF sweep
    } else {
      technique = 'bass_swap'; // 16-beat Phrase Isolator Bass Swap
    }
  }

  const badgeMap = {
    bass_swap: '⚡ BASS SWAP',
    club_drop: '🎚️ HPF DROP',
    slam_drop: '💥 SLAM DROP',
    submerge: '🌊 SUBMERGE',
    spinback: '🌪️ SPINBACK'
  };
  const labelEl = btnDj?.querySelector('.dj-badge-label');
  if (labelEl) labelEl.textContent = badgeMap[technique] || 'DJ MIX';

  // Intelligent Hot Cue selection for incoming track (Intro, First Drop, or Mid-track Peak Drop)
  const inStart = getIncomingCuePoint(nextTrack, currentTrack, isManualTrigger, technique, blendDuration);
  incomingAudio.currentTime = inStart;

  const now = audioCtx ? audioCtx.currentTime : 0;
  const t0 = now + quantizeDelay;
  const tDrop = t0 + blendDuration;
  const targetOutGain = getTrackNormalizedGain(currentTrack);
  const targetInGain = getTrackNormalizedGain(nextTrack);

  if (audioCtx) {
    // 1. Reset incoming deck & KILL BASS (-48 dB) during incoming blend
    if (incomingHpf) {
      incomingHpf.frequency.cancelScheduledValues(now);
      incomingHpf.frequency.setValueAtTime(20, now);
      incomingHpf.Q.setValueAtTime(1.0, now);
    }
    if (incomingLpf) {
      incomingLpf.frequency.cancelScheduledValues(now);
      incomingLpf.frequency.setValueAtTime(22000, now);
      incomingLpf.Q.setValueAtTime(1.0, now);
    }
    if (incomingSend) {
      incomingSend.gain.cancelScheduledValues(now);
      incomingSend.gain.setValueAtTime(0, now);
    }
    if (incomingIsoLow) {
      incomingIsoLow.gain.cancelScheduledValues(now);
      // KILL BASS: -48 dB cutoff so incoming bass never clashes with outgoing!
      incomingIsoLow.gain.setValueAtTime(-48, now);
    }
    if (incomingIsoMid) {
      incomingIsoMid.gain.cancelScheduledValues(now);
      incomingIsoMid.gain.setValueAtTime(-6, now);
      incomingIsoMid.gain.linearRampToValueAtTime(0, tDrop); // Mids bloom into drop
    }
    if (incomingIsoHigh) {
      incomingIsoHigh.gain.cancelScheduledValues(now);
      incomingIsoHigh.gain.setValueAtTime(0, now); // Hi-hats enter crisp
    }
    if (incomingGain) {
      incomingGain.gain.cancelScheduledValues(now);
      incomingGain.gain.setValueAtTime(0, now);
      incomingGain.gain.setValueAtTime(0, t0);
      incomingGain.gain.linearRampToValueAtTime(targetInGain, t0 + 0.25);
    }

    // 2. Schedule Outgoing Deck & Technique Execution
    if (technique === 'slam_drop') {
      playDjNoiseRiser(tDrop - Math.min(1.4, blendDuration * 0.4), Math.min(1.4, blendDuration * 0.4));
      if (outgoingIsoLow) {
        outgoingIsoLow.gain.setValueAtTime(0, now);
      }
      if (outgoingGain) {
        outgoingGain.gain.cancelScheduledValues(now);
        outgoingGain.gain.setValueAtTime(targetOutGain, now);
        // 1-beat silence before drop
        outgoingGain.gain.setValueAtTime(targetOutGain, tDrop - beatSec);
        outgoingGain.gain.linearRampToValueAtTime(0.0, tDrop - beatSec + 0.05);
      }
      if (incomingIsoLow) {
        incomingIsoLow.gain.setValueAtTime(0, tDrop);
      }
    } else if (technique === 'spinback') {
      executeDjBackspin(outgoingAudio, tDrop - 0.9, 0.9);
      if (outgoingGain) {
        outgoingGain.gain.cancelScheduledValues(now);
        outgoingGain.gain.setValueAtTime(targetOutGain, now);
        outgoingGain.gain.linearRampToValueAtTime(0.0, tDrop - 0.05);
      }
      if (incomingIsoLow) {
        incomingIsoLow.gain.setValueAtTime(0, tDrop);
      }
    } else if (technique === 'submerge') {
      if (outgoingLpf) {
        outgoingLpf.Q.setValueAtTime(2.4, now);
        outgoingLpf.frequency.setValueAtTime(22000, now);
        outgoingLpf.frequency.exponentialRampToValueAtTime(240, tDrop - 0.05);
      }
      if (outgoingGain) {
        outgoingGain.gain.cancelScheduledValues(now);
        outgoingGain.gain.setValueAtTime(targetOutGain, now);
        outgoingGain.gain.linearRampToValueAtTime(0.0, tDrop);
      }
      if (incomingIsoLow) {
        incomingIsoLow.gain.setValueAtTime(0, tDrop);
      }
    } else if (technique === 'club_drop') {
      // Pioneer DJM High-Pass Filter sweep + Echo Washout
      if (outgoingHpf) {
        outgoingHpf.Q.cancelScheduledValues(now);
        outgoingHpf.Q.setValueAtTime(3.8, now);
        outgoingHpf.frequency.cancelScheduledValues(now);
        outgoingHpf.frequency.setValueAtTime(20, now);
        outgoingHpf.frequency.exponentialRampToValueAtTime(360, t0 + blendDuration * 0.4);
        outgoingHpf.frequency.exponentialRampToValueAtTime(3200, tDrop - 0.05);
      }
      if (outgoingSend) {
        outgoingSend.gain.cancelScheduledValues(now);
        outgoingSend.gain.setValueAtTime(0, now);
        outgoingSend.gain.setValueAtTime(0, t0 + Math.max(0, blendDuration - 1.6));
        outgoingSend.gain.linearRampToValueAtTime(0.85, tDrop - 0.15);
        outgoingSend.gain.setValueAtTime(0.0, tDrop);
      }
      if (outgoingGain) {
        outgoingGain.gain.cancelScheduledValues(now);
        outgoingGain.gain.setValueAtTime(targetOutGain, now);
        outgoingGain.gain.setValueAtTime(targetOutGain * 0.85, tDrop - 0.3);
        outgoingGain.gain.linearRampToValueAtTime(0.0, tDrop);
      }
      if (incomingIsoLow) {
        incomingIsoLow.gain.setValueAtTime(0, tDrop);
      }
    } else {
      // Real Studio Phrase Bass Swap (16-beat blend)
      if (outgoingIsoLow) {
        outgoingIsoLow.gain.cancelScheduledValues(now);
        outgoingIsoLow.gain.setValueAtTime(0, now);
        // INSTANT BASS SWAP on Beat 1 of the new phrase!
        outgoingIsoLow.gain.setValueAtTime(-48, tDrop);
      }
      if (incomingIsoLow) {
        // Incoming bass slams in at 0 dB right on the downbeat!
        incomingIsoLow.gain.setValueAtTime(0, tDrop);
      }
      if (outgoingIsoHigh) {
        // Highs dip slightly in the last bar to make space
        outgoingIsoHigh.gain.setValueAtTime(0, now);
        outgoingIsoHigh.gain.setValueAtTime(-3, t0 + blendDuration * 0.75);
      }
      if (outgoingGain) {
        outgoingGain.gain.cancelScheduledValues(now);
        outgoingGain.gain.setValueAtTime(targetOutGain, now);
        outgoingGain.gain.setValueAtTime(targetOutGain, tDrop);
        // Smoothly fade out the remaining outgoing highs/mids over 4 beats after the drop
        outgoingGain.gain.linearRampToValueAtTime(0.0, tDrop + 4 * beatSec);
      }
    }
  }

  // Start incoming audio right on the quantized beat!
  const startDelayMs = Math.max(0, quantizeDelay * 1000);
  setTimeout(() => {
    incomingAudio.play().catch(e => console.warn('DJ incoming play error:', e));
  }, startDelayMs);

  // Synchronize visual identity (title, cover, queue) EXACTLY ON THE DROP!
  setTimeout(() => {
    currentTrackIndex = nextIdx;
    currentTrack = nextTrack;
    setTrackPreview(currentTrack, 'next');
    updateLikeState(currentTrack.liked);
    renderQueue();
    updateFavoritesActiveRow();
    updateArtistActiveRow();
    updateMediaSession(currentTrack);

    if (currentSourceMode === 'wave') {
      sendFeedback('trackStarted');
    }
    playStartTime = Date.now();
  }, (quantizeDelay + blendDuration) * 1000);

  // Transition completion & clean wrap-up
  const totalDurationSec = quantizeDelay + blendDuration + 4 * beatSec + 0.5;
  if (transitionTimer) clearTimeout(transitionTimer);
  transitionTimer = setTimeout(() => {
    outgoingAudio.pause();
    outgoingAudio.currentTime = 0;
    outgoingAudio.removeAttribute('src'); // Flush decoded audio buffer from RAM
    outgoingAudio.load();
    outgoingAudio.playbackRate = 1.0;
    currentDeck = currentDeck === 'A' ? 'B' : 'A';
    resetDeckEq(currentDeck === 'A' ? 'B' : 'A');
    if (incomingGain && audioCtx) {
      incomingGain.gain.setValueAtTime(targetInGain, audioCtx.currentTime);
    }
    isTransitioning = false;
    preloadedTrack = null;
    transitionTimer = null;
    invoke('trim_memory').catch(() => {});

    if (btnDj) {
      btnDj.classList.remove('is-mixing');
      const resetLabel = btnDj.querySelector('.dj-badge-label');
      if (resetLabel) resetLabel.textContent = 'DJ';
    }

    // Smoothly restore native tempo if tempo was altered for beat matching
    if (tempoRatio !== 1.0) {
      const activeEl = getActiveAudio();
      const steps = 20;
      let s = 0;
      if (tempoRampInterval) clearInterval(tempoRampInterval);
      tempoRampInterval = setInterval(() => {
        s++;
        const p = s / steps;
        activeEl.playbackRate = tempoRatio + (1.0 - tempoRatio) * p;
        if (s >= steps) {
          clearInterval(tempoRampInterval);
          tempoRampInterval = null;
          activeEl.playbackRate = 1.0;
        }
      }, 100);
    }

    if (currentSourceMode === 'wave' && trackQueue.length - currentTrackIndex <= 3) {
      prefetchNextBatch();
    }
  }, totalDurationSec * 1000);
}

function playNextTrack() {
  if (trackQueue.length === 0) {
    if (currentSourceMode === 'wave') {
      loadWaveTracks(true);
    }
    return;
  }

  const nextIdx = getNextTrackIndex();
  if (nextIdx !== null) {
    playTrackAtIndex(nextIdx, 'next');
  } else if (currentSourceMode === 'wave') {
    loadWaveTracks(true);
  }
}

function playPrevTrack() {
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }

  if (currentTrackIndex > 0) {
    playTrackAtIndex(currentTrackIndex - 1, 'prev');
  } else if (trackQueue.length > 0) {
    if (currentSourceMode === 'favorites') {
      // Wrap around to the last track in favorites
      playTrackAtIndex(trackQueue.length - 1, 'prev');
    } else {
      audio.currentTime = 0;
    }
  }
}

function togglePlayPause() {
  ensureAudioContext();
  if (!currentTrack) {
    if (trackQueue.length > 0) {
      playTrackAtIndex(0, 'next');
    } else {
      loadWaveTracks(true);
    }
    return;
  }

  if (audio.paused) {
    audio.play();
    isPlaying = true;
    updatePlayState(true);
  } else {
    audio.pause();
    isPlaying = false;
    updatePlayState(false);
  }
}

function updatePlayState(playing) {
  document.body.classList.toggle('audio-playing', !!playing);
  const playSvg = '<polygon points="8 5 19 12 8 19"></polygon>';
  const pauseSvg = '<rect x="6" y="4" width="3.5" height="16" rx="1.5"></rect><rect x="14.5" y="4" width="3.5" height="16" rx="1.5"></rect>';
  playPauseIcon.innerHTML = playing ? pauseSvg : playSvg;

  const heroPlayIcon = document.getElementById('hero-play-icon');
  if (heroPlayIcon) {
    heroPlayIcon.innerHTML = playing ? pauseSvg : playSvg;
  }

  const heroPlayText = document.getElementById('hero-play-text');
  if (heroPlayText) {
    heroPlayText.textContent = playing ? 'Пауза' : (currentTrack ? 'Продолжить' : 'Запустить Мою волну');
  }

  const fsPlayIcon = document.getElementById('fs-play-icon');
  if (fsPlayIcon) {
    fsPlayIcon.innerHTML = playing ? pauseSvg : playSvg;
  }

  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
  }
}

// ROTOR FEEDBACK
async function sendFeedback(type) {
  if (currentSourceMode !== 'wave') return; // Rotor feedback only for wave mode!
  if (!currentTrack || !currentBatchId) return;

  const playedSeconds = playStartTime > 0 ? (Date.now() - playStartTime) / 1000 : 0;
  try {
    await invoke('send_wave_feedback', {
      stationId: currentStation,
      eventType: type,
      trackId: currentTrack.id,
      batchId: currentBatchId,
      playedSeconds: parseFloat(playedSeconds.toFixed(2))
    });
  } catch (err) {
    console.error('Feedback error:', err);
  }
}

// SHUFFLE & FAVORITES CONTROLS
function setupTransportShuffle() {
  if (btnShuffle) {
    btnShuffle.addEventListener('click', toggleShuffle);
  }
}

function toggleShuffle() {
  isShuffle = !isShuffle;
  updateShuffleUI();

  if (currentSourceMode === 'favorites' && favoritesList.length > 0) {
    if (isShuffle) {
      // Shuffle remaining favorites around current track
      const cur = currentTrack;
      if (cur) {
        const remaining = shuffleArray(favoritesList.filter(t => t.id !== cur.id));
        trackQueue = [cur, ...remaining];
        currentTrackIndex = 0;
      } else {
        trackQueue = shuffleArray(favoritesList.slice());
        currentTrackIndex = 0;
      }
    } else {
      // Restore sequential order
      const curId = currentTrack?.id;
      trackQueue = favoritesList.slice();
      currentTrackIndex = curId ? trackQueue.findIndex(t => t.id === curId) : 0;
      if (currentTrackIndex < 0) currentTrackIndex = 0;
    }
    renderQueue();
    updateFavoritesActiveRow();
  }
}

function updateShuffleUI() {
  if (btnShuffle) {
    if (isShuffle) {
      btnShuffle.classList.add('active');
    } else {
      btnShuffle.classList.remove('active');
    }
  }
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function setupFavoritesControls() {
  if (btnFavPlayAll) {
    btnFavPlayAll.addEventListener('click', () => {
      if (!favoritesList || favoritesList.length === 0) return;
      currentSourceMode = 'favorites';
      isShuffle = false;
      updateShuffleUI();
      updateStationDisplay();
      trackQueue = favoritesList.slice();
      playTrackAtIndex(0, 'next');
      updateFavoritesActiveRow();
    });
  }

  if (btnFavShuffle) {
    btnFavShuffle.addEventListener('click', () => {
      if (!favoritesList || favoritesList.length === 0) return;
      currentSourceMode = 'favorites';
      isShuffle = true;
      updateShuffleUI();
      updateStationDisplay();
      trackQueue = shuffleArray(favoritesList.slice());
      playTrackAtIndex(0, 'next');
      updateFavoritesActiveRow();
    });
  }
}

// DJ CONTROLS & SETTINGS BINDINGS
function setupDjControls() {
  if (btnDj) {
    btnDj.classList.toggle('active', isDjMode);
    btnDj.addEventListener('click', () => {
      isDjMode = !isDjMode;
      btnDj.classList.toggle('active', isDjMode);
      localStorage.setItem('ymusic_dj_mode', isDjMode);
      const djToggle = document.getElementById('dj-mode-toggle');
      if (djToggle) djToggle.checked = isDjMode;
      const djLabel = document.getElementById('dj-mode-label');
      if (djLabel) djLabel.textContent = isDjMode ? 'Включён' : 'Выключен';
    });
  }

  const djToggle = document.getElementById('dj-mode-toggle');
  const djLabel = document.getElementById('dj-mode-label');
  if (djToggle) {
    djToggle.checked = isDjMode;
    if (djLabel) djLabel.textContent = isDjMode ? 'Включён' : 'Выключен';
    djToggle.addEventListener('change', () => {
      isDjMode = djToggle.checked;
      if (btnDj) btnDj.classList.toggle('active', isDjMode);
      if (djLabel) djLabel.textContent = isDjMode ? 'Включён' : 'Выключен';
      localStorage.setItem('ymusic_dj_mode', isDjMode);
    });
  }

  const djTimeSlider = document.getElementById('dj-time-slider');
  const djTimeVal = document.getElementById('dj-time-val');
  if (djTimeSlider) {
    djTimeSlider.value = djCrossfadeDuration;
    if (djTimeVal) djTimeVal.textContent = djCrossfadeDuration + ' сек';
    djTimeSlider.addEventListener('input', () => {
      djCrossfadeDuration = parseInt(djTimeSlider.value, 10);
      if (djTimeVal) djTimeVal.textContent = djCrossfadeDuration + ' сек';
      localStorage.setItem('ymusic_dj_duration', djCrossfadeDuration);
    });
  }

  const djBassSwapToggle = document.getElementById('dj-bass-swap-toggle');
  const djBassLabel = document.getElementById('dj-bass-label');
  if (djBassSwapToggle) {
    djBassSwapToggle.checked = djBassSwap;
    if (djBassLabel) djBassLabel.textContent = djBassSwap ? 'Включён' : 'Выключен';
    djBassSwapToggle.addEventListener('change', () => {
      djBassSwap = djBassSwapToggle.checked;
      if (djBassLabel) djBassLabel.textContent = djBassSwap ? 'Включён' : 'Выключен';
      localStorage.setItem('ymusic_dj_bass_swap', djBassSwap);
    });
  }

  // Instant DJ Drop button
  if (btnDjDrop) {
    btnDjDrop.addEventListener('click', () => {
      if (isTransitioning) return;
      const nextIdx = getNextTrackIndex();
      if (nextIdx === null) return;

      if (!djVocalFreeMix || analyzeVocalPresence()) {
        executeDjTransition(nextIdx, true);
      } else {
        // Singer is currently mid-word: wait up to 500ms for vocal breath/pause
        btnDjDrop.classList.add('is-mixing');
        let waited = 0;
        const checkInterval = setInterval(() => {
          waited += 50;
          if (analyzeVocalPresence() || waited >= 500) {
            clearInterval(checkInterval);
            btnDjDrop.classList.remove('is-mixing');
            if (!isTransitioning) executeDjTransition(nextIdx, true);
          }
        }, 50);
      }
    });
  }

  // Golden Early Mix Window Toggle
  const djEarlyMixToggle = document.getElementById('dj-early-mix-toggle');
  const djEarlyMixLabel = document.getElementById('dj-early-mix-label');
  if (djEarlyMixToggle) {
    djEarlyMixToggle.checked = djEarlyMix;
    if (djEarlyMixLabel) djEarlyMixLabel.textContent = djEarlyMix ? 'Включён' : 'Выключен';
    djEarlyMixToggle.addEventListener('change', () => {
      djEarlyMix = djEarlyMixToggle.checked;
      if (djEarlyMixLabel) djEarlyMixLabel.textContent = djEarlyMix ? 'Включён' : 'Выключен';
      localStorage.setItem('ymusic_dj_early_mix', djEarlyMix);
    });
  }

  // Drop-to-Drop Toggle
  const djDropToDropToggle = document.getElementById('dj-drop-to-drop-toggle');
  const djDropToDropLabel = document.getElementById('dj-drop-to-drop-label');
  if (djDropToDropToggle) {
    djDropToDropToggle.checked = djDropToDrop;
    if (djDropToDropLabel) djDropToDropLabel.textContent = djDropToDrop ? 'Включён' : 'Выключен';
    djDropToDropToggle.addEventListener('change', () => {
      djDropToDrop = djDropToDropToggle.checked;
      if (djDropToDropLabel) djDropToDropLabel.textContent = djDropToDrop ? 'Включён' : 'Выключен';
      localStorage.setItem('ymusic_dj_drop_to_drop', djDropToDrop);
    });
  }

  // Harmonic Match Toggle
  const djHarmonicMatchToggle = document.getElementById('dj-harmonic-match-toggle');
  const djHarmonicMatchLabel = document.getElementById('dj-harmonic-match-label');
  if (djHarmonicMatchToggle) {
    djHarmonicMatchToggle.checked = djHarmonicMatch;
    if (djHarmonicMatchLabel) djHarmonicMatchLabel.textContent = djHarmonicMatch ? 'Включён' : 'Выключен';
    djHarmonicMatchToggle.addEventListener('change', () => {
      djHarmonicMatch = djHarmonicMatchToggle.checked;
      if (djHarmonicMatchLabel) djHarmonicMatchLabel.textContent = djHarmonicMatch ? 'Включён' : 'Выключен';
      localStorage.setItem('ymusic_dj_harmonic_match', djHarmonicMatch);
      renderQueue();
    });
  }

  // Vocal-Free Melody Mix Toggle
  const djVocalFreeToggle = document.getElementById('dj-vocal-free-toggle');
  const djVocalFreeLabel = document.getElementById('dj-vocal-free-label');
  if (djVocalFreeToggle) {
    djVocalFreeToggle.checked = djVocalFreeMix;
    if (djVocalFreeLabel) djVocalFreeLabel.textContent = djVocalFreeMix ? 'Включён' : 'Выключен';
    djVocalFreeToggle.addEventListener('change', () => {
      djVocalFreeMix = djVocalFreeToggle.checked;
      if (djVocalFreeLabel) djVocalFreeLabel.textContent = djVocalFreeMix ? 'Включён' : 'Выключен';
      localStorage.setItem('ymusic_dj_vocal_free', djVocalFreeMix);
    });
  }

  // DJ Style Selector Buttons
  const djStyleButtons = document.querySelectorAll('.dj-style-btn');
  djStyleButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.style === djStyle);
    btn.addEventListener('click', () => {
      djStyle = btn.dataset.style;
      localStorage.setItem('ymusic_dj_style', djStyle);
      djStyleButtons.forEach(b => b.classList.toggle('active', b.dataset.style === djStyle));
    });
  });
}

// REAL-TIME VOCAL ACTIVITY & INSTRUMENTAL MELODY DETECTOR
const vocalHistory = new Float32Array(16);
let vocalHistIdx = 0;
let instrumentalFramesCount = 0;

function analyzeVocalPresence() {
  if (!audioAnalyser) return true; // fallback if analyzer not ready
  const freqData = new Uint8Array(audioAnalyser.frequencyBinCount);
  audioAnalyser.getByteFrequencyData(freqData);

  // 1. Sub-bass & kick (bins 0 to 2, 0 - 180 Hz)
  let bass = 0;
  for (let i = 0; i < 3; i++) bass += freqData[i];
  bass /= 3;

  // 2. Vocal core formant spectrum (bins 4 to 32, ~300 Hz - 2800 Hz)
  let vocalBand = 0;
  for (let i = 4; i < 33; i++) vocalBand += freqData[i];
  vocalBand /= 29;

  // 3. Syllabic dynamic variance in vocal range
  const ratio = vocalBand / (bass + 12);
  vocalHistory[vocalHistIdx % vocalHistory.length] = ratio;
  vocalHistIdx++;

  let sum = 0;
  for (let i = 0; i < vocalHistory.length; i++) sum += vocalHistory[i];
  const avg = sum / vocalHistory.length;

  let variance = 0;
  for (let i = 0; i < vocalHistory.length; i++) {
    const d = vocalHistory[i] - avg;
    variance += d * d;
  }
  variance /= vocalHistory.length;

  // Human vocals produce dynamic fluctuations (syllables) with high mid-range ratio
  // Instrumental melodies (synths, guitars, beat) have steady, low-variance spectra
  const hasVoice = (vocalBand > 42 && variance > 0.007 && ratio > 0.42);

  if (!hasVoice) {
    instrumentalFramesCount++;
  } else {
    instrumentalFramesCount = 0;
  }

  // If instrumental for at least 5 consecutive frames (~80ms)
  return (instrumentalFramesCount >= 5);
}

// AUDIO EVENTS & DUAL-DECK CONTROLLER
function setupAudioEvents() {
  function attachDeckListeners(deckEl, deckName) {
    deckEl.addEventListener('play', () => {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      if (currentDeck === deckName) {
        isPlaying = true;
        updatePlayState(true);
        if (currentTrack) updateMediaSession(currentTrack);
        const coverWrap = document.getElementById('cover-wrapper');
        if (coverWrap) coverWrap.classList.add('is-playing');
        if (typeof triggerVisualizerLoop === 'function') triggerVisualizerLoop();
        if (isFsLyricsOpen && typeof startFsLyricsLoop === 'function') startFsLyricsLoop();
      }
    });

    deckEl.addEventListener('playing', () => {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      if (currentDeck === deckName) {
        isPlaying = true;
        updatePlayState(true);
        if (currentTrack) updateMediaSession(currentTrack);
        const coverWrap = document.getElementById('cover-wrapper');
        if (coverWrap) coverWrap.classList.add('is-playing');
        if (typeof triggerVisualizerLoop === 'function') triggerVisualizerLoop();
        if (isFsLyricsOpen && typeof startFsLyricsLoop === 'function') startFsLyricsLoop();
      }
    });

    deckEl.addEventListener('pause', () => {
      if (currentDeck === deckName && !isTransitioning) {
        isPlaying = false;
        updatePlayState(false);
        const coverWrap = document.getElementById('cover-wrapper');
        if (coverWrap) coverWrap.classList.remove('is-playing');
        if (typeof stopFsLyricsLoop === 'function') stopFsLyricsLoop();
      }
    });

    deckEl.addEventListener('timeupdate', () => {
      if (currentDeck !== deckName) return;
      if (isSeeking || isNaN(deckEl.duration)) return;
      const cur = deckEl.currentTime;
      const dur = deckEl.duration;
      timeCurrent.textContent = formatTime(cur);
      const pct = (cur / dur) * 100;
      progressFill.style.width = pct + '%';
      progressThumb.style.left = pct + '%';

      // Real-time animated lyrics highlight and autoscroll
      updateLyricsHighlight(cur);

      // 1. Dynamic Smart Preload
      const earlyMixWindow = (dur > 55 && djEarlyMix)
        ? Math.max(20, dur - Math.min(36, Math.max(24, dur * 0.18)))
        : (currentTrack?.fade?.out_start || (dur - djCrossfadeDuration));

      if (dur > 20 && cur >= (earlyMixWindow - 14) && !preloadedTrack && !isTransitioning) {
        preloadNextTrack();
      }

      // 2. Trigger Neural Studio DJ Beat Transition at Golden Cue Point
      if (isDjMode && !isTransitioning && dur > 16) {
        let shouldTrigger = false;

        if (djEarlyMix && dur > 55) {
          // Within early mix window (24-36s remaining):
          if (cur >= earlyMixWindow) {
            const bpm = currentTrack?.bpm || 120;
            const barSec = (60 / bpm) * 4;
            const phraseSec = barSec * 4; // 16 beats musical phrase
            const phraseOffset = cur % phraseSec;

            // Vocal-Free analysis: check if singer stopped and only melody is playing!
            const isMelodyOnly = djVocalFreeMix ? analyzeVocalPresence() : true;

            // Trigger when vocals have finished (melody only) and on a phrase boundary!
            if (isMelodyOnly && (phraseOffset < 0.4 || cur >= (dur - 18))) {
              shouldTrigger = true;
            } else if (phraseOffset < 0.25 && cur >= (dur - 20)) {
              shouldTrigger = true;
            }
          }
        } else {
          // Classic trigger at outCue
          const outCue = (currentTrack?.fade && typeof currentTrack.fade.out_start === 'number' && currentTrack.fade.out_start > 15)
            ? currentTrack.fade.out_start
            : (dur - djCrossfadeDuration);
          if (cur >= outCue) {
            shouldTrigger = true;
          }
        }

        if (shouldTrigger) {
          const nextIdx = getNextTrackIndex();
          if (nextIdx !== null) {
            executeDjTransition(nextIdx, false);
          }
        }
      }
    });

    deckEl.addEventListener('loadedmetadata', () => {
      if (currentDeck === deckName) {
        timeTotal.textContent = formatTime(deckEl.duration);
      }
    });

    deckEl.addEventListener('ended', () => {
      if (currentDeck === deckName && !isTransitioning) {
        if (currentSourceMode === 'wave') {
          sendFeedback('trackFinished');
        }
        playNextTrack();
      }
    });
  }

  if (audioA) attachDeckListeners(audioA, 'A');
  if (audioB) attachDeckListeners(audioB, 'B');

  // Setup DJ Controls
  setupDjControls();

  // Buttons
  btnPlayPause.addEventListener('click', togglePlayPause);
  const btnHeroPlay = document.getElementById('btn-hero-play');
  if (btnHeroPlay) {
    btnHeroPlay.addEventListener('click', togglePlayPause);
  }
  btnNext.addEventListener('click', () => {
    if (currentSourceMode === 'wave') {
      sendFeedback('skip');
    }
    playNextTrack();
  });
  btnPrev.addEventListener('click', playPrevTrack);

  // Like & Dislike
  btnLikeMain.addEventListener('click', toggleCurrentLike);
  if (dockLikeBtn) dockLikeBtn.addEventListener('click', toggleCurrentLike);
  btnDislikeMain.addEventListener('click', () => {
    if (currentSourceMode === 'wave') {
      sendFeedback('dislike');
    }
    playNextTrack();
  });

  // Scrubber Seek
  progressContainer.addEventListener('mousedown', e => {
    isSeeking = true;
    seek(e);
  });
  window.addEventListener('mousemove', e => {
    if (isSeeking) seek(e);
  });
  window.addEventListener('mouseup', () => {
    isSeeking = false;
  });

  function seek(e) {
    const rect = progressContainer.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    if (!isNaN(audio.duration)) {
      audio.currentTime = pos * audio.duration;
      progressFill.style.width = (pos * 100) + '%';
      progressThumb.style.left = (pos * 100) + '%';
    }
  }

  // Master Volume
  volumeSlider.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    audio.volume = val;
    volPercentText.textContent = `${Math.round(val * 100)}%`;
  });

  volMuteBtn.addEventListener('click', () => {
    audio.muted = !audio.muted;
    volMuteBtn.textContent = audio.muted ? '🔇' : '🔊';
  });
}

async function toggleCurrentLike() {
  if (!currentTrack) return;
  const newLiked = !currentTrack.liked;
  currentTrack.liked = newLiked;
  updateLikeState(newLiked);

  if (!newLiked) {
    // 1. Remove track from favoritesList
    favoritesList = favoritesList.filter(t => t.id !== currentTrack.id);
    if (favCountBanner) {
      favCountBanner.textContent = `${favoritesList.length} ТРЕКОВ В КОЛЛЕКЦИИ`;
    }

    // 2. Animate and remove from favorites DOM if visible
    if (favoritesResultsList) {
      const row = favoritesResultsList.querySelector(`.console-track-row[data-id="${currentTrack.id}"]`);
      if (row) {
        row.style.transition = 'opacity 0.25s, transform 0.25s, height 0.25s';
        row.style.opacity = '0';
        row.style.transform = 'translateX(-20px)';
        setTimeout(() => row.remove(), 250);
      }
    }

    // 3. Keep queue in sync if currently in favorites mode
    if (currentSourceMode === 'favorites') {
      const targetId = currentTrack.id;
      trackQueue = trackQueue.filter((t, idx) => t.id !== targetId || idx === currentTrackIndex);
      currentTrackIndex = trackQueue.findIndex(t => t.id === targetId);
      renderQueue();
    }
  } else {
    // If liked, prepend to favoritesList
    if (!favoritesList.some(t => t.id === currentTrack.id)) {
      favoritesList.unshift(currentTrack);
      if (favCountBanner) {
        favCountBanner.textContent = `${favoritesList.length} ТРЕКОВ В КОЛЛЕКЦИИ`;
      }
      if (viewFavorites && viewFavorites.classList.contains('active')) {
        renderFavoritesList();
      }
    }
  }

  try {
    await invoke('toggle_like', { trackId: currentTrack.id, add: newLiked });
    if (newLiked && currentSourceMode === 'wave') {
      sendFeedback('like');
    }
  } catch (err) {
    console.error('Like toggle error:', err);
  }
}

function updateLikeState(liked) {
  if (btnLikeMain) {
    btnLikeMain.classList.toggle('liked', liked);
    const heroLikeText = document.getElementById('hero-like-text');
    if (heroLikeText) {
      heroLikeText.textContent = liked ? 'В любимых' : 'Нравится';
    }
    const heroLikeIcon = document.getElementById('hero-like-icon');
    if (heroLikeIcon) {
      heroLikeIcon.setAttribute('fill', liked ? '#ff3b30' : 'none');
    }
  }
  if (dockLikeBtn) {
    dockLikeBtn.classList.toggle('liked', liked);
  }
}

// SEARCH
let searchDebounce = null;
if (searchInput) {
  searchInput.addEventListener('input', e => {
    const query = e.target.value.trim();
    searchClearBtn.style.display = query ? 'block' : 'none';

    clearTimeout(searchDebounce);
    if (!query) {
      searchResultsList.innerHTML = '<div class="empty-state-notice">Начните ввод для поиска треков</div>';
      return;
    }

    searchDebounce = setTimeout(async () => {
      try {
        searchResultsList.innerHTML = '<div class="empty-state-notice">Поиск в каталоге...</div>';
        const tracks = await invoke('search_tracks', { query });
        renderSearchResults(tracks);
      } catch (err) {
        searchResultsList.innerHTML = `<div class="empty-state-notice">Ошибка: ${err}</div>`;
      }
    }, 280);
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchClearBtn.style.display = 'none';
    searchResultsList.innerHTML = '<div class="empty-state-notice">Начните ввод для поиска треков</div>';
  });
}

function renderSearchResults(tracks) {
  if (!tracks || tracks.length === 0) {
    searchResultsList.innerHTML = '<div class="empty-state-notice">Ничего не найдено</div>';
    return;
  }

  searchResultsList.innerHTML = tracks.map((t, idx) => `
    <div class="console-track-row ${currentTrack && currentTrack.id === t.id ? 'is-active-playing' : ''}" data-id="${t.id}">
      <div class="c-idx-wrap">
        <span class="c-idx c-idx-num">${idx + 1}</span>
        <span class="c-idx-play">${currentTrack && currentTrack.id === t.id && isPlaying ? '⏸' : '▶'}</span>
      </div>
      <img src="${t.cover_url || 'assets/default-cover.svg'}" class="c-cover" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.src='assets/default-cover.svg'" />
      <div class="c-meta">
        <div class="c-title">${escapeHtml(t.title)}</div>
        <div class="c-artist">${renderArtistLinksHtml(t)}</div>
      </div>
      <button class="row-wave-btn" data-id="${t.id}" data-title="${escapeHtml(t.title)}" title="Запустить Мою волну по этому треку">🌊</button>
      <div class="c-dur">${formatTime(t.duration_ms / 1000)}</div>
    </div>
  `).join('');

  searchResultsList.querySelectorAll('.console-track-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.id;
      const track = tracks.find(t => t.id === id);
      if (!track) return;

      // If already playing this track, toggle play/pause (no duplicates!)
      if (currentTrack && currentTrack.id === id) {
        togglePlayPause();
        return;
      }

      currentSourceMode = 'search';
      updateStationDisplay();

      // If already in trackQueue, jump to it
      const existingIdx = trackQueue.findIndex(t => t.id === id);
      if (existingIdx !== -1) {
        const dir = existingIdx > currentTrackIndex ? 'next' : 'prev';
        playTrackAtIndex(existingIdx, dir);
      } else {
        // Insert right after current track without duplicates
        const insertAt = currentTrackIndex >= 0 ? currentTrackIndex + 1 : 0;
        trackQueue.splice(insertAt, 0, track);
        playTrackAtIndex(insertAt, 'next');
      }
    });
  });

  attachArtistAndWaveListeners(searchResultsList);
}

// FAVORITES
async function loadFavorites() {
  try {
    favoritesResultsList.innerHTML = '<div class="empty-state-notice">Загрузка избранных треков...</div>';
    favoritesList = await invoke('get_favorites');
    favCountBanner.textContent = `${favoritesList.length} ТРЕКОВ В КОЛЛЕКЦИИ`;

    if (favoritesList.length === 0) {
      favoritesResultsList.innerHTML = '<div class="empty-state-notice">Список пуст. Ставьте лайки трекам!</div>';
      return;
    }

    renderFavoritesList();
  } catch (err) {
    favoritesResultsList.innerHTML = `<div class="empty-state-notice">Ошибка: ${err}</div>`;
  }
}

function renderFavoritesList() {
  favoritesResultsList.innerHTML = favoritesList.map((t, idx) => {
    const isCur = currentTrack && currentTrack.id === t.id;
    return `
      <div class="console-track-row ${isCur ? 'is-active-playing' : ''}" data-id="${t.id}" data-idx="${idx}">
        <div class="c-idx-wrap">
          <span class="c-idx c-idx-num">${idx + 1}</span>
          <span class="c-idx-play">${isCur && isPlaying ? '⏸' : '▶'}</span>
        </div>
        <img src="${t.cover_url || 'assets/default-cover.svg'}" class="c-cover" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.src='assets/default-cover.svg'" />
        <div class="c-meta">
          <div class="c-title">${escapeHtml(t.title)}</div>
          <div class="c-artist">${renderArtistLinksHtml(t)}</div>
        </div>
        ${isCur && isPlaying ? `
          <div class="mini-equalizer inline-eq" title="Сейчас играет">
            <span class="mini-eq-bar"></span>
            <span class="mini-eq-bar"></span>
            <span class="mini-eq-bar"></span>
          </div>
        ` : ''}
        <button class="row-wave-btn" data-id="${t.id}" data-title="${escapeHtml(t.title)}" title="Запустить Мою волну по этому треку">🌊</button>
        <div class="c-dur">${formatTime(t.duration_ms / 1000)}</div>
        <button class="c-row-heart-btn" data-id="${t.id}" title="Удалить из избранного">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');

  favoritesResultsList.querySelectorAll('.console-track-row').forEach(row => {
    // Like button on row
    const heartBtn = row.querySelector('.c-row-heart-btn');
    if (heartBtn) {
      heartBtn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = row.dataset.id;
        favoritesList = favoritesList.filter(t => t.id !== id);
        if (favCountBanner) {
          favCountBanner.textContent = `${favoritesList.length} ТРЕКОВ В КОЛЛЕКЦИИ`;
        }

        row.style.transition = 'opacity 0.25s, transform 0.25s, height 0.25s';
        row.style.opacity = '0';
        row.style.transform = 'translateX(-20px)';
        setTimeout(() => row.remove(), 250);

        if (currentTrack && currentTrack.id === id) {
          currentTrack.liked = false;
          updateLikeState(false);
        }

        if (currentSourceMode === 'favorites') {
          trackQueue = trackQueue.filter((t, idx) => t.id !== id || idx === currentTrackIndex);
          currentTrackIndex = trackQueue.findIndex(t => t.id === currentTrack?.id);
          renderQueue();
        }

        try {
          await invoke('toggle_like', { trackId: id, add: false });
        } catch (err) {
          console.error('Unlike error:', err);
        }
      });
    }

    row.addEventListener('click', () => {
      const id = row.dataset.id;
      const track = favoritesList.find(t => t.id === id);
      if (!track) return;

      // If clicked the track that is ALREADY currently loaded:
      if (currentTrack && currentTrack.id === id) {
        togglePlayPause();
        return;
      }

      currentSourceMode = 'favorites';
      updateStationDisplay();

      // If we are already playing favorites and queue is populated with favorites:
      const existingQueueIdx = trackQueue.findIndex(t => t.id === id);
      if (trackQueue.length === favoritesList.length && existingQueueIdx !== -1) {
        const dir = existingQueueIdx > currentTrackIndex ? 'next' : 'prev';
        playTrackAtIndex(existingQueueIdx, dir);
      } else {
        // Build fresh queue from favorites without duplicating
        if (isShuffle) {
          const rest = shuffleArray(favoritesList.filter(t => t.id !== id));
          trackQueue = [track, ...rest];
          playTrackAtIndex(0, 'next');
        } else {
          trackQueue = favoritesList.slice();
          const targetIdx = trackQueue.findIndex(t => t.id === id);
          playTrackAtIndex(targetIdx !== -1 ? targetIdx : 0, 'next');
        }
      }
      updateFavoritesActiveRow();
    });
  });

  attachArtistAndWaveListeners(favoritesResultsList);
}

function updateFavoritesActiveRow() {
  if (!favoritesResultsList) return;
  favoritesResultsList.querySelectorAll('.console-track-row').forEach(row => {
    const isCur = currentTrack && row.dataset.id === currentTrack.id;
    if (isCur) {
      row.classList.add('is-active-playing');
      const playIcon = row.querySelector('.c-idx-play');
      if (playIcon) playIcon.textContent = isPlaying ? '⏸' : '▶';
    } else {
      row.classList.remove('is-active-playing');
      const playIcon = row.querySelector('.c-idx-play');
      if (playIcon) playIcon.textContent = '▶';
    }
  });
}

// ==========================================================================
// ARTIST PAGE & WAVE BY TRACK / ARTIST CONTROLLER
// ==========================================================================

function renderArtistLinksHtml(track) {
  if (!track.artists || track.artists.length === 0) return 'Неизвестный исполнитель';
  return track.artists.map((name, i) => {
    const aid = track.artist_ids?.[i];
    if (aid) {
      return `<span class="artist-clickable-link" data-artist-id="${aid}" data-artist-name="${escapeHtml(name)}">${escapeHtml(name)}</span>`;
    }
    return escapeHtml(name);
  }).join(', ');
}

function attachArtistAndWaveListeners(container) {
  if (!container) return;
  container.querySelectorAll('.artist-clickable-link').forEach(link => {
    link.addEventListener('click', e => {
      e.stopPropagation();
      const aid = link.dataset.artistId;
      const aname = link.dataset.artistName;
      if (aid) openArtistPage(aid, aname);
    });
  });

  container.querySelectorAll('.row-wave-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const tid = btn.dataset.id;
      const ttitle = btn.dataset.title;
      if (tid) launchWaveByTrack(tid, ttitle);
    });
  });
}

async function launchWaveByTrack(trackId, trackTitle) {
  currentSourceMode = 'wave';
  currentStation = `track:${trackId}`;
  currentStationName = `ТРЕК: ${trackTitle}`;
  updateStationDisplay();
  switchTab('wave');
  await loadWaveTracks(true);
}

async function launchWaveByArtist(artistId, artistName) {
  currentSourceMode = 'wave';
  currentStation = `artist:${artistId}`;
  currentStationName = `АРТИСТ: ${artistName}`;
  updateStationDisplay();
  switchTab('wave');
  await loadWaveTracks(true);
}

async function openArtistPage(artistId, artistName = '') {
  currentSourceMode = 'artist';
  currentStationName = artistName ? `АРТИСТ: ${artistName.toUpperCase()}` : 'АРТИСТ';
  updateStationDisplay();
  switchTab('artist');

  if (artistNameHeading) artistNameHeading.textContent = artistName || 'Загрузка...';
  if (artistCountsStat) artistCountsStat.textContent = 'Загрузка информации об артисте...';
  if (artistGenresTags) artistGenresTags.innerHTML = '';
  if (artistTracksContainer) {
    artistTracksContainer.innerHTML = '<div class="empty-state-notice">Загрузка треков артиста...</div>';
    artistTracksContainer.style.display = 'block';
  }
  if (artistAlbumsContainer) {
    artistAlbumsContainer.style.display = 'none';
  }

  currentArtistTab = 'popular';
  artistRecentTracks = null;
  updateArtistTabsUI();

  try {
    const details = await invoke('get_artist_info', { artistId: String(artistId) });
    currentArtistData = details;

    if (artistCoverImg && details.cover_url) {
      artistCoverImg.src = details.cover_url;
    }
    if (artistNameHeading) artistNameHeading.textContent = details.name;

    if (artistGenresTags) {
      artistGenresTags.innerHTML = details.genres
        .map(g => `<span class="artist-genre-pill">${escapeHtml(g)}</span>`)
        .join('');
    }

    if (artistCountsStat) {
      artistCountsStat.textContent = `${details.track_count} треков • ${details.album_count} альбомов`;
    }

    renderArtistTracks(details.popular_tracks);
  } catch (err) {
    console.error('Failed to load artist:', err);
    if (artistTracksContainer) {
      artistTracksContainer.innerHTML = `<div class="empty-state-notice">Не удалось загрузить данные артиста: ${err}</div>`;
    }
  }
}

function updateArtistTabsUI() {
  if (tabArtPopular) tabArtPopular.classList.toggle('active', currentArtistTab === 'popular');
  if (tabArtRecent) tabArtRecent.classList.toggle('active', currentArtistTab === 'recent');
  if (tabArtAlbums) tabArtAlbums.classList.toggle('active', currentArtistTab === 'albums');
}

function renderArtistTracks(tracks) {
  if (!artistTracksContainer) return;
  if (!tracks || tracks.length === 0) {
    artistTracksContainer.innerHTML = '<div class="empty-state-notice">Треки не найдены</div>';
    return;
  }

  artistTracksContainer.innerHTML = tracks.map((t, idx) => {
    const isCur = currentTrack && currentTrack.id === t.id;
    return `
      <div class="console-track-row ${isCur ? 'is-active-playing' : ''}" data-id="${t.id}" data-idx="${idx}">
        <div class="c-idx-wrap">
          <span class="c-idx c-idx-num">${idx + 1}</span>
          <span class="c-idx-play">${isCur && isPlaying ? '⏸' : '▶'}</span>
        </div>
        <img src="${t.cover_url || 'assets/default-cover.svg'}" class="c-cover" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.src='assets/default-cover.svg'" />
        <div class="c-meta">
          <div class="c-title">${escapeHtml(t.title)}</div>
          <div class="c-artist">${renderArtistLinksHtml(t)}</div>
        </div>
        ${isCur && isPlaying ? `
          <div class="mini-equalizer inline-eq" title="Сейчас играет">
            <span class="mini-eq-bar"></span>
            <span class="mini-eq-bar"></span>
            <span class="mini-eq-bar"></span>
          </div>
        ` : ''}
        <button class="row-wave-btn" data-id="${t.id}" data-title="${escapeHtml(t.title)}" title="Запустить Мою волну по этому треку">🌊</button>
        <div class="c-dur">${formatTime(t.duration_ms / 1000)}</div>
      </div>
    `;
  }).join('');

  artistTracksContainer.querySelectorAll('.console-track-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.id;
      if (currentTrack && currentTrack.id === id) {
        togglePlayPause();
        return;
      }
      currentSourceMode = 'artist';
      updateStationDisplay();
      trackQueue = tracks.slice();
      const idx = trackQueue.findIndex(t => t.id === id);
      playTrackAtIndex(idx >= 0 ? idx : 0, 'next');
      updateArtistActiveRow();
    });
  });

  attachArtistAndWaveListeners(artistTracksContainer);
}

function renderArtistAlbums(albums) {
  if (!artistAlbumsContainer) return;
  if (!albums || albums.length === 0) {
    artistAlbumsContainer.innerHTML = '<div class="empty-state-notice">Альбомы не найдены</div>';
    return;
  }

  artistAlbumsContainer.innerHTML = albums.map(alb => `
    <div class="album-card" data-album-id="${alb.id}">
      <img src="${alb.cover_url || 'assets/default-cover.svg'}" class="album-card-cover" referrerpolicy="no-referrer" crossorigin="anonymous" onerror="this.src='assets/default-cover.svg'" />
      <div class="album-card-title" title="${escapeHtml(alb.title)}">${escapeHtml(alb.title)}</div>
      <div class="album-card-meta">${alb.year ? alb.year + ' г.' : ''} ${alb.track_count ? '• ' + alb.track_count + ' тр.' : ''}</div>
    </div>
  `).join('');

  artistAlbumsContainer.querySelectorAll('.album-card').forEach(card => {
    card.addEventListener('click', async () => {
      const albumId = parseInt(card.dataset.albumId, 10);
      try {
        const tracks = await invoke('get_album_tracks', { albumId });
        if (tracks && tracks.length > 0) {
          currentSourceMode = 'artist';
          updateStationDisplay();
          trackQueue = tracks;
          playTrackAtIndex(0, 'next');
        }
      } catch (err) {
        console.error('Failed to load album tracks:', err);
      }
    });
  });
}

function updateArtistActiveRow() {
  if (!artistTracksContainer) return;
  artistTracksContainer.querySelectorAll('.console-track-row').forEach(row => {
    const isCur = currentTrack && row.dataset.id === currentTrack.id;
    if (isCur) {
      row.classList.add('is-active-playing');
      const playIcon = row.querySelector('.c-idx-play');
      if (playIcon) playIcon.textContent = isPlaying ? '⏸' : '▶';
    } else {
      row.classList.remove('is-active-playing');
      const playIcon = row.querySelector('.c-idx-play');
      if (playIcon) playIcon.textContent = '▶';
    }
  });
}

function setupArtistControls() {
  if (btnArtistPlayPopular) {
    btnArtistPlayPopular.addEventListener('click', () => {
      if (currentArtistData && currentArtistData.popular_tracks.length > 0) {
        currentSourceMode = 'artist';
        isShuffle = false;
        updateShuffleUI();
        trackQueue = currentArtistData.popular_tracks.slice();
        playTrackAtIndex(0, 'next');
        updateArtistActiveRow();
      }
    });
  }

  if (btnArtistShuffle) {
    btnArtistShuffle.addEventListener('click', () => {
      if (currentArtistData && currentArtistData.popular_tracks.length > 0) {
        currentSourceMode = 'artist';
        isShuffle = true;
        updateShuffleUI();
        trackQueue = shuffleArray(currentArtistData.popular_tracks.slice());
        playTrackAtIndex(0, 'next');
        updateArtistActiveRow();
      }
    });
  }

  if (btnArtistWave) {
    btnArtistWave.addEventListener('click', () => {
      if (currentArtistData) {
        launchWaveByArtist(currentArtistData.id, currentArtistData.name);
      }
    });
  }

  if (tabArtPopular) {
    tabArtPopular.addEventListener('click', () => {
      currentArtistTab = 'popular';
      updateArtistTabsUI();
      if (artistAlbumsContainer) artistAlbumsContainer.style.display = 'none';
      if (artistTracksContainer) {
        artistTracksContainer.style.display = 'block';
        if (currentArtistData) renderArtistTracks(currentArtistData.popular_tracks);
      }
    });
  }

  if (tabArtRecent) {
    tabArtRecent.addEventListener('click', async () => {
      currentArtistTab = 'recent';
      updateArtistTabsUI();
      if (artistAlbumsContainer) artistAlbumsContainer.style.display = 'none';
      if (artistTracksContainer) {
        artistTracksContainer.style.display = 'block';
        if (!artistRecentTracks && currentArtistData) {
          artistTracksContainer.innerHTML = '<div class="empty-state-notice">Загрузка свежих треков...</div>';
          try {
            artistRecentTracks = await invoke('get_artist_tracks', {
              artistId: String(currentArtistData.id),
              page: 0,
              pageSize: 50
            });
          } catch (err) {
            console.error('Failed to get recent tracks:', err);
          }
        }
        renderArtistTracks(artistRecentTracks || currentArtistData?.popular_tracks || []);
      }
    });
  }

  if (tabArtAlbums) {
    tabArtAlbums.addEventListener('click', () => {
      currentArtistTab = 'albums';
      updateArtistTabsUI();
      if (artistTracksContainer) artistTracksContainer.style.display = 'none';
      if (artistAlbumsContainer) {
        artistAlbumsContainer.style.display = 'grid';
        if (currentArtistData) renderArtistAlbums(currentArtistData.latest_albums);
      }
    });
  }

  if (btnWaveByTrack) {
    btnWaveByTrack.addEventListener('click', () => {
      if (currentTrack) {
        launchWaveByTrack(currentTrack.id, currentTrack.title);
      }
    });
  }
}

// ==========================================================================
// 10-BAND STUDIO GRAPHIC EQUALIZER (Web Audio API BiquadFilterNodes)
// ==========================================================================
const EQ_BANDS = [
  { freq: 32, label: '32Hz', type: 'lowshelf' },
  { freq: 64, label: '64Hz', type: 'peaking' },
  { freq: 125, label: '125Hz', type: 'peaking' },
  { freq: 250, label: '250Hz', type: 'peaking' },
  { freq: 500, label: '500Hz', type: 'peaking' },
  { freq: 1000, label: '1kHz', type: 'peaking' },
  { freq: 2000, label: '2kHz', type: 'peaking' },
  { freq: 4000, label: '4kHz', type: 'peaking' },
  { freq: 8000, label: '8kHz', type: 'peaking' },
  { freq: 16000, label: '16kHz', type: 'highshelf' },
];

const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  bass: [7, 6, 5, 2, 0, -1, 0, 1, 2, 3],
  edm: [5, 4, 2, 0, -1, 1, 2, 3, 4, 3],
  rock: [4, 3, 1, -1, -2, 1, 3, 4, 4, 3],
  vocal: [-2, -1, 0, 2, 4, 4, 3, 2, 1, 0],
  acoustic: [3, 2, 1, 0, 1, 2, 3, 3, 2, 2],
  night: [2, 1, 0, -1, -2, -2, -1, 0, -1, -3]
};

let eqGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
let eqFilters = [];
let eqEnabled = true;

// Load persisted EQ gains
try {
  const savedEq = localStorage.getItem('ymusic_eq_gains');
  if (savedEq) {
    const parsed = JSON.parse(savedEq);
    if (Array.isArray(parsed) && parsed.length === 10) {
      eqGains = parsed;
    }
  }
} catch (e) {}

function setupEqualizerUI() {
  const board = document.getElementById('eq-sliders-board');
  if (!board) return;

  board.innerHTML = EQ_BANDS.map((band, i) => {
    const g = eqGains[i] || 0;
    return `
      <div class="eq-channel">
        <span class="eq-db-val" id="eq-val-${i}">${g > 0 ? '+' : ''}${g}dB</span>
        <div class="eq-fader-wrap">
          <input type="range" class="eq-v-slider" id="eq-slider-${i}" min="-12" max="12" step="1" value="${g}" />
        </div>
        <span class="eq-freq-label">${band.label}</span>
      </div>
    `;
  }).join('');

  EQ_BANDS.forEach((band, i) => {
    const slider = document.getElementById(`eq-slider-${i}`);
    const valLabel = document.getElementById(`eq-val-${i}`);
    if (slider) {
      slider.addEventListener('input', e => {
        const val = parseInt(e.target.value, 10);
        eqGains[i] = val;
        if (valLabel) valLabel.textContent = `${val > 0 ? '+' : ''}${val}dB`;
        applyGainToFilter(i, val);
        try {
          localStorage.setItem('ymusic_eq_gains', JSON.stringify(eqGains));
        } catch (err) {}
      });
    }
  });

  const eqToggle = document.getElementById('eq-power-toggle');
  const eqToggleLabel = document.getElementById('eq-power-label');
  if (eqToggle) {
    eqToggle.addEventListener('change', () => {
      eqEnabled = eqToggle.checked;
      if (eqToggleLabel) eqToggleLabel.textContent = eqEnabled ? 'Включён' : 'Выключен';
      EQ_BANDS.forEach((_, i) => {
        applyGainToFilter(i, eqGains[i]);
      });
    });
  }

  const presetSelect = document.getElementById('eq-preset-select');
  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      const presetKey = presetSelect.value;
      const gains = EQ_PRESETS[presetKey] || EQ_PRESETS.flat;
      eqGains = gains.slice();
      gains.forEach((g, i) => {
        const slider = document.getElementById(`eq-slider-${i}`);
        const valLabel = document.getElementById(`eq-val-${i}`);
        if (slider) slider.value = g;
        if (valLabel) valLabel.textContent = `${g > 0 ? '+' : ''}${g}dB`;
        applyGainToFilter(i, g);
      });
      try {
        localStorage.setItem('ymusic_eq_gains', JSON.stringify(eqGains));
      } catch (err) {}
    });
  }

  const resetBtn = document.getElementById('eq-reset-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (presetSelect) presetSelect.value = 'flat';
      eqGains = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      eqGains.forEach((g, i) => {
        const slider = document.getElementById(`eq-slider-${i}`);
        const valLabel = document.getElementById(`eq-val-${i}`);
        if (slider) slider.value = 0;
        if (valLabel) valLabel.textContent = '0dB';
        applyGainToFilter(i, 0);
      });
      try {
        localStorage.setItem('ymusic_eq_gains', JSON.stringify(eqGains));
      } catch (err) {}
    });
  }
}

function applyGainToFilter(index, gainDb) {
  if (eqFilters[index] && audioCtx) {
    const targetGain = eqEnabled ? gainDb : 0;
    try {
      eqFilters[index].gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.02);
    } catch (e) {}
  }
}

// SETTINGS MODAL CONTROLLER
function setupSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const openBtn = document.getElementById('btn-open-settings');
  const sidebarBtn = document.getElementById('sidebar-settings-item');
  const closeBtn = document.getElementById('settings-close-btn');
  const changeTokenBtn = document.getElementById('settings-change-token-btn');

  function openSettings() {
    ensureAudioContext();
    if (modal) modal.style.display = 'flex';
    syncSettingsUser();
  }

  function closeSettings() {
    if (modal) modal.style.display = 'none';
  }

  if (openBtn) openBtn.addEventListener('click', openSettings);
  if (sidebarBtn) sidebarBtn.addEventListener('click', openSettings);
  if (closeBtn) closeBtn.addEventListener('click', closeSettings);

  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeSettings();
    });
  }

  const switchAccountBtn = document.getElementById('settings-switch-account-btn');
  const logoutBtn = document.getElementById('settings-logout-btn');

  if (switchAccountBtn) {
    switchAccountBtn.addEventListener('click', async () => {
      closeSettings();
      openAuthModal(true);
      try {
        await invoke('open_login_window');
      } catch (_) {}
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('Вы уверены, что хотите выйти из аккаунта?')) {
        try {
          if (audio) audio.pause();
          if (audioB) audioB.pause();
          isPlaying = false;
          updatePlayState(false);
          await invoke('logout');
          currentUser = null;
          userDisplayName.textContent = 'Войти';
          userAvatarImg.src = 'assets/default-cover.svg';
          closeSettings();
          openAuthModal(false);
        } catch (err) {
          alert('Ошибка при выходе: ' + err);
        }
      }
    });
  }

  // Visualizer option sync
  const optWave = document.getElementById('opt-vis-wave');
  const optSpec = document.getElementById('opt-vis-spec');
  const btnVisWave = document.getElementById('btn-vis-wave');
  const btnVisSpectrum = document.getElementById('btn-vis-spectrum');

  if (optWave && optSpec) {
    optWave.addEventListener('click', () => {
      if (btnVisWave) btnVisWave.click();
      optWave.classList.add('active');
      optSpec.classList.remove('active');
    });
    optSpec.addEventListener('click', () => {
      if (btnVisSpectrum) btnVisSpectrum.click();
      optSpec.classList.add('active');
      optWave.classList.remove('active');
    });
  }
}

function syncSettingsUser() {
  const avatarImg = document.getElementById('settings-avatar-img');
  const userName = document.getElementById('settings-user-name');
  if (currentUser) {
    if (userName) userName.textContent = currentUser.display_name || currentUser.login;
    if (avatarImg && currentUser.avatar_url) avatarImg.src = currentUser.avatar_url;
  }
}

// ==========================================================================
// MATERIAL YOU (MONET) DYNAMIC THEME ENGINE & PRESETS CONTROLLER
// ==========================================================================
let currentThemeMode = 'preset:terracotta'; // 'album', 'system', 'wallpaper', 'preset:<name>'
let systemAccentColorCached = null;
let wallpaperBase64Cached = null;

const THEME_PRESETS = {
  terracotta: {
    name: 'Персик (Pixel)',
    primary: '#ff897d',
    onPrimary: '#5c1407',
    primaryContainer: '#772b1d',
    onPrimaryContainer: '#ffdad4',
    secondaryContainer: '#473a36',
    onSecondaryContainer: '#ffdbd3',
    tertiary: '#a8d5e2',
    tertiaryContainer: '#234853',
    onTertiaryContainer: '#c4ecf9',
    surface: '#131316',
    surfaceContainerLow: '#1a1a1e',
    surfaceContainer: '#202025',
    surfaceContainerHigh: '#2a2a30',
    surfaceContainerHighest: '#35353c'
  },
  sage: {
    name: 'Шалфей (Мята)',
    primary: '#8ed5a2',
    onPrimary: '#003919',
    primaryContainer: '#1b4e2f',
    onPrimaryContainer: '#baf5cd',
    secondaryContainer: '#35433a',
    onSecondaryContainer: '#d4e7db',
    tertiary: '#a1d5cb',
    tertiaryContainer: '#1f4e47',
    onTertiaryContainer: '#bcece2',
    surface: '#121513',
    surfaceContainerLow: '#181c19',
    surfaceContainer: '#1e231f',
    surfaceContainerHigh: '#282f2a',
    surfaceContainerHighest: '#333a35'
  },
  sky: {
    name: 'Лазурь (Океан)',
    primary: '#99cbff',
    onPrimary: '#003355',
    primaryContainer: '#164676',
    onPrimaryContainer: '#d2e4ff',
    secondaryContainer: '#35404f',
    onSecondaryContainer: '#d6e3f7',
    tertiary: '#82d8d8',
    tertiaryContainer: '#004f50',
    onTertiaryContainer: '#9ef5f5',
    surface: '#111418',
    surfaceContainerLow: '#171b21',
    surfaceContainer: '#1d222a',
    surfaceContainerHigh: '#282e38',
    surfaceContainerHighest: '#333b47'
  },
  lavender: {
    name: 'Лаванда (Ягода)',
    primary: '#d5bbfb',
    onPrimary: '#3b255b',
    primaryContainer: '#4c3375',
    onPrimaryContainer: '#eedcff',
    secondaryContainer: '#453c4d',
    onSecondaryContainer: '#e9dfef',
    tertiary: '#f1b7ca',
    tertiaryContainer: '#5c2d3d',
    onTertiaryContainer: '#ffd9e4',
    surface: '#151218',
    surfaceContainerLow: '#1c1820',
    surfaceContainer: '#231e28',
    surfaceContainerHigh: '#2e2835',
    surfaceContainerHighest: '#393342'
  },
  amber: {
    name: 'Янтарь (Золото)',
    primary: '#eac248',
    onPrimary: '#3e2e00',
    primaryContainer: '#584400',
    onPrimaryContainer: '#ffe082',
    secondaryContainer: '#484132',
    onSecondaryContainer: '#f0e3ce',
    tertiary: '#a3d39c',
    tertiaryContainer: '#264e22',
    onTertiaryContainer: '#bfeebd',
    surface: '#161411',
    surfaceContainerLow: '#1d1b16',
    surfaceContainer: '#24211b',
    surfaceContainerHigh: '#302c24',
    surfaceContainerHighest: '#3c372e'
  },
  rose: {
    name: 'Коралл (Роза)',
    primary: '#ff839a',
    onPrimary: '#5e0b23',
    primaryContainer: '#721f37',
    onPrimaryContainer: '#ffd9df',
    secondaryContainer: '#4d373d',
    onSecondaryContainer: '#f8dbe1',
    tertiary: '#8cd5d5',
    tertiaryContainer: '#044e4e',
    onTertiaryContainer: '#a8f2f2',
    surface: '#161214',
    surfaceContainerLow: '#1e1719',
    surfaceContainer: '#251d20',
    surfaceContainerHigh: '#31272b',
    surfaceContainerHighest: '#3d3237'
  },
  monochrome: {
    name: 'Монохром (OLED)',
    primary: '#c7c6ca',
    onPrimary: '#2f3033',
    primaryContainer: '#46464a',
    onPrimaryContainer: '#e4e2e6',
    secondaryContainer: '#3b3b3e',
    onSecondaryContainer: '#e2e2e5',
    tertiary: '#9a9a9f',
    tertiaryContainer: '#353538',
    onTertiaryContainer: '#d5d5d9',
    surface: '#111113',
    surfaceContainerLow: '#171719',
    surfaceContainer: '#1d1d20',
    surfaceContainerHigh: '#27272b',
    surfaceContainerHighest: '#333337'
  }
};

function hexToRgb(hex) {
  let c = (hex || '#ff897d').replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r, g, b) {
  const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
  return '#' + [clamp(r), clamp(g), clamp(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h >= 0 && h < 60) { r = c; g = x; b = 0; }
  else if (h >= 60 && h < 120) { r = x; g = c; b = 0; }
  else if (h >= 120 && h < 180) { r = 0; g = c; b = x; }
  else if (h >= 180 && h < 240) { r = 0; g = x; b = c; }
  else if (h >= 240 && h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function generateMonetPalette(baseHex) {
  const { r, g, b } = hexToRgb(baseHex);
  const { h, s } = rgbToHsl(r, g, b);
  const sat = Math.max(0.40, Math.min(0.85, s || 0.7));

  return {
    primary: hslToHex(h, sat, 0.74),
    onPrimary: hslToHex(h, 0.70, 0.16),
    primaryContainer: hslToHex(h, 0.55, 0.28),
    onPrimaryContainer: hslToHex(h, 0.65, 0.90),
    secondaryContainer: hslToHex(h, 0.22, 0.24),
    onSecondaryContainer: hslToHex(h, 0.30, 0.90),
    tertiary: hslToHex((h + 60) % 360, 0.50, 0.75),
    tertiaryContainer: hslToHex((h + 60) % 360, 0.40, 0.25),
    onTertiaryContainer: hslToHex((h + 60) % 360, 0.55, 0.90),
    surface: hslToHex(h, 0.08, 0.08),
    surfaceContainerLow: hslToHex(h, 0.08, 0.11),
    surfaceContainer: hslToHex(h, 0.08, 0.14),
    surfaceContainerHigh: hslToHex(h, 0.08, 0.17),
    surfaceContainerHighest: hslToHex(h, 0.08, 0.21)
  };
}

function extractDominantColor(imgSrc) {
  return new Promise((resolve) => {
    if (!imgSrc || imgSrc === 'assets/default-cover.svg') {
      return resolve('#ff897d');
    }
    const img = new Image();
    img.crossOrigin = 'Anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 32;
        canvas.height = 32;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 32, 32);
        const data = ctx.getImageData(0, 0, 32, 32).data;
        let maxSat = -1;
        let bestColor = null;
        let rSum = 0, gSum = 0, bSum = 0, count = 0;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
          if (a < 128) continue;
          const max = Math.max(r, g, b) / 255;
          const min = Math.min(r, g, b) / 255;
          const delta = max - min;
          const lightness = (max + min) / 2;
          if (lightness > 0.08 && lightness < 0.92) {
            const sat = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
            if (sat > maxSat) {
              maxSat = sat;
              bestColor = rgbToHex(r, g, b);
            }
          }
          rSum += r; gSum += g; bSum += b; count++;
        }

        if (bestColor && maxSat > 0.15) {
          resolve(bestColor);
        } else if (count > 0) {
          resolve(rgbToHex(rSum / count, gSum / count, bSum / count));
        } else {
          resolve('#ff897d');
        }
      } catch (err) {
        resolve('#ff897d');
      }
    };
    img.onerror = () => resolve('#ff897d');
    img.src = imgSrc;
  });
}

let currentActivePalette = null;

function applyMaterialPalette(palette, label) {
  currentActivePalette = palette;
  const root = document.documentElement;
  root.style.setProperty('--md-sys-color-primary', palette.primary);
  root.style.setProperty('--md-sys-color-on-primary', palette.onPrimary);
  root.style.setProperty('--md-sys-color-primary-container', palette.primaryContainer);
  root.style.setProperty('--md-sys-color-on-primary-container', palette.onPrimaryContainer);
  root.style.setProperty('--md-sys-color-secondary-container', palette.secondaryContainer);
  root.style.setProperty('--md-sys-color-on-secondary-container', palette.onSecondaryContainer);
  root.style.setProperty('--md-sys-color-tertiary', palette.tertiary);
  root.style.setProperty('--md-sys-color-tertiary-container', palette.tertiaryContainer);
  root.style.setProperty('--md-sys-color-on-tertiary-container', palette.onTertiaryContainer);
  root.style.setProperty('--md-sys-color-background', palette.surface);
  root.style.setProperty('--md-sys-color-surface', palette.surface);
  root.style.setProperty('--md-sys-color-surface-container-low', palette.surfaceContainerLow);
  root.style.setProperty('--md-sys-color-surface-container', palette.surfaceContainer);
  root.style.setProperty('--md-sys-color-surface-container-high', palette.surfaceContainerHigh);
  root.style.setProperty('--md-sys-color-surface-container-highest', palette.surfaceContainerHighest);
  root.style.setProperty('--accent-glow', palette.primary + '55');

  const encodedColor = encodeURIComponent(palette.primary);
  const waveSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 8' preserveAspectRatio='none'%3E%3Cpath d='M0 4 Q6 0 12 4 T24 4' fill='none' stroke='${encodedColor}' stroke-width='3.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`;
  root.style.setProperty('--squiggly-wave-bg', waveSvg);

  const activeNameEl = document.getElementById('active-theme-name');
  if (activeNameEl && label) activeNameEl.textContent = label;
}

async function setThemeMode(mode) {
  currentThemeMode = mode;
  localStorage.setItem('ymusic_theme_choice', mode);

  // Update UI active states
  const modeBtns = document.querySelectorAll('.theme-mode-btn');
  modeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeMode === mode);
  });

  const presetCards = document.querySelectorAll('.theme-preset-card');
  presetCards.forEach(card => {
    card.classList.toggle('active', 'preset:' + card.dataset.preset === mode);
  });

  if (mode === 'album') {
    const coverUrl = currentTrack?.cover_url || trackCoverMain?.src;
    const title = currentTrack?.title || 'Играющий трек';
    await onTrackChangedForTheme(coverUrl, title);
  } else if (mode === 'system') {
    try {
      const colors = await invoke('get_system_theme_colors');
      const accent = colors?.accent_hex || '#0078D7';
      systemAccentColorCached = accent;
      const palette = generateMonetPalette(accent);
      applyMaterialPalette(palette, `Система Windows (${accent.toUpperCase()})`);
    } catch (e) {
      const palette = generateMonetPalette('#0078D7');
      applyMaterialPalette(palette, 'Система Windows');
    }
  } else if (mode === 'wallpaper') {
    try {
      const colors = await invoke('get_system_theme_colors');
      if (colors?.wallpaper_base64) {
        wallpaperBase64Cached = colors.wallpaper_base64;
        const color = await extractDominantColor(colors.wallpaper_base64);
        const palette = generateMonetPalette(color);
        applyMaterialPalette(palette, 'Обои рабочего стола');
      } else {
        const palette = generateMonetPalette('#ff897d');
        applyMaterialPalette(palette, 'Обои рабочего стола');
      }
    } catch (e) {
      const palette = generateMonetPalette('#ff897d');
      applyMaterialPalette(palette, 'Обои рабочего стола');
    }
  } else if (mode.startsWith('preset:')) {
    const presetId = mode.replace('preset:', '');
    const preset = THEME_PRESETS[presetId] || THEME_PRESETS.terracotta;
    applyMaterialPalette(preset, preset.name);
  }
}

async function onTrackChangedForTheme(coverUrl, trackTitle) {
  if (currentThemeMode !== 'album') return;
  const color = await extractDominantColor(coverUrl);
  const palette = generateMonetPalette(color);
  applyMaterialPalette(palette, `Обложка: ${trackTitle || 'Трек'}`);
}

function setupThemeController() {
  const modeBtns = document.querySelectorAll('.theme-mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      setThemeMode(btn.dataset.themeMode);
    });
  });

  const presetCards = document.querySelectorAll('.theme-preset-card');
  presetCards.forEach(card => {
    card.addEventListener('click', () => {
      setThemeMode('preset:' + card.dataset.preset);
    });
  });

  const savedChoice = localStorage.getItem('ymusic_theme_choice') || 'preset:terracotta';
  setThemeMode(savedChoice);
}

// ==========================================================================
// REAL-TIME AUDIO-REACTIVE VISUALIZER (Web Audio API + Dual Mode)
// ==========================================================================
let currentVisMode = 'wave'; // 'wave' or 'spectrum'
let audioCtx = null;
let audioAnalyser = null;
let sourceA = null;
let sourceB = null;
let deckGainA = null;
let deckGainB = null;
let deckMixer = null;

// Deck A Pioneer 3-Band Isolators + FX
let isoLowA = null;
let isoMidA = null;
let isoHighA = null;
let filterHpfA = null;
let filterLpfA = null;

// Deck B Pioneer 3-Band Isolators + FX
let isoLowB = null;
let isoMidB = null;
let isoHighB = null;
let filterHpfB = null;
let filterLpfB = null;

// DJ Echo & Washout FX Nodes
let djDelayNode = null;
let djDelayFeedback = null;
let djDelayFilter = null;
let djDelaySendA = null;
let djDelaySendB = null;
let djDelayMaster = null;

function ensureAudioContext() {
  if (!audioCtx) {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
      audioAnalyser = audioCtx.createAnalyser();
      audioAnalyser.fftSize = 512; // 256 frequency bins, 512 waveform points
      audioAnalyser.smoothingTimeConstant = 0.50; // fast & responsive for rhythm

      if (audioA) sourceA = audioCtx.createMediaElementSource(audioA);
      if (audioB) sourceB = audioCtx.createMediaElementSource(audioB);

      deckGainA = audioCtx.createGain();
      deckGainB = audioCtx.createGain();
      deckGainA.gain.value = currentDeck === 'A' ? 1.0 : 0.0;
      deckGainB.gain.value = currentDeck === 'B' ? 1.0 : 0.0;

      // Deck A 3-Band Studio Isolator
      isoLowA = audioCtx.createBiquadFilter();
      isoLowA.type = 'lowshelf';
      isoLowA.frequency.value = 260;
      isoLowA.gain.value = 0; // 0 dB = flat

      isoMidA = audioCtx.createBiquadFilter();
      isoMidA.type = 'peaking';
      isoMidA.frequency.value = 1000;
      isoMidA.Q.value = 0.8;
      isoMidA.gain.value = 0;

      isoHighA = audioCtx.createBiquadFilter();
      isoHighA.type = 'highshelf';
      isoHighA.frequency.value = 3200;
      isoHighA.gain.value = 0;

      filterHpfA = audioCtx.createBiquadFilter();
      filterHpfA.type = 'highpass';
      filterHpfA.frequency.value = 20;

      filterLpfA = audioCtx.createBiquadFilter();
      filterLpfA.type = 'lowpass';
      filterLpfA.frequency.value = 22000;

      // Deck B 3-Band Studio Isolator
      isoLowB = audioCtx.createBiquadFilter();
      isoLowB.type = 'lowshelf';
      isoLowB.frequency.value = 260;
      isoLowB.gain.value = 0;

      isoMidB = audioCtx.createBiquadFilter();
      isoMidB.type = 'peaking';
      isoMidB.frequency.value = 1000;
      isoMidB.Q.value = 0.8;
      isoMidB.gain.value = 0;

      isoHighB = audioCtx.createBiquadFilter();
      isoHighB.type = 'highshelf';
      isoHighB.frequency.value = 3200;
      isoHighB.gain.value = 0;

      filterHpfB = audioCtx.createBiquadFilter();
      filterHpfB.type = 'highpass';
      filterHpfB.frequency.value = 20;

      filterLpfB = audioCtx.createBiquadFilter();
      filterLpfB.type = 'lowpass';
      filterLpfB.frequency.value = 22000;

      deckMixer = audioCtx.createGain();
      deckGainA.connect(deckMixer);
      deckGainB.connect(deckMixer);

      // DJ Echo Washout FX Chain (Tape Delay + Warm LP Filter + Feedback)
      djDelayNode = audioCtx.createDelay(3.0);
      djDelayNode.delayTime.value = 0.45; // beat-synced dotted 1/8 note

      djDelayFeedback = audioCtx.createGain();
      djDelayFeedback.gain.value = 0.52; // smooth musical decay

      djDelayFilter = audioCtx.createBiquadFilter();
      djDelayFilter.type = 'lowpass';
      djDelayFilter.frequency.value = 2600; // analog warmth

      djDelayMaster = audioCtx.createGain();
      djDelayMaster.gain.value = 0.85;

      djDelaySendA = audioCtx.createGain();
      djDelaySendB = audioCtx.createGain();
      djDelaySendA.gain.value = 0.0;
      djDelaySendB.gain.value = 0.0;

      // Connect delay feedback loop:
      djDelayNode.connect(djDelayFilter);
      djDelayFilter.connect(djDelayFeedback);
      djDelayFeedback.connect(djDelayNode);
      djDelayFilter.connect(djDelayMaster);
      djDelayMaster.connect(deckMixer);

      if (sourceA) {
        sourceA.connect(isoLowA);
        isoLowA.connect(isoMidA);
        isoMidA.connect(isoHighA);
        isoHighA.connect(filterHpfA);
        filterHpfA.connect(filterLpfA);
        filterLpfA.connect(deckGainA);
        sourceA.connect(djDelaySendA);
        djDelaySendA.connect(djDelayNode);
      }
      if (sourceB) {
        sourceB.connect(isoLowB);
        isoLowB.connect(isoMidB);
        isoMidB.connect(isoHighB);
        isoHighB.connect(filterHpfB);
        filterHpfB.connect(filterLpfB);
        filterLpfB.connect(deckGainB);
        sourceB.connect(djDelaySendB);
        djDelaySendB.connect(djDelayNode);
      }

      // 10-Band Biquad Filter Chain
      eqFilters = EQ_BANDS.map((band, i) => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = band.type;
        filter.frequency.value = band.freq;
        if (band.type === 'peaking') {
          filter.Q.value = 1.4;
        }
        filter.gain.value = eqEnabled ? eqGains[i] : 0;
        return filter;
      });

      // Chain: deckMixer -> filter0 -> ... -> filter9 -> audioAnalyser -> audioCtx.destination
      let prevNode = deckMixer;
      for (const f of eqFilters) {
        prevNode.connect(f);
        prevNode = f;
      }
      prevNode.connect(audioAnalyser);
      audioAnalyser.connect(audioCtx.destination);
    } catch (err) {
      console.warn('Web Audio API init warning:', err);
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

function setupSpectrumVisualizer() {
  if (!specCtx || !spectrumCanvas) return;

  const btnVisWave = document.getElementById('btn-vis-wave');
  const btnVisSpectrum = document.getElementById('btn-vis-spectrum');
  const visStatusLabel = document.getElementById('vis-status-label');

  if (btnVisWave && btnVisSpectrum) {
    btnVisWave.addEventListener('click', () => {
      currentVisMode = 'wave';
      btnVisWave.classList.add('active');
      btnVisSpectrum.classList.remove('active');
      if (visStatusLabel) visStatusLabel.textContent = 'ЖИВАЯ ВОЛНА';
    });
    btnVisSpectrum.addEventListener('click', () => {
      currentVisMode = 'spectrum';
      btnVisSpectrum.classList.add('active');
      btnVisWave.classList.remove('active');
      if (visStatusLabel) visStatusLabel.textContent = 'СТУДИЙНЫЙ СПЕКТР';
    });
  }

  // Spectrum Bars State
  const bands = 48;
  const barHeights = new Float32Array(bands);
  const peakHeights = new Float32Array(bands);
  const peakHolds = new Int16Array(bands);
  const peakVelocities = new Float32Array(bands);

  // Organic Living Wave State
  const waveNodes = 28;
  const waveHeights = new Float32Array(waveNodes);
  const waveHeightsBack = new Float32Array(waveNodes);

  // Floating Ambient Particles (Wave Mode)
  const particleCount = 24;
  const particles = [];
  for (let p = 0; p < particleCount; p++) {
    particles.push({
      x: Math.random(),
      y: Math.random(),
      radius: Math.random() * 2 + 1,
      speedY: Math.random() * 0.003 + 0.0015,
      driftX: (Math.random() - 0.5) * 0.002,
      opacity: Math.random() * 0.7 + 0.2,
      pulsePhase: Math.random() * Math.PI * 2
    });
  }

  let time = 0;
  let avgBass = 0.2;
  let prevBass = 0;
  const freqData = new Uint8Array(256);
  const timeData = new Uint8Array(512);

  triggerVisualizerLoop = function() {
    if (!isWindowSuspended && !document.hidden && !visAnimFrameId) {
      visAnimFrameId = requestAnimationFrame(renderVisualizer);
    }
  };

  // Cached canvas dimensions to avoid continuous getBoundingClientRect reflows (reduces CPU/GPU load)
  let cachedCanvasW = 720;
  let cachedCanvasH = 120;
  function updateCanvasDimensions() {
    if (!spectrumCanvas) return;
    const rect = spectrumCanvas.getBoundingClientRect();
    cachedCanvasW = Math.round(rect.width * window.devicePixelRatio) || 720;
    cachedCanvasH = Math.round(rect.height * window.devicePixelRatio) || 120;
    if (spectrumCanvas.width !== cachedCanvasW || spectrumCanvas.height !== cachedCanvasH) {
      spectrumCanvas.width = cachedCanvasW;
      spectrumCanvas.height = cachedCanvasH;
    }
  }
  window.addEventListener('resize', updateCanvasDimensions);
  updateCanvasDimensions();

  let lastFrameTime = 0;
  let idleFrames = 0;
  const FRAME_INTERVAL = 1000 / 30; // 30 FPS cap saves ~75% GPU and CPU!

  function renderVisualizer(now) {
    if (isWindowSuspended || document.hidden || !document.hasFocus()) {
      visAnimFrameId = null;
      return; // ZERO GPU RENDERING WHEN NOT FOCUSED OR MINIMIZED!
    }

    const isAudioActive = isPlaying && !audio.paused;
    if (!isAudioActive) {
      idleFrames++;
      if (idleFrames > 25) {
        // Sleep completely when audio is paused/stopped
        const w = spectrumCanvas.width || cachedCanvasW;
        const h = spectrumCanvas.height || cachedCanvasH;
        specCtx.clearRect(0, 0, w, h);
        visAnimFrameId = null;
        return; // ZERO GPU USAGE WHEN PAUSED!
      }
    } else {
      idleFrames = 0;
    }

    visAnimFrameId = requestAnimationFrame(renderVisualizer);

    if (now && now - lastFrameTime < FRAME_INTERVAL) {
      return;
    }
    lastFrameTime = now || performance.now();

    const w = spectrumCanvas.width || cachedCanvasW;
    const h = spectrumCanvas.height || cachedCanvasH;
    specCtx.clearRect(0, 0, w, h);

    // Read REAL audio data from Web Audio API Analyser Node
    let hasRealAudio = false;
    let realBass = 0;
    let realMids = 0;
    let realHighs = 0;
    let realVol = 0;
    let isKickBeat = false;
    let bassDelta = 0;

    if (audioAnalyser && isAudioActive) {
      audioAnalyser.getByteFrequencyData(freqData);
      audioAnalyser.getByteTimeDomainData(timeData);

      let sumDev = 0;
      for (let i = 0; i < 512; i++) {
        sumDev += Math.abs(timeData[i] - 128);
      }
      realVol = sumDev / 512.0 / 128.0;

      if (realVol > 0.002) {
        hasRealAudio = true;
      }

      // Real Bass (bins 0 to 12: ~20Hz - ~300Hz)
      let bSum = 0;
      for (let i = 0; i < 12; i++) bSum += freqData[i];
      realBass = (bSum / 12) / 255.0;

      // Real Mids (bins 14 to 60: ~350Hz - ~3000Hz)
      let mSum = 0;
      for (let i = 14; i < 60; i++) mSum += freqData[i];
      realMids = (mSum / 46) / 255.0;

      // Real Highs (bins 62 to 160: ~3000Hz - ~12000Hz)
      let hSum = 0;
      for (let i = 62; i < 160; i++) hSum += freqData[i];
      realHighs = (hSum / 98) / 255.0;

      // Beat Kick Detection (Sharp beat punch reaction)
      avgBass += (realBass - avgBass) * 0.08;
      bassDelta = Math.max(0, realBass - avgBass);
      isKickBeat = bassDelta > 0.07 || (realBass > 0.50 && (realBass - prevBass) > 0.035);
      prevBass = realBass;
    }

    time += isAudioActive ? 0.025 : 0.005;

    if (currentVisMode === 'wave') {
      renderLivingAuroraWave(w, h, isAudioActive, hasRealAudio, realBass, realMids, realHighs, freqData, isKickBeat, bassDelta);
    } else {
      renderStudioSpectrumBars(w, h, isAudioActive, hasRealAudio, freqData);
    }
  }

  // 1. LIVING ORGANIC SOUNDWAVE (Material 3 Fluid Harmonic Ribbon)
  function renderLivingAuroraWave(w, h, active, hasReal, bass, mids, highs, freqs, isBeat, beatDelta) {
    const baseline = h - 6; // Grounded seamlessly at bottom floor of stage
    const maxAmp = active ? (h - 22) : (h * 0.12);

    const primaryColor = (currentActivePalette && currentActivePalette.primary) || '#ff897d';
    const tertiaryColor = (currentActivePalette && currentActivePalette.tertiary) || '#a8d5e2';

    // Update organic wave nodes from frequency bands
    for (let i = 0; i < waveNodes; i++) {
      const normIdx = i / (waveNodes - 1); // 0.0 to 1.0
      // Hann envelope: mathematically 0 at exact endpoints (x=0, x=w)
      const windowEnv = Math.sin(normIdx * Math.PI);

      let targetPrimary = 0;
      let targetBack = 0;

      if (hasReal) {
        // Map nodes across logarithmic frequency spectrum
        const binStart = Math.min(220, Math.floor(Math.pow(normIdx, 1.45) * 160));
        const binEnd = Math.min(230, binStart + 4);
        let bandSum = 0;
        for (let b = binStart; b <= binEnd; b++) {
          bandSum += freqs[b] || 0;
        }
        const bandMag = (bandSum / (binEnd - binStart + 1)) / 255.0;

        // Fluid organic ripple
        const primaryPhase = time * 2.2 + normIdx * 5.2;
        const ripple = Math.sin(primaryPhase) * 0.12 * (mids + highs * 0.6);

        // Beat kick response
        const kickThrust = isBeat ? Math.min(0.5, beatDelta * 1.5 + bass * 0.25) : 0;
        const rawSwell = (bandMag * 0.65 + bass * 0.28 + kickThrust + ripple) * windowEnv * maxAmp;
        targetPrimary = Math.max(0, Math.min(maxAmp, rawSwell));

        // Secondary harmonic backing wave with gentle phase shift
        const backPhase = time * 1.7 + normIdx * 4.4 + 0.8;
        const backRipple = Math.cos(backPhase) * 0.12 * mids;
        const rawBack = (bandMag * 0.45 + bass * 0.18 + backRipple) * windowEnv * (maxAmp * 0.68);
        targetBack = Math.max(0, Math.min(maxAmp, rawBack));
      } else if (active) {
        // Gentle resting breath when idle or starting
        targetPrimary = (Math.sin(time * 1.4 + normIdx * 4.2) * 0.5 + 0.5) * (maxAmp * 0.18) * windowEnv;
        targetBack = (Math.cos(time * 1.1 + normIdx * 3.6) * 0.5 + 0.5) * (maxAmp * 0.14) * windowEnv;
      }

      // Physics smoothing
      const smoothFactorAttack = isBeat ? 0.82 : 0.65;
      const smoothFactorDecay = 0.20;

      const fPrim = targetPrimary > waveHeights[i] ? smoothFactorAttack : smoothFactorDecay;
      waveHeights[i] += (targetPrimary - waveHeights[i]) * fPrim;

      const fBack = targetBack > waveHeightsBack[i] ? smoothFactorAttack : smoothFactorDecay;
      waveHeightsBack[i] += (targetBack - waveHeightsBack[i]) * fBack;
    }

    // Convert nodes to 2D coordinates: y is baseline - waveHeight (rising UP from baseline)
    const primaryPoints = [];
    const backPoints = [];
    for (let i = 0; i < waveNodes; i++) {
      const x = (i / (waveNodes - 1)) * w;
      const primY = Math.max(8, baseline - waveHeights[i]);
      const backY = Math.max(8, baseline - waveHeightsBack[i]);
      primaryPoints.push({ x, y: primY });
      backPoints.push({ x, y: backY });
    }

    function drawBezierWave(points) {
      if (points.length < 2) return;
      specCtx.moveTo(points[0].x, points[0].y);
      for (let i = 0; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        specCtx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      specCtx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
    }

    // Layer 1: Secondary Harmonic Aura Ribbon (Tertiary Theme Color)
    specCtx.beginPath();
    drawBezierWave(backPoints);
    specCtx.strokeStyle = tertiaryColor;
    specCtx.globalAlpha = active ? 0.38 : 0.18;
    specCtx.lineWidth = 2.0;
    specCtx.stroke();
    specCtx.globalAlpha = 1.0;

    // Layer 2: Soft Glowing Fill Under Primary Wave (Tapered to baseline)
    specCtx.beginPath();
    specCtx.moveTo(0, baseline);
    drawBezierWave(primaryPoints);
    specCtx.lineTo(w, baseline);
    specCtx.closePath();

    const fillGrad = specCtx.createLinearGradient(0, baseline - maxAmp, 0, baseline);
    fillGrad.addColorStop(0, primaryColor + (active ? '40' : '15'));
    fillGrad.addColorStop(0.65, tertiaryColor + (active ? '1a' : '08'));
    fillGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    specCtx.fillStyle = fillGrad;
    specCtx.fill();

    // Layer 3: Vibrant Primary Wave Ribbon (Linear gradient along width)
    specCtx.beginPath();
    drawBezierWave(primaryPoints);

    const strokeGrad = specCtx.createLinearGradient(0, 0, w, 0);
    strokeGrad.addColorStop(0, primaryColor);
    strokeGrad.addColorStop(0.45, tertiaryColor);
    strokeGrad.addColorStop(0.8, primaryColor);
    strokeGrad.addColorStop(1, tertiaryColor);

    specCtx.strokeStyle = strokeGrad;
    specCtx.lineWidth = Math.min(5, 2.5 + bass * 2.2);
    specCtx.lineCap = 'round';
    specCtx.lineJoin = 'round';
    specCtx.stroke();
  }

  // 2. STUDIO DYNAMIC RTA SPECTRUM (Real FFT Frequency Data with Smooth Physics)
  function renderStudioSpectrumBars(w, h, active, hasReal, freqs) {
    const spacing = 3;
    const barW = Math.max(2, (w - (bands + 1) * spacing) / bands);
    const maxBarH = h - 22;

    for (let i = 0; i < bands; i++) {
      let targetH = 3;
      if (hasReal) {
        // Map 48 visual bars to real FFT frequencies logarithmically
        const binIndex = Math.min(255, Math.floor(Math.pow(i / bands, 1.4) * 220));
        const mag = freqs[binIndex] / 255.0;
        targetH = Math.max(3, mag * maxBarH);
      } else if (active) {
        targetH = 4;
      }

      // Smooth attack and decay
      barHeights[i] += (targetH - barHeights[i]) * 0.45;

      // Peak Physics: sticky peak that drops smoothly
      if (barHeights[i] >= peakHeights[i]) {
        peakHeights[i] = barHeights[i];
        peakHolds[i] = 12;
        peakVelocities[i] = 0;
      } else {
        if (peakHolds[i] > 0) {
          peakHolds[i]--;
        } else {
          peakVelocities[i] += 0.4;
          peakHeights[i] = Math.max(3, peakHeights[i] - peakVelocities[i]);
        }
      }

      const x = spacing + i * (barW + spacing);
      const barH = Math.max(2, barHeights[i]);
      const y = h - barH - 4;

      // Bar gradient
      const barGrad = specCtx.createLinearGradient(0, h, 0, h - barH);
      barGrad.addColorStop(0, '#fc3f1d');
      barGrad.addColorStop(0.55, '#ff9f1c');
      barGrad.addColorStop(1, '#00f0ff');

      specCtx.fillStyle = barGrad;
      if (specCtx.roundRect) {
        specCtx.beginPath();
        specCtx.roundRect(x, y, barW, barH, [3, 3, 0, 0]);
        specCtx.fill();
      } else {
        specCtx.fillRect(x, y, barW, barH);
      }

      // Peak indicator directly on top of active bar
      if (peakHeights[i] > 5) {
        const peakY = Math.max(4, h - peakHeights[i] - 6);
        specCtx.fillStyle = '#ffffff';
        specCtx.shadowColor = '#00f0ff';
        specCtx.shadowBlur = 4;
        if (specCtx.roundRect) {
          specCtx.beginPath();
          specCtx.roundRect(x, peakY, barW, 2.5, [1, 1, 1, 1]);
          specCtx.fill();
        } else {
          specCtx.fillRect(x, peakY, barW, 2);
        }
        specCtx.shadowBlur = 0;
      }
    }
  }

  renderVisualizer();
}

// KEYBOARD SHORTCUTS
function setupKeyboardShortcuts() {
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlayPause();
    } else if (e.code === 'ArrowRight' && (e.ctrlKey || e.metaKey)) {
      if (currentSourceMode === 'wave') {
        sendFeedback('skip');
      }
      playNextTrack();
    } else if (e.code === 'ArrowLeft' && (e.ctrlKey || e.metaKey)) {
      playPrevTrack();
    } else if (e.code === 'ArrowRight') {
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
    } else if (e.code === 'ArrowLeft') {
      audio.currentTime = Math.max(0, audio.currentTime - 5);
    } else if (e.code === 'ArrowUp') {
      e.preventDefault();
      audio.volume = Math.min(1, audio.volume + 0.05);
      volumeSlider.value = audio.volume;
      volPercentText.textContent = `${Math.round(audio.volume * 100)}%`;
    } else if (e.code === 'ArrowDown') {
      e.preventDefault();
      audio.volume = Math.max(0, audio.volume - 0.05);
      volumeSlider.value = audio.volume;
      volPercentText.textContent = `${Math.round(audio.volume * 100)}%`;
    } else if (e.code === 'KeyL') {
      toggleCurrentLike();
    } else if (e.code === 'KeyS') {
      toggleShuffle();
    } else if (e.code === 'KeyM') {
      audio.muted = !audio.muted;
      volMuteBtn.textContent = audio.muted ? '🔇' : '🔊';
    } else if (e.code === 'KeyD') {
      if (btnDjDrop) btnDjDrop.click();
    } else if (e.code === 'KeyT') {
      toggleFullscreenLyrics();
    } else if (e.code === 'Escape') {
      if (isFsLyricsOpen) {
        closeFullscreenLyrics();
        return;
      }
      const setModal = document.getElementById('settings-modal');
      if (setModal) setModal.style.display = 'none';
      document.getElementById('token-modal').style.display = 'none';
      if (searchInput) searchInput.blur();
    }
  });
}

// FORMAT TIME
function formatTime(sec) {
  if (isNaN(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
