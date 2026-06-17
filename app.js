const CONFIG = window.ANIMEXD_CONFIG || {};

const FOLDER_MIME = "application/vnd.google-apps.folder";
const VIDEO_EXTENSIONS = [".mp4", ".m4v", ".webm", ".mov", ".mkv"];
const HISTORY_KEY = "animexd.watchHistory.v1";

const state = {
  series: [],
  flatVideos: [],
  currentVideo: null,
  activeSeries: null,
  query: "",
  playerMode: getInitialPlayerMode(),
  autoSelectedPlayer: true,
  route: { view: "home", seriesSlug: "" },
  watchHistory: loadWatchHistory()
};

function getInitialPlayerMode() {
  const configuredMode = String(CONFIG.PLAYER_MODE || "auto").toLowerCase();

  if (configuredMode === "drive") return "drive";
  if (configuredMode === "native") return "native";

  return isProbablyMobileOrTablet() ? "native" : "drive";
}

function isProbablyMobileOrTablet() {
  const userAgent = navigator.userAgent || navigator.vendor || "";

  const mobileByUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  const iPadDesktopMode = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;

  return mobileByUA || iPadDesktopMode;
}

const dom = {
  appTitle: document.getElementById("appTitle"),
  statusBox: document.getElementById("statusBox"),
  hero: document.getElementById("hero"),
  playerShell: document.getElementById("playerShell"),
  nativePlayer: document.getElementById("nativePlayer"),
  player: document.getElementById("videoPlayer"),
  exitCinemaBtn: document.getElementById("exitCinemaBtn"),
  expandPlayerBtn: document.getElementById("expandPlayerBtn"),
  fullscreenBtn: document.getElementById("fullscreenBtn"),
  togglePlayerBtn: document.getElementById("togglePlayerBtn"),
  prevEpisodeBtn: document.getElementById("prevEpisodeBtn"),
  nextEpisodeBtn: document.getElementById("nextEpisodeBtn"),
  nowPlayingSeries: document.getElementById("nowPlayingSeries"),
  nowPlayingTitle: document.getElementById("nowPlayingTitle"),
  nowPlayingMeta: document.getElementById("nowPlayingMeta"),
  library: document.getElementById("library"),
  seriesNav: document.getElementById("seriesNav"),
  searchInput: document.getElementById("searchInput"),
  reloadBtn: document.getElementById("reloadBtn"),
  openDriveBtn: document.getElementById("openDriveBtn"),
  copyLinkBtn: document.getElementById("copyLinkBtn")
};

document.addEventListener("DOMContentLoaded", () => {
  dom.appTitle.textContent = CONFIG.APP_TITLE || "AnimeXD";
  document.title = CONFIG.APP_TITLE || "AnimeXD";

  dom.appTitle.closest(".brand")?.addEventListener("click", () => goHome());

  dom.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderCurrentView();
  });

  dom.reloadBtn.addEventListener("click", () => loadLibrary());

  dom.openDriveBtn.addEventListener("click", () => {
    if (!state.currentVideo) return;
    window.open(getDriveViewUrl(state.currentVideo.id), "_blank", "noopener,noreferrer");
  });

  dom.copyLinkBtn.addEventListener("click", async () => {
    if (!state.currentVideo) return;

    const link = getDriveViewUrl(state.currentVideo.id);

    try {
      await navigator.clipboard.writeText(link);
      dom.copyLinkBtn.textContent = "Copiado";
      setTimeout(() => dom.copyLinkBtn.textContent = "Copiar enlace", 1200);
    } catch {
      prompt("Copia este enlace:", link);
    }
  });

  dom.fullscreenBtn.addEventListener("click", enterBestFullscreen);
  dom.expandPlayerBtn.addEventListener("click", expandPlayer);
  dom.exitCinemaBtn.addEventListener("click", exitCinemaMode);
  dom.prevEpisodeBtn.addEventListener("click", () => playAdjacentEpisode(-1));
  dom.nextEpisodeBtn.addEventListener("click", () => playAdjacentEpisode(1));

  dom.togglePlayerBtn.addEventListener("click", () => {
    state.autoSelectedPlayer = false;
    state.playerMode = state.playerMode === "native" ? "drive" : "native";
    updatePlayerModeButton();

    if (state.currentVideo) {
      playVideo(state.currentVideo, true, { skipHistory: true });
    }
  });

  dom.nativePlayer.addEventListener("error", () => {
    if (state.playerMode !== "native" || !state.currentVideo) return;

    state.playerMode = "drive";
    updatePlayerModeButton();
    playVideo(state.currentVideo, true, { skipHistory: true });
    showTemporaryStatus("El reproductor nativo no pudo cargar este archivo. Cambie automaticamente a Drive preview.");
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      exitCinemaMode();
    }
  });

  window.addEventListener("hashchange", handleRouteChange);
  document.addEventListener("fullscreenchange", syncFullscreenUI);
  document.addEventListener("webkitfullscreenchange", syncFullscreenUI);

  updatePlayerModeButton();
  loadLibrary();
});

