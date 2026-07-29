// Personal Worship App — browse songs, build playlist, play with lyrics

const SONGS_API = 'https://songs.davidowh.com/api/songs';
const PLAYLIST_KEY = 'worship_playlist_v1';
const CAT_LABELS = { praise: '赞美', worship: '敬拜', slow: '抒情', fast: '快歌', dialect: '方言' };

let allSongs = [];
let playlist = []; // array of song IDs
let activeCat = 'all';
let searchQuery = '';
let currentSongId = null;
let ytPlayer = null;
let ytReady = false;

// ── Persist playlist ──────────────────────────────────────────
function loadPlaylist() {
  try { playlist = JSON.parse(localStorage.getItem(PLAYLIST_KEY)) || []; } catch { playlist = []; }
}
function savePlaylist() {
  localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlist));
}

// ── Page navigation ───────────────────────────────────────────
const pages = document.querySelectorAll('.page');
const navBtns = document.querySelectorAll('.nav-btn');

function showPage(pageId) {
  pages.forEach(p => p.classList.toggle('active', p.id === pageId));
  navBtns.forEach(b => b.classList.toggle('active', b.dataset.page === pageId));
  if (pageId === 'playlistPage') renderPlaylist();
}

navBtns.forEach(btn => {
  btn.addEventListener('click', () => showPage(btn.dataset.page));
});

// ── Render browse list ────────────────────────────────────────
function renderBrowse() {
  const q = searchQuery.trim().toLowerCase();
  let songs = allSongs.filter(s => {
    const matchCat = activeCat === 'all' ? true
      : activeCat === 'lifeline' ? s.label === 'lifeline'
      : activeCat === 'worship' ? (s.category === 'worship' || s.category === 'slow')
      : s.category === activeCat;
    const matchQ = !q || s.title.toLowerCase().includes(q);
    return matchCat && matchQ;
  });
  songs.sort((a, b) => a.title.localeCompare(b.title, 'zh'));

  const el = document.getElementById('browseList');
  if (!songs.length) { el.innerHTML = '<div class="empty">没有找到歌曲</div>'; return; }

  el.innerHTML = songs.map(s => {
    const inPl = playlist.includes(s.id);
    return `<div class="song-item ${inPl ? 'in-playlist' : ''}" data-id="${s.id}">
      <div class="song-item-info">
        <div class="song-title">${esc(s.title)}</div>
        <div class="song-meta">
          <span class="tag tag-${s.category}">${CAT_LABELS[s.category] || s.category}</span>
          ${s.youtubeId ? '<span>▶ YouTube</span>' : ''}
        </div>
      </div>
      <button class="add-btn ${inPl ? 'added' : ''}" data-id="${s.id}" title="${inPl ? '已加入' : '加入歌单'}">
        ${inPl ? '✓' : '+'}
      </button>
    </div>`;
  }).join('');

  el.querySelectorAll('.add-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      togglePlaylist(btn.dataset.id);
    });
  });

  el.querySelectorAll('.song-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      if (!playlist.includes(id)) {
        togglePlaylist(id);
      }
      playSong(id);
      showPage('playerPage');
    });
  });
}

// ── Render playlist ───────────────────────────────────────────
function renderPlaylist() {
  const el = document.getElementById('playlistList');
  const badge = document.getElementById('playlistBadge');
  badge.textContent = playlist.length;
  badge.style.display = playlist.length ? 'flex' : 'none';

  if (!playlist.length) {
    el.innerHTML = `<div class="playlist-empty">
      歌单还是空的 🎵<br>
      到「浏览」页面搜索你喜欢的歌<br>点 <strong>＋</strong> 加入歌单
    </div>`;
    return;
  }

  const songs = playlist.map(id => allSongs.find(s => s.id === id)).filter(Boolean);
  el.innerHTML = songs.map((s, i) => `
    <div class="playlist-item ${s.id === currentSongId ? 'now-playing' : ''}" data-id="${s.id}">
      <div class="play-icon">${s.id === currentSongId ? '♪' : '▶'}</div>
      <div class="song-item-info">
        <div class="song-title">${esc(s.title)}</div>
        <div class="song-meta">
          <span class="tag tag-${s.category}">${CAT_LABELS[s.category] || s.category}</span>
          ${s.youtubeId ? '<span>▶ YouTube</span>' : ''}
        </div>
      </div>
      <button class="remove-btn" data-id="${s.id}" title="移除">✕</button>
    </div>`).join('');

  el.querySelectorAll('.playlist-item').forEach(item => {
    item.addEventListener('click', () => {
      playSong(item.dataset.id);
      showPage('playerPage');
    });
  });

  el.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      togglePlaylist(btn.dataset.id);
      renderPlaylist();
      renderBrowse();
    });
  });
}

