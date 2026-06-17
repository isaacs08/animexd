const CONFIG = window.ANIMEXD_CONFIG || {};

const FOLDER_MIME = "application/vnd.google-apps.folder";
const VIDEO_EXTENSIONS = [".mp4", ".m4v", ".webm", ".mov", ".mkv"];

const state = {
  series: [],
  flatVideos: [],
  currentVideo: null,
  activeSeries: "all",
  query: ""
};

const dom = {
  appTitle: document.getElementById("appTitle"),
  statusBox: document.getElementById("statusBox"),
  hero: document.getElementById("hero"),
  player: document.getElementById("videoPlayer"),
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

  dom.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderLibrary();
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

  loadLibrary();
});

async function loadLibrary() {
  resetUI();

  try {
    validateConfig();

    setStatus("Cargando carpetas y capítulos desde Google Drive...");

    const rootItems = await listDriveChildren(CONFIG.ROOT_FOLDER_ID);
    const folders = rootItems
      .filter((item) => item.mimeType === FOLDER_MIME)
      .sort(byNaturalName);

    const directVideos = rootItems
      .filter(isVideoFile)
      .map((file) => toVideoItem(file, "Sin serie"))
      .sort(byEpisode);

    const series = [];

    if (CONFIG.SHOW_DIRECT_ROOT_FILES && directVideos.length > 0) {
      series.push({
        id: "direct-root-files",
        name: "Sin serie",
        folderId: CONFIG.ROOT_FOLDER_ID,
        videos: directVideos
      });
    }

    for (const folder of folders) {
      const children = await listDriveChildren(folder.id);
      const videos = children
        .filter(isVideoFile)
        .map((file) => toVideoItem(file, folder.name))
        .sort(byEpisode);

      if (videos.length > 0) {
        series.push({
          id: folder.id,
          name: folder.name,
          folderId: folder.id,
          videos
        });
      }
    }

    state.series = series.sort((a, b) => a.name.localeCompare(b.name, "es", { numeric: true }));
    state.flatVideos = state.series.flatMap((serie) => serie.videos);

    if (state.flatVideos.length === 0) {
      setError(`
        No encontré videos en la carpeta.
        Revisa que la carpeta principal tenga subcarpetas con archivos MP4
        y que todo esté compartido como "cualquier persona con el enlace puede ver".
      `);
      return;
    }

    hideStatus();
    renderSeriesNav();
    renderLibrary();
    playVideo(state.flatVideos[0]);
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

function toVideoItem(file, seriesName) {
  const cleanTitle = removeVideoExtension(file.name || "Sin título");
  const episodeNumber = extractEpisodeNumber(cleanTitle);

  return {
    id: file.id,
    name: file.name,
    title: cleanTitle,
    seriesName,
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
    /(?:ep|episodio|cap|capitulo|capítulo|chapter)[\s._-]*(\d{1,4})/i
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (match) return Number(match[1]);
  }

  const numbers = [...name.matchAll(/\d{1,4}/g)].map((match) => Number(match[0]));
  if (numbers.length === 0) return 999999;

  // Usualmente el último número del nombre es el capítulo.
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

function renderSeriesNav() {
  dom.seriesNav.innerHTML = "";

  const allButton = createChip("Todas", "all");
  dom.seriesNav.appendChild(allButton);

  for (const serie of state.series) {
    const chip = createChip(serie.name, serie.id);
    dom.seriesNav.appendChild(chip);
  }

  dom.seriesNav.classList.remove("hidden");
}

function createChip(label, value) {
  const button = document.createElement("button");
  button.className = "series-chip";
  button.textContent = label;
  button.dataset.series = value;

  if (state.activeSeries === value) {
    button.classList.add("active");
  }

  button.addEventListener("click", () => {
    state.activeSeries = value;

    document.querySelectorAll(".series-chip").forEach((chip) => {
      chip.classList.toggle("active", chip.dataset.series === value);
    });

    renderLibrary();
  });

  return button;
}

function renderLibrary() {
  dom.library.innerHTML = "";

  const filteredSeries = state.series
    .filter((serie) => state.activeSeries === "all" || serie.id === state.activeSeries)
    .map((serie) => ({
      ...serie,
      videos: serie.videos.filter(matchesSearch)
    }))
    .filter((serie) => serie.videos.length > 0);

  if (filteredSeries.length === 0) {
    dom.library.innerHTML = `
      <div class="empty">
        No encontré capítulos con ese filtro.
      </div>
    `;
    return;
  }

  for (const serie of filteredSeries) {
    const section = document.createElement("section");
    section.className = "series-section";
    section.id = `series-${slugify(serie.name)}`;

    section.innerHTML = `
      <div class="series-heading">
        <h2>${escapeHtml(serie.name)}</h2>
        <span class="series-count">${serie.videos.length} capítulo${serie.videos.length === 1 ? "" : "s"}</span>
      </div>
      <div class="episode-row"></div>
    `;

    const row = section.querySelector(".episode-row");

    for (const video of serie.videos) {
      row.appendChild(createEpisodeCard(video));
    }

    dom.library.appendChild(section);
  }
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
    ? "Capítulo"
    : `Cap. ${video.episodeNumber}`;

  card.innerHTML = `
    <div class="thumb" style="background-image: linear-gradient(180deg, rgba(0,0,0,0.04), rgba(0,0,0,0.55)), url('${video.thumbnail}')">
      <span class="play-badge">▶</span>
    </div>
    <div class="card-body">
      <p class="card-title">${escapeHtml(video.title)}</p>
      <p class="card-meta">${escapeHtml(episodeText)}</p>
    </div>
  `;

  card.addEventListener("click", () => playVideo(video));

  return card;
}

function playVideo(video) {
  state.currentVideo = video;

  dom.player.src = getDrivePreviewUrl(video.id);
  dom.nowPlayingSeries.textContent = video.seriesName;
  dom.nowPlayingTitle.textContent = video.title;

  const episodePart = video.episodeNumber === 999999 ? "" : `Capítulo ${video.episodeNumber}`;
  const sizePart = video.size ? ` · ${formatBytes(video.size)}` : "";
  dom.nowPlayingMeta.textContent = `${episodePart}${sizePart}`.replace(/^ · /, "") || "Video desde Google Drive";

  dom.hero.classList.remove("hidden");

  document.querySelectorAll(".episode-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.videoId === video.id);
  });

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function getDrivePreviewUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/preview`;
}

function getDriveViewUrl(fileId) {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

function getThumbnailUrl(fileId) {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w700`;
}

function setStatus(message) {
  dom.statusBox.classList.remove("hidden", "error");
  dom.statusBox.textContent = message.trim();
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
  state.activeSeries = "all";

  dom.player.removeAttribute("src");
  dom.hero.classList.add("hidden");
  dom.seriesNav.classList.add("hidden");
  dom.library.innerHTML = "";
  setStatus("Cargando biblioteca desde Google Drive...");
}

function formatFriendlyError(error) {
  const message = error?.message || String(error);

  if (message.includes("API key not valid")) {
    return `
      La API key no es válida.
      Revisa que la hayas pegado bien en config.js.
    `;
  }

  if (message.includes("API has not been used") || message.includes("disabled")) {
    return `
      La Google Drive API no está activada para tu proyecto.
      Actívala en Google Cloud Console y vuelve a probar.
    `;
  }

  if (message.includes("The caller does not have permission") || message.includes("insufficient")) {
    return `
      No tengo permiso para leer esa carpeta.
      Revisa que la carpeta y los videos estén compartidos como "Cualquier persona con el enlace puede ver".
      También revisa que la API key permita usar Google Drive API.
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
    .replace(/(^-|-$)+/g, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
