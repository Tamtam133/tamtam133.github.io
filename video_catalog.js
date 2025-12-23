(function () {
  "use strict";

  // -------------------- источники данных --------------------
  const CATALOG_URL = "data/videos_catalog.json";

  // -------------------- локальные данные пользователя --------------------
  // Храним только прогресс/закладки. (Оценки/звёзды удалены.)
  const LS_PROGRESS = "video_progress_v1"; // { version, updatedAt, videos: { [id]: { state, bookmarked } } }

  const PAGE_SIZE = 12;

  const els = {
    grid: document.getElementById("videoGrid"),
    tabs: Array.from(document.querySelectorAll(".tab")),
    counters: Array.from(document.querySelectorAll("[data-counter]")),
    searchWrap: document.querySelector(".search"),
    search: document.getElementById("videoSearch"),
    clearSearch: document.getElementById("clearSearchBtn"),
    loadMore: document.getElementById("loadMoreBtn"),
    sentinel: document.getElementById("loadSentinel"),

    // dropdown сложности
    diffDropdown: document.getElementById("diffDropdown"),
    diffToggle: document.getElementById("diffToggle"),
    diffPanel: document.getElementById("diffPanel"),

    difficultyChecks: Array.from(document.querySelectorAll(".diff-check")),
  };

  /** @type {Array<any>} */
  let catalog = [];
  /** @type {{version:number, updatedAt:string, videos: Record<string, {state:number, bookmarked:number}>}} */
  let progress = loadProgress();

  let activeFilter = "new";
  let query = "";
  let cursor = 0;

  // сложности, включённые в фильтр (1-3)
  let activeDifficulties = new Set([1, 2, 3]);

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

  function saveProgress() {
    progress.updatedAt = todayStr();
    localStorage.setItem(LS_PROGRESS, JSON.stringify(progress));
  }

  function getUserRow(videoId) {
    const key = String(videoId);
    const row = progress.videos[key];
    return {
      state: clamp(Number(row?.state) || 0, 0, 2),
      bookmarked: row?.bookmarked ? 1 : 0,
    };
  }

  function setUserRow(videoId, patch) {
    const key = String(videoId);
    const prev = getUserRow(videoId);
    progress.videos[key] = { ...prev, ...patch };
    saveProgress();
  }

  function parseDate(dateStr) {
    const t = Date.parse(dateStr);
    return Number.isFinite(t) ? t : 0;
  }

  // -------------------- dropdown сложности --------------------

  function openDiff() {
    if (!els.diffDropdown) return;
    els.diffDropdown.classList.add("is-open");
    els.diffToggle?.setAttribute("aria-expanded", "true");
    els.diffPanel?.setAttribute("aria-hidden", "false");
  }

  function closeDiff() {
    if (!els.diffDropdown) return;
    els.diffDropdown.classList.remove("is-open");
    els.diffToggle?.setAttribute("aria-expanded", "false");
    els.diffPanel?.setAttribute("aria-hidden", "true");
  }

  function toggleDiff() {
    const isOpen = els.diffDropdown?.classList.contains("is-open");
    if (isOpen) closeDiff();
    else openDiff();
  }

  // -------------------- фильтры/поиск/сортировки --------------------

  function applyDifficulty(list) {
    if (!activeDifficulties || activeDifficulties.size === 0) return list;
    return list.filter(v => activeDifficulties.has(clamp(Number(v.difficulty) || 1, 1, 3)));
  }

  function enrich(video) {
    const user = getUserRow(video.id);
    return {
      ...video,
      userState: user.state,
      userBookmarked: user.bookmarked,
    };
  }

  function applySearch(list, q) {
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter(v => String(v.title || "").toLowerCase().includes(qq));
  }

  function getFilterList(list, filter) {
    const enriched = list.map(enrich);

    enriched.sort((a, b) => (parseDate(b.dateAdded) - parseDate(a.dateAdded)) || (b.id - a.id));

    if (filter === "new") return enriched;

    if (filter === "starter") {
      return enriched.filter(v => Number(v.userState) === 1);
    }

    if (filter === "fav") {
      return enriched.filter(v => Number(v.userBookmarked) === 1);
    }

    return enriched;
  }

  // -------------------- rendering --------------------

  function setCounters() {
    const base = catalog;
    const counts = {
      new: applyDifficulty(getFilterList(base, "new")).length,
      starter: applyDifficulty(getFilterList(base, "starter")).length,
      fav: applyDifficulty(getFilterList(base, "fav")).length,
    };

    els.counters.forEach(el => {
      const key = el.getAttribute("data-counter");
      el.textContent = String(counts[key] ?? 0);
    });
  }

  function render(reset = false) {
    const base = applyDifficulty(getFilterList(catalog, activeFilter));
    const filtered = applySearch(base, query);

    if (reset) {
      cursor = 0;
      els.grid.innerHTML = "";
    }

    const slice = filtered.slice(cursor, cursor + PAGE_SIZE);
    cursor += slice.length;

    if (slice.length) {
      const html = slice.map(v => window.VideoCard.cardHTML(v)).join("");
      els.grid.insertAdjacentHTML("beforeend", html);
    }

    if (filtered.length === 0) {
      els.grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">Ничего не найдено</div>
          <div class="muted">Попробуй другой запрос или выбери другую категорию.</div>
        </div>
      `;
      els.loadMore.style.display = "none";
      return;
    }

    const hasMore = cursor < filtered.length;
    els.loadMore.style.display = hasMore ? "inline-flex" : "none";
  }

  // -------------------- events --------------------

  function setActiveTab(filter) {
    activeFilter = filter;
    els.tabs.forEach(t => {
      const isActive = t.dataset.filter === filter;
      t.classList.toggle("is-active", isActive);
      t.setAttribute("aria-selected", isActive ? "true" : "false");
    });
  }

  function syncSearchUI() {
    const has = Boolean(els.search && els.search.value.trim());
    if (els.searchWrap) els.searchWrap.classList.toggle("has-value", has);
    if (els.clearSearch) els.clearSearch.disabled = !has;
  }

  function resetSearchAndFilters() {
    if (els.search) els.search.value = "";
    query = "";
    setActiveTab("new");
    render(true);
    syncSearchUI();
  }

  function syncDifficultyFromUI(changedEl) {
    if (!els.difficultyChecks || els.difficultyChecks.length === 0) {
      activeDifficulties = new Set([1, 2, 3]);
      return;
    }

    let selected = els.difficultyChecks
      .filter(c => c.checked)
      .map(c => clamp(Number(c.value) || 1, 1, 3));

    // не даём снять все галочки (чтобы не было пустого каталога "по ошибке")
    if (selected.length === 0 && changedEl) {
      changedEl.checked = true;
      selected = [clamp(Number(changedEl.value) || 1, 1, 3)];
    }

    activeDifficulties = new Set(selected);
  }

  function handleGridClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    // чтобы кнопка не триггерила переходы/клики вокруг
    e.preventDefault();
    e.stopPropagation();

    const action = btn.getAttribute("data-action");
    const videoId = Number(btn.getAttribute("data-id"));
    if (!videoId) return;

    if (action === "bookmark") {
      const row = getUserRow(videoId);
      setUserRow(videoId, { bookmarked: row.bookmarked ? 0 : 1 });
      setCounters();
      render(true);
      return;
    }
  }

  function bindEvents() {
    // dropdown toggle
    els.diffToggle?.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDiff();
    });

    els.diffPanel?.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    // закрытие дропдауна по клику вне
    document.addEventListener("click", (e) => {
      if (!els.diffDropdown) return;
      if (!els.diffDropdown.classList.contains("is-open")) return;

      const inside = e.target.closest("#diffDropdown");
      if (!inside) closeDiff();
    });

    // закрытие по ESC
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDiff();
    });

    // фильтр сложности
    syncDifficultyFromUI();
    els.difficultyChecks.forEach(chk => {
      chk.addEventListener("change", () => {
        syncDifficultyFromUI(chk);
        setCounters();
        render(true);
      });
    });

    // табы
    els.tabs.forEach(t => {
      t.addEventListener("click", () => {
        setActiveTab(t.dataset.filter);
        render(true);
      });
    });

    // поиск
    els.search.addEventListener("input", () => {
      query = els.search.value;
      render(true);
      syncSearchUI();
    });

    els.search.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        resetSearchAndFilters();
      }
    });

    if (els.clearSearch) {
      els.clearSearch.addEventListener("click", () => {
        resetSearchAndFilters();
        els.search?.focus();
      });
    }

    // подгрузка
    els.loadMore.addEventListener("click", () => render(false));
    els.grid.addEventListener("click", handleGridClick);

    if ("IntersectionObserver" in window && els.sentinel) {
      const io = new IntersectionObserver(
        (entries) => {
          const en = entries[0];
          if (!en.isIntersecting) return;
          if (els.loadMore.style.display === "none") return;
          render(false);
        },
        { root: null, rootMargin: "200px 0px", threshold: 0 }
      );
      io.observe(els.sentinel);
    }

    syncSearchUI();
  }

  // -------------------- init --------------------

  async function init() {
    if (!window.VideoCard || typeof window.VideoCard.cardHTML !== "function") {
      throw new Error("Не подключен video_card.js (VideoCard.cardHTML не найден)");
    }

    let cat;
    try {
      const url = new URL(CATALOG_URL, window.location.href).toString();
      const resCat = await fetch(url, { cache: "no-store" });

      if (!resCat.ok) {
        throw new Error(`HTTP ${resCat.status} ${resCat.statusText}`);
      }

      cat = await resCat.json();
      if (!Array.isArray(cat)) throw new Error("videos_catalog.json должен быть массивом");
    } catch (err) {
      console.error("Каталог не загрузился:", err);
      els.grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Ошибка загрузки каталога</div>
        <div class="muted">
          Не удалось загрузить <b>${escapeHtml(CATALOG_URL)}</b><br>
          Причина: <b>${escapeHtml(err?.message || String(err))}</b>
        </div>
      </div>
    `;
      els.loadMore.style.display = "none";
      return;
    }

    try {
      catalog = cat;
      progress = loadProgress();

      setCounters();
      bindEvents();
      setActiveTab("new");
      render(true);
    } catch (err) {
      console.error("Ошибка инициализации UI:", err);
      els.grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-title">Ошибка интерфейса</div>
        <div class="muted">
          Каталог загрузился, но упал интерфейс.<br>
          Причина: <b>${escapeHtml(err?.message || String(err))}</b>
        </div>
      </div>
    `;
      els.loadMore.style.display = "none";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();