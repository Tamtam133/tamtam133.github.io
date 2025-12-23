(function () {
  "use strict";

  // --- откуда берём данные ---
  const CATALOG_URL = "data/videos_catalog.json";

  // --- пользовательские данные (закладки/прогресс) ---
  const LS_PROGRESS = "video_progress_v1"; // { version, updatedAt, videos: { [id]: { state, bookmarked } } }

  const els = {
    track: document.getElementById("latestTrack"),
    empty: document.getElementById("homeEmpty"),
  };

  // -------------------- utils --------------------

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function todayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function parseDate(dateStr) {
    const t = Date.parse(dateStr);
    return Number.isFinite(t) ? t : 0;
  }

  function loadProgress() {
    try {
      const raw = localStorage.getItem(LS_PROGRESS);
      if (!raw) return { version: 1, updatedAt: todayStr(), videos: {} };
      const obj = JSON.parse(raw);
      if (!obj || typeof obj !== "object") return { version: 1, updatedAt: todayStr(), videos: {} };
      if (!obj.videos || typeof obj.videos !== "object") obj.videos = {};
      if (!obj.version) obj.version = 1;
      if (!obj.updatedAt) obj.updatedAt = todayStr();
      return obj;
    } catch {
      return { version: 1, updatedAt: todayStr(), videos: {} };
    }
  }

  function saveProgress(progress) {
    progress.updatedAt = todayStr();
    localStorage.setItem(LS_PROGRESS, JSON.stringify(progress));
  }

  function getUserRow(progress, videoId) {
    const key = String(videoId);
    const row = progress.videos[key];
    return {
      state: clamp(Number(row?.state) || 0, 0, 2),
      bookmarked: row?.bookmarked ? 1 : 0,
    };
  }

  function setUserRow(progress, videoId, patch) {
    const key = String(videoId);
    const prev = getUserRow(progress, videoId);
    progress.videos[key] = { ...prev, ...patch };
    saveProgress(progress);
  }

  function enrich(progress, video) {
    const user = getUserRow(progress, video.id);
    return {
      ...video,
      userState: user.state,
      userBookmarked: user.bookmarked,
    };
  }

  function newestFirst(list) {
    // Сортировка как в каталоге: dateAdded desc, потом id desc
    return list.slice().sort((a, b) => (parseDate(b.dateAdded) - parseDate(a.dateAdded)) || ((b.id || 0) - (a.id || 0)));
  }

  // -------------------- rendering --------------------

  function showEmpty(msgHtml) {
    if (els.track) els.track.innerHTML = "";
    if (els.empty) {
      els.empty.style.display = "block";
      if (msgHtml) {
        els.empty.innerHTML = msgHtml;
      }
    }
  }

  function hideEmpty() {
    if (els.empty) els.empty.style.display = "none";
  }

  function renderLatest(list) {
    if (!els.track) return;

    if (!list || list.length === 0) {
      showEmpty();
      return;
    }

    hideEmpty();
    els.track.innerHTML = list.map(v => window.VideoCard.cardHTML(v)).join("");
  }

  // клики по закладкам внутри карточек
  function handleTrackClick(progress, latestListRef, e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    e.preventDefault();
    e.stopPropagation();

    const action = btn.getAttribute("data-action");
    const videoId = Number(btn.getAttribute("data-id"));
    if (!videoId) return;

    if (action === "bookmark") {
      const row = getUserRow(progress, videoId);
      setUserRow(progress, videoId, { bookmarked: row.bookmarked ? 0 : 1 });

      // обновляем текущий массив и перерисовываем 8 карточек,
      // чтобы иконка/aria-pressed сразу поменялись
      const updated = latestListRef.map(v => enrich(progress, v));
      renderLatest(updated);
    }
  }

  // -------------------- init --------------------

  async function init() {
    if (!els.track) return;

    if (!window.VideoCard || typeof window.VideoCard.cardHTML !== "function") {
      showEmpty(`
        <div class="empty-title">Ошибка</div>
        <div class="muted">Не подключен <b>video_card.js</b> (VideoCard.cardHTML не найден).</div>
      `);
      return;
    }

    let catalog;
    try {
      const url = new URL(CATALOG_URL, window.location.href).toString();
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      catalog = await res.json();
      if (!Array.isArray(catalog)) throw new Error("videos_catalog.json должен быть массивом");
    } catch (err) {
      console.error("Каталог не загрузился:", err);
      showEmpty(`
        <div class="empty-title">Ошибка загрузки</div>
        <div class="muted">
          Не удалось загрузить <b>${escapeHtml(CATALOG_URL)}</b><br>
          Причина: <b>${escapeHtml(err?.message || String(err))}</b>
        </div>
      `);
      return;
    }

    const progress = loadProgress();

    // берём 8 самых новых по dateAdded
    const latestRaw = newestFirst(catalog).slice(0, 8);

    // обогащаем пользовательскими данными (закладки)
    const latest = latestRaw.map(v => enrich(progress, v));

    renderLatest(latest);

    // обработчик кликов по закладке
    els.track.addEventListener("click", (e) => handleTrackClick(progress, latestRaw, e));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