// ── Toggle song in/out of playlist ───────────────────────────
function togglePlaylist(id) {
  if (playlist.includes(id)) {
    playlist = playlist.filter(x => x !== id);
  } else {
    playlist.push(id);
  }
  savePlaylist();
  renderBrowse();
  const badge = document.getElementById('playlistBadge');
  badge.textContent = playlist.length;
  badge.style.display = playlist.length ? 'flex' : 'none';
}

// ── Player ─────────────────────────────────────────────────────
function playSong(id) {
  const song = allSongs.find(s => s.id === id);
  if (!song) return;
  currentSongId = id;

  document.getElementById('playerTitle').textContent = song.title;

  // Lyrics
  const lyricsEl = document.getElementById('lyricsText');
  lyricsEl.textContent = song.lyrics || '（此歌曲暂无歌词）';

  // YouTube
  const placeholder = document.getElementById('ytPlaceholder');
  if (song.youtubeId) {
    placeholder.style.display = 'none';
    if (ytReady && ytPlayer) {
      document.getElementById('ytPlaceholder').style.display = 'none';
      ytPlayer.loadVideoById(song.youtubeId);
      // Update error handler for the new video
      ytPlayer.addEventListener('onError', () => showYTFallback(song.youtubeId));
    } else {
      createYTPlayer(song.youtubeId);
    }
  } else {
    placeholder.style.display = 'flex';
    if (ytPlayer) { ytPlayer.stopVideo(); }
  }

  // Prev / Next controls
  updateControls();

  // Scroll lyrics to top
  document.getElementById('lyricsPanel').scrollTop = 0;
}

function updateControls() {
  const idx = playlist.indexOf(currentSongId);
  document.getElementById('prevBtn').disabled = idx <= 0;
  document.getElementById('nextBtn').disabled = idx < 0 || idx >= playlist.length - 1;
}

document.getElementById('prevBtn').addEventListener('click', () => {
  const idx = playlist.indexOf(currentSongId);
  if (idx > 0) playSong(playlist[idx - 1]);
});

document.getElementById('nextBtn').addEventListener('click', () => {
  const idx = playlist.indexOf(currentSongId);
  if (idx < playlist.length - 1) playSong(playlist[idx + 1]);
});

document.getElementById('backBtn').addEventListener('click', () => {
  showPage('playlistPage');
});

// ── YouTube IFrame API ────────────────────────────────────────
function showYTFallback(videoId) {
  const placeholder = document.getElementById('ytPlaceholder');
  placeholder.style.display = 'flex';
  placeholder.innerHTML = `
    <span style="font-size:2rem">⚠️</span>
    <span style="font-size:0.85rem;text-align:center;padding:0 16px">此视频不支持嵌入播放</span>
    <a href="https://www.youtube.com/watch?v=${videoId}" target="_blank"
       style="margin-top:8px;padding:8px 18px;background:#ff0000;color:#fff;border-radius:8px;text-decoration:none;font-size:0.85rem;font-weight:600">
      ▶ 在 YouTube 打开
    </a>`;
}

function createYTPlayer(videoId) {
  document.getElementById('ytPlayer').innerHTML = '';
  document.getElementById('ytPlaceholder').style.display = 'none';
  if (!window.YT) { return; }
  ytPlayer = new YT.Player('ytPlayer', {
    videoId,
    playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
    events: {
      onReady: () => { ytReady = true; },
      onError: () => { showYTFallback(videoId); }
    }
  });
}

window.onYouTubeIframeAPIReady = function () {
  ytReady = true;
  // If a song was selected before API loaded, play it now
  if (currentSongId) {
    const song = allSongs.find(s => s.id === currentSongId);
    if (song && song.youtubeId) createYTPlayer(song.youtubeId);
  }
};

// Load YouTube API script
(function () {
  const tag = document.createElement('script');
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
})();

// ── Category filter ───────────────────────────────────────────
document.getElementById('catFilter').querySelectorAll('.cat-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeCat = pill.dataset.cat;
    renderBrowse();
  });
});

// ── Search ────────────────────────────────────────────────────
document.getElementById('searchInput').addEventListener('input', e => {
  searchQuery = e.target.value;
  renderBrowse();
});

// ── Helpers ───────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Init ──────────────────────────────────────────────────────
async function init() {
  loadPlaylist();
  try {
    const res = await fetch(SONGS_API);
    allSongs = await res.json();
    // Update "全部" pill count
    document.querySelector('.cat-pill[data-cat="all"]').textContent = `全部（${allSongs.length}）`;
  } catch {
    document.getElementById('browseList').innerHTML = '<div class="empty">无法加载歌曲，请检查网络连接</div>';
    return;
  }
  renderBrowse();
  renderPlaylist();
}

init();