async function loadLibrary() {
  resetUI();

  try {
    validateConfig();

    setStatus("Cargando carpetas y capitulos desde Google Drive...");

    const rootItems = await listDriveChildren(CONFIG.ROOT_FOLDER_ID);
    const folders = rootItems
      .filter((item) => item.mimeType === FOLDER_MIME)
      .sort(byNaturalName);

    const directVideos = rootItems
      .filter(isVideoFile)
      .map((file) => toVideoItem(file, "Sin serie", "sin-serie"))
      .sort(byEpisode);

    const series = [];

    if (CONFIG.SHOW_DIRECT_ROOT_FILES && directVideos.length > 0) {
      series.push({
        id: "direct-root-files",
        name: "Sin serie",
        slug: "sin-serie",
        folderId: CONFIG.ROOT_FOLDER_ID,
        videos: directVideos
      });
    }

    for (const folder of folders) {
      const seriesSlug = slugify(folder.name);
      const children = await listDriveChildren(folder.id);
      const videos = children
        .filter(isVideoFile)
        .map((file) => toVideoItem(file, folder.name, seriesSlug))
        .sort(byEpisode);

      if (videos.length > 0) {
        series.push({
          id: folder.id,
          name: folder.name,
          slug: seriesSlug,
          folderId: folder.id,
          videos
        });
      }
    }

    state.series = series.sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
    state.flatVideos = state.series.flatMap((serie) => serie.videos);

    if (state.flatVideos.length === 0) {
      setError(`
        No encontre videos en la carpeta.
        Revisa que la carpeta principal tenga subcarpetas con archivos MP4
        y que todo este compartido como "cualquier persona con el enlace puede ver".
      `);
      return;
    }

    hideStatus();
    handleRouteChange();
  } catch (error) {
    console.error(error);
    setError(formatFriendlyError(error));
  }
}

function validateConfig() {
  if (!CONFIG.ROOT_FOLDER_ID) {
    throw new Error("Falta ROOT_FOLDER_ID en config.js.");
  }

  if (!CONFIG.GOOGLE_API_KEY || CONFIG.GOOGLE_API_KEY.includes("PEGA_TU_API_KEY")) {
    throw new Error("Falta pegar tu GOOGLE_API_KEY en config.js.");
  }
}

async function listDriveChildren(folderId) {
  const allFiles = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: "nextPageToken,files(id,name,mimeType,modifiedTime,thumbnailLink,size)",
      pageSize: "1000",
      orderBy: "folder,name",
      spaces: "drive",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true"
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;

    const response = await fetch(url, {
      headers: {
        "x-goog-api-key": CONFIG.GOOGLE_API_KEY
      }
    });

    const data = await response.json();

    if (!response.ok) {
      const message = data?.error?.message || `Error HTTP ${response.status}`;
      throw new Error(message);
    }

    allFiles.push(...(data.files || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  return allFiles;
}

function isVideoFile(file) {
  const name = (file.name || "").toLowerCase();
  const hasVideoMime = (file.mimeType || "").startsWith("video/");
  const hasVideoExtension = VIDEO_EXTENSIONS.some((extension) => name.endsWith(extension));
  return hasVideoMime || hasVideoExtension;
}

function toVideoItem(file, seriesName, seriesSlug) {
  const cleanTitle = removeVideoExtension(file.name || "Sin titulo");
  const episodeNumber = extractEpisodeNumber(cleanTitle);

  return {
    id: file.id,
    name: file.name,
    title: cleanTitle,
    seriesName,
    seriesSlug,
    episodeNumber,
    mimeType: file.mimeType,
    modifiedTime: file.modifiedTime,
    size: file.size ? Number(file.size) : null,
    thumbnail: getThumbnailUrl(file.id)
  };
}

function extractEpisodeNumber(name) {
  const patterns = [
    /s\d{1,2}\s*e(\d{1,4})/i,
    /(?:ep|episodio|cap|cap.tulo|chapter)[\s._-]*(\d{1,4})/i
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) return Number(match[1]);
  }

  const numbers = [...name.matchAll(/\d{1,4}/g)].map((match) => Number(match[0]));
  if (numbers.length === 0) return 999999;

  return numbers[numbers.length - 1];
}

function removeVideoExtension(name) {
  return name.replace(/\.(mp4|m4v|webm|mov|mkv)$/i, "").trim();
}

function byNaturalName(a, b) {
  return a.name.localeCompare(b.name, "es", { numeric: true, sensitivity: "base" });
}

function byEpisode(a, b) {
  if (a.episodeNumber !== b.episodeNumber) {
    return a.episodeNumber - b.episodeNumber;
  }

  return a.title.localeCompare(b.title, "es", { numeric: true, sensitivity: "base" });
}

function handleRouteChange() {
  state.route = parseRoute();
  renderCurrentView();
}

function parseRoute() {
  const hash = decodeURIComponent(window.location.hash || "");
  const match = hash.match(/^#\/serie\/([^/]+)$/);

  if (match) {
    return { view: "series", seriesSlug: match[1] };
  }

  return { view: "home", seriesSlug: "" };
}

function goHome() {
  window.location.hash = "#/";
}

function openSeries(serie) {
  window.location.hash = `#/serie/${encodeURIComponent(serie.slug)}`;
}

function renderCurrentView() {
  if (state.flatVideos.length === 0) return;

  if (state.route.view === "series") {
    const serie = findSeriesBySlug(state.route.seriesSlug);

    if (!serie) {
      goHome();
      return;
    }

    renderSeriesView(serie);
    return;
  }

  renderHomeView();
}

function renderHomeView() {
  state.activeSeries = null;
  state.currentVideo = null;
  stopPlayers();
  dom.hero.classList.add("hidden");
  dom.seriesNav.classList.add("hidden");
  dom.library.innerHTML = "";

  const matchingSeries = state.series.filter(matchesSeriesSearch);
  const continueVideos = getContinueVideos().filter(matchesSearch);

  if (continueVideos.length > 0) {
    const continueSection = createShelfSection("Continuar viendo", `${continueVideos.length} reciente${continueVideos.length === 1 ? "" : "s"}`);
    const row = continueSection.querySelector(".episode-row");

    continueVideos.forEach((video) => {
      row.appendChild(createContinueCard(video));
    });

    dom.library.appendChild(continueSection);
  }

  const catalogSection = document.createElement("section");
  catalogSection.className = "series-section";
  catalogSection.innerHTML = `
    <div class="series-heading">
      <h2>Catalogo</h2>
      <span class="series-count">${matchingSeries.length} serie${matchingSeries.length === 1 ? "" : "s"}</span>
    </div>
    <div class="series-grid"></div>
  `;

  const grid = catalogSection.querySelector(".series-grid");
  matchingSeries.forEach((serie) => {
    grid.appendChild(createSeriesCard(serie));
  });

  dom.library.appendChild(catalogSection);

  if (matchingSeries.length === 0 && continueVideos.length === 0) {
    dom.library.innerHTML = `
      <div class="empty">
        No encontre series con ese filtro.
      </div>
    `;
  }
}

function renderSeriesView(serie) {
  state.activeSeries = serie.id;
  dom.seriesNav.classList.remove("hidden");
  dom.seriesNav.innerHTML = "";
  dom.seriesNav.appendChild(createBackButton());

  dom.library.innerHTML = "";

  const filteredVideos = serie.videos.filter(matchesSearch);

  const section = document.createElement("section");
  section.className = "series-section";
  section.id = `series-${serie.slug}`;
  section.innerHTML = `
    <div class="series-detail-heading">
      <div>
        <p class="eyebrow">Serie</p>
        <h2>${escapeHtml(serie.name)}</h2>
      </div>
      <span class="series-count">${filteredVideos.length} capitulo${filteredVideos.length === 1 ? "" : "s"}</span>
    </div>
    <div class="episode-grid"></div>
  `;

  const grid = section.querySelector(".episode-grid");
  filteredVideos.forEach((video) => {
    grid.appendChild(createEpisodeCard(video));
  });

  dom.library.appendChild(section);

  if (filteredVideos.length === 0) {
    grid.innerHTML = `
      <div class="empty">
        No encontre capitulos con ese filtro.
      </div>
    `;
  }
}

function createBackButton() {
  const button = document.createElement("button");
  button.className = "series-chip active";
  button.textContent = "Volver al catalogo";
  button.addEventListener("click", goHome);
  return button;
}

function createShelfSection(title, countText) {
  const section = document.createElement("section");
  section.className = "series-section";
  section.innerHTML = `
    <div class="series-heading">
      <h2>${escapeHtml(title)}</h2>
      <span class="series-count">${escapeHtml(countText)}</span>
    </div>
    <div class="episode-row"></div>
  `;
  return section;
}

function createSeriesCard(serie) {
  const card = document.createElement("article");
  const firstVideo = serie.videos[0];
  const watchedCount = serie.videos.filter(isWatched).length;

  card.className = "series-card";
  card.innerHTML = `
    <div class="series-poster" style="background-image: linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.72)), url('${firstVideo.thumbnail}')">
      <span class="series-badge">${serie.videos.length} capitulo${serie.videos.length === 1 ? "" : "s"}</span>
    </div>
    <div class="card-body">
      <p class="card-title">${escapeHtml(serie.name)}</p>
      <p class="card-meta">${watchedCount} visto${watchedCount === 1 ? "" : "s"}</p>
    </div>
  `;

  card.addEventListener("click", () => openSeries(serie));
  return card;
}

function createContinueCard(video) {
  const card = createEpisodeCard(video);
  card.classList.add("continue-card");
  return card;
}

function matchesSeriesSearch(serie) {
  if (!state.query) return true;

  const text = `${serie.name} ${serie.videos.map((video) => video.title).join(" ")}`.toLowerCase();
  return text.includes(state.query);
}

function matchesSearch(video) {
  if (!state.query) return true;

  const text = `${video.seriesName} ${video.title} ${video.name}`.toLowerCase();
  return text.includes(state.query);
}

function createEpisodeCard(video) {
  const card = document.createElement("article");
  card.className = "episode-card";
  card.dataset.videoId = video.id;

  if (state.currentVideo?.id === video.id) {
    card.classList.add("active");
  }

  const episodeText = video.episodeNumber === 999999
    ? "Capitulo"
    : `Cap. ${video.episodeNumber}`;
  const watchedBadge = isWatched(video) ? `<span class="watched-badge">Visto</span>` : "";

  card.innerHTML = `
    <div class="thumb" style="background-image: linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.55)), url('${video.thumbnail}')">
      <span class="play-badge">Play</span>
      ${watchedBadge}
    </div>
    <div class="card-body">
      <p class="card-title">${escapeHtml(video.title)}</p>
      <p class="card-meta">${escapeHtml(video.seriesName)} · ${escapeHtml(episodeText)}</p>
    </div>
  `;

  card.addEventListener("click", () => {
    if (state.route.view !== "series" || state.route.seriesSlug !== video.seriesSlug) {
      window.location.hash = `#/serie/${encodeURIComponent(video.seriesSlug)}`;
      setTimeout(() => playVideo(video), 0);
      return;
    }

    playVideo(video);
  });

  return card;
}

function playVideo(video, keepScroll = false, options = {}) {
  state.currentVideo = video;

  if (state.playerMode === "native") {
    useNativeVideo(video);
  } else {
    useDriveIframe(video);
  }

  if (!options.skipHistory) {
    markWatched(video);
  }

  dom.nowPlayingSeries.textContent = video.seriesName;
  dom.nowPlayingTitle.textContent = video.title;

  const episodePart = video.episodeNumber === 999999 ? "" : `Capitulo ${video.episodeNumber}`;
  const sizePart = video.size ? ` · ${formatBytes(video.size)}` : "";
  const modePart = state.playerMode === "native" ? " · Reproductor nativo" : " · Drive preview";
  dom.nowPlayingMeta.textContent = `${episodePart}${sizePart}${modePart}`.replace(/^ · /, "") || "Video desde Google Drive";

  dom.hero.classList.remove("hidden");
  updateEpisodeControls();
  updateFullscreenButton();

  document.querySelectorAll(".episode-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.videoId === video.id);
  });

  if (state.route.view === "series") {
    renderWatchedBadges();
  }

  if (!keepScroll) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function useNativeVideo(video) {
  dom.playerShell.classList.remove("drive-mode");
  dom.playerShell.classList.add("native-mode");
  dom.player.removeAttribute("src");
  dom.player.classList.add("hidden");

  dom.nativePlayer.classList.remove("hidden");
  dom.nativePlayer.poster = video.thumbnail;

  const mediaUrl = getDriveMediaUrl(video.id);
  if (dom.nativePlayer.src !== mediaUrl) {
    dom.nativePlayer.src = mediaUrl;
    dom.nativePlayer.load();
  }
}

function useDriveIframe(video) {
  dom.playerShell.classList.remove("native-mode");
  dom.playerShell.classList.add("drive-mode");
  dom.nativePlayer.pause();
  dom.nativePlayer.removeAttribute("src");
  dom.nativePlayer.load();
  dom.nativePlayer.classList.add("hidden");

  dom.player.classList.remove("hidden");
  dom.player.src = getDrivePreviewUrl(video.id);
}

function stopPlayers() {
  dom.player.removeAttribute("src");
  dom.player.classList.add("hidden");
  dom.nativePlayer.pause();
  dom.nativePlayer.removeAttribute("src");
  dom.nativePlayer.load();
  dom.nativePlayer.classList.add("hidden");
  exitCinemaMode();
}

function playAdjacentEpisode(direction) {
  if (!state.currentVideo) return;

  const serie = findSeriesBySlug(state.currentVideo.seriesSlug);
  if (!serie) return;

  const currentIndex = serie.videos.findIndex((video) => video.id === state.currentVideo.id);
  const nextVideo = serie.videos[currentIndex + direction];

  if (nextVideo) {
    playVideo(nextVideo);
  }
}

function updateEpisodeControls() {
  if (!state.currentVideo) {
    dom.prevEpisodeBtn.disabled = true;
    dom.nextEpisodeBtn.disabled = true;
    return;
  }

  const serie = findSeriesBySlug(state.currentVideo.seriesSlug);
  const currentIndex = serie?.videos.findIndex((video) => video.id === state.currentVideo.id) ?? -1;

  dom.prevEpisodeBtn.disabled = currentIndex <= 0;
  dom.nextEpisodeBtn.disabled = !serie || currentIndex === -1 || currentIndex >= serie.videos.length - 1;
}

function updatePlayerModeButton() {
  if (!dom.togglePlayerBtn) return;

  dom.togglePlayerBtn.disabled = false;

  const currentLabel = state.playerMode === "native"
    ? "Movil nativo"
    : "Drive preview";

  const nextAction = state.playerMode === "native"
    ? "Usar Drive preview"
    : "Usar reproductor movil";

  dom.togglePlayerBtn.textContent = `${nextAction} · actual: ${currentLabel}`;
  updateFullscreenButton();
}

function updateFullscreenButton() {
  if (!dom.fullscreenBtn) return;

  const opensDrivePreview = state.playerMode === "drive" && isProbablyMobileOrTablet();
  dom.fullscreenBtn.textContent = opensDrivePreview ? "Abrir pantalla Drive" : "Pantalla completa";
}

async function enterBestFullscreen() {
  if (state.playerMode === "drive" && isProbablyMobileOrTablet() && state.currentVideo) {
    window.location.href = getDrivePreviewUrl(state.currentVideo.id);
    return;
  }

  const video = dom.nativePlayer;

  if (state.playerMode === "native" && video && !video.classList.contains("hidden")) {
    try {
      if (typeof video.webkitEnterFullscreen === "function") {
        video.webkitEnterFullscreen();
        return;
      }
    } catch (error) {
      console.warn("webkitEnterFullscreen fallo, probando alternativas.", error);
    }

    try {
      if (typeof video.requestFullscreen === "function") {
        await video.requestFullscreen();
        return;
      }
    } catch (error) {
      console.warn("requestFullscreen en video fallo, probando contenedor.", error);
    }
  }

  try {
    if (dom.playerShell.requestFullscreen) {
      await dom.playerShell.requestFullscreen();
      return;
    }

    if (dom.playerShell.webkitRequestFullscreen) {
      dom.playerShell.webkitRequestFullscreen();
      return;
    }
  } catch (error) {
    console.warn("Fullscreen del contenedor fallo, usando modo cine.", error);
  }

  enterCinemaMode();
}

function expandPlayer() {
  if (state.playerMode === "drive") {
    enterCinemaMode();
    return;
  }

  enterBestFullscreen();
}

function enterCinemaMode() {
  dom.playerShell.classList.add("cinema-mode");
  dom.exitCinemaBtn.classList.remove("hidden");
  document.body.classList.add("cinema-lock");
}

function exitCinemaMode() {
  dom.playerShell.classList.remove("cinema-mode");
  dom.exitCinemaBtn.classList.add("hidden");
  document.body.classList.remove("cinema-lock");
}

function syncFullscreenUI() {
  const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;

  if (!isFullscreen) {
    exitCinemaMode();
  }
}

function markWatched(video) {
  const entry = {
    id: video.id,
    watchedAt: Date.now()
  };

  state.watchHistory = [
    entry,
    ...state.watchHistory.filter((item) => item.id !== video.id)
  ].slice(0, 50);

  saveWatchHistory();
}

function isWatched(video) {
  return state.watchHistory.some((item) => item.id === video.id);
}

function getContinueVideos() {
  const seenSeries = new Set();
  const videos = [];

  for (const entry of state.watchHistory) {
    const video = state.flatVideos.find((item) => item.id === entry.id);

    if (!video || seenSeries.has(video.seriesSlug)) continue;

    seenSeries.add(video.seriesSlug);
    videos.push(video);

    if (videos.length >= 12) break;
  }

  return videos;
}

function loadWatchHistory() {
  try {
    const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(stored) ? stored.filter((item) => item?.id) : [];
  } catch {
    return [];
  }
}

function saveWatchHistory() {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(state.watchHistory));
  } catch {
    // Si el navegador bloquea localStorage, la app sigue funcionando sin historial.
  }
}

function renderWatchedBadges() {
  document.querySelectorAll(".episode-card").forEach((card) => {
    const video = state.flatVideos.find((item) => item.id === card.dataset.videoId);
    const thumb = card.querySelector(".thumb");

    if (!video || !thumb || thumb.querySelector(".watched-badge") || !isWatched(video)) return;

    const badge = document.createElement("span");
    badge.className = "watched-badge";
    badge.textContent = "Visto";
    thumb.appendChild(badge);
  });
}

function findSeriesBySlug(slug) {
  return state.series.find((serie) => serie.slug === slug);
}

function getDrivePreviewUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

function getDriveViewUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function getDriveMediaUrl(fileId) {
  const key = encodeURIComponent(CONFIG.GOOGLE_API_KEY);
  return `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true&key=${key}`;
}

function getThumbnailUrl(fileId) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w700`;
}

function setStatus(message) {
  dom.statusBox.classList.remove("hidden", "error");
  dom.statusBox.textContent = message.trim();
}

function showTemporaryStatus(message) {
  dom.statusBox.classList.remove("hidden", "error");
  dom.statusBox.textContent = message.trim();

  setTimeout(() => {
    if (state.flatVideos.length > 0) {
      hideStatus();
    }
  }, 3800);
}

function setError(message) {
  dom.statusBox.classList.remove("hidden");
  dom.statusBox.classList.add("error");
  dom.statusBox.innerHTML = `
    <strong>Hay algo que revisar:</strong><br>
    ${escapeHtml(message.trim()).replace(/\n/g, "<br>")}
  `;
}

function hideStatus() {
  dom.statusBox.classList.add("hidden");
}

function resetUI() {
  state.series = [];
  state.flatVideos = [];
  state.currentVideo = null;
  state.activeSeries = null;

  stopPlayers();
  dom.hero.classList.add("hidden");
  dom.seriesNav.classList.add("hidden");
  dom.library.innerHTML = "";
  setStatus("Cargando biblioteca desde Google Drive...");
}

function formatFriendlyError(error) {
  const message = error?.message || String(error);

  if (message.includes("API key not valid")) {
    return `
      La API key no es valida.
      Revisa que la hayas pegado bien en config.js.
    `;
  }

  if (message.includes("API has not been used") || message.includes("disabled")) {
    return `
      La Google Drive API no esta activada para tu proyecto.
      Activala en Google Cloud Console y vuelve a probar.
    `;
  }

  if (message.includes("The caller does not have permission") || message.includes("insufficient")) {
    return `
      No tengo permiso para leer esa carpeta.
      Revisa que la carpeta y los videos esten compartidos como "Cualquier persona con el enlace puede ver".
      Tambien revisa que la API key permita usar Google Drive API.
    `;
  }

  return message;
}

function formatBytes(bytes) {
  if (!bytes || Number.isNaN(bytes)) return "";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }

  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function slugify(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "") || "serie";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
