(function () {
  "use strict";

  // -------------------- источники данных --------------------
  const CATALOG_URL = "data/videos_catalog.json";
  const RATINGS_URL = "data/ratings_agg.json";

  // -------------------- локальные данные пользователя --------------------
  const LS_PROGRESS = "video_progress_v1"; // { version, updatedAt, videos: { [id]: { state, bookmarked, myRating } } }

  const PAGE_SIZE = 12;

  const els = {
    grid: document.getElementById("videoGrid"),
    tabs: Array.from(document.querySelectorAll(".tab")),
    counters: Array.from(document.querySelectorAll("[data-counter]")),
    search: document.getElementById("videoSearch"),
    reset: document.getElementById("resetBtn"),
    loadMore: document.getElementById("loadMoreBtn"),
    sentinel: document.getElementById("loadSentinel"),
    status: document.getElementById("statusLine"),
  };

  /** @type {Array<any>} */
  let catalog = [];
  /** @type {Record<string, {sum:number,count:number}>} */
  let ratingsAgg = {};
  /** @type {{version:number, updatedAt:string, videos: Record<string, {state:number, bookmarked:number, myRating:number}>}} */
  let progress = loadProgress();

  let activeFilter = "new";
  let query = "";
  let cursor = 0;

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
      myRating: clamp(Number(row?.myRating) || 0, 0, 5),
    };
  }

  function setUserRow(videoId, patch) {
    const key = String(videoId);
    const prev = getUserRow(videoId);
    progress.videos[key] = { ...prev, ...patch };
    saveProgress();
  }

  function getYoutubeId(url) {
    try {
      const u = new URL(url);
      const v = u.searchParams.get("v");
      if (v) return v;
      if (u.hostname.includes("youtu.be")) {
        const id = u.pathname.replaceAll("/", "").trim();
        return id || null;
      }
      const parts = u.pathname.split("/").filter(Boolean);
      const embedIdx = parts.indexOf("embed");
      if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
      return null;
    } catch {
      return null;
    }
  }

  function thumbUrl(video) {
    const id = getYoutubeId(video.youtubeUrl);
    return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "images/video_back.png";
  }

    function parseDate(dateStr) {
    const t = Date.parse(dateStr);
    return Number.isFinite(t) ? t : 0;
  }

  function progressGlyph(state) {
    if (state === 2) return "▮▮▮";
    if (state === 1) return "▮▯▯";
    return "▯▯▯";
  }

  function avgFrom(sum, count) {
    if (!count) return 0;
    return sum / count;
  }

    function effectiveAgg(videoId) {
    const key = String(videoId);
    const base = ratingsAgg[key] || { sum: 0, count: 0 };
    const me = getUserRow(videoId).myRating;
    if (me > 0) return { sum: base.sum + me, count: base.count + 1 };
    return base;
  }

  function starsButtonsHTML(videoId, myRating, avg) {
    const rounded = clamp(Math.round(avg), 0, 5);
    const parts = [];
    for (let i = 1; i <= 5; i++) {
      const isOn = i <= rounded;
      const isMine = i <= myRating && myRating > 0;
      parts.push(
        `<button class="star-btn ${isOn ? "is-on" : ""} ${isMine ? "is-mine" : ""}" ` +
        `type="button" data-action="rate" data-id="${videoId}" data-star="${i}" ` +
        `aria-label="Поставить ${i} звёзд">★</button>`
      );
    }
    parts.push(
      `<button class="star-clear" type="button" data-action="clear-rate" data-id="${videoId}" aria-label="Снять оценку">✕</button>`
    );
    return `<div class="stars-ctrl" title="Средняя оценка: ${avg.toFixed(2)}">${parts.join("")}</div>`;
  }

  // -------------------- фильтры/поиск/сортировки --------------------

  function enrich(video) {
    const user = getUserRow(video.id);
    const eff = effectiveAgg(video.id);
    const avg = avgFrom(eff.sum, eff.count);

    return {
      ...video,
      userState: user.state,
      userBookmarked: user.bookmarked,
      userMyRating: user.myRating,
      ratingAvg: avg,
      ratingCount: eff.count,
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

    if (filter === "trend") {
      return enriched
        .slice()
        .sort((a, b) =>
          (b.ratingAvg - a.ratingAvg) ||
          (b.ratingCount - a.ratingCount) ||
          (parseDate(b.dateAdded) - parseDate(a.dateAdded))
        );
    }

    return enriched;
  }

  // -------------------- rendering --------------------

  function setCounters() {
    const base = catalog;
    const counts = {
      new: getFilterList(base, "new").length,
      trend: getFilterList(base, "trend").length,
      starter: getFilterList(base, "starter").length,
      fav: getFilterList(base, "fav").length,
    };

    els.counters.forEach(el => {
      const key = el.getAttribute("data-counter");
      el.textContent = String(counts[key] ?? 0);
    });
  }

  function cardHTML(v) {
    const title = escapeHtml(v.title ?? "(без названия)");
    const phrases = Number(v.phraseCount) || 0;
    const diff = clamp(Number(v.difficulty) || 1, 1, 3);
    const state = clamp(Number(v.userState) || 0, 0, 2);

    const bookmarked = v.userBookmarked ? 1 : 0;
    const myRating = clamp(Number(v.userMyRating) || 0, 0, 5);
    const avg = Number(v.ratingAvg) || 0;
    const count = Number(v.ratingCount) || 0;

    const href = `video.html?id=${encodeURIComponent(v.id)}`;
    const img = thumbUrl(v);

    const bmLabel = bookmarked ? "Убрать из закладок" : "В закладки";
    const bmGlyph = bookmarked ? "🔖" : "📑";

    return `
      <article class="video-card" data-id="${v.id}">
        <a class="thumb" href="${href}" aria-label="Открыть видео: ${title}">
          <img src="${img}" alt="" loading="lazy" referrerpolicy="no-referrer" />
          <span class="chip top-right">${phrases} фраз</span>
          <span class="chip top-left">Ур. ${diff}</span>

          <button class="bookmark-btn ${bookmarked ? "is-on" : ""}"
            type="button"
            data-action="bookmark"
            data-id="${v.id}"
            aria-label="${bmLabel}"
            title="${bmLabel}">
            ${bmGlyph}
          </button>

          <span class="thumb-overlay"></span>
          <span class="title">${title}</span>
        </a>

        <div class="meta-row">
          <div class="meta-left">
            <span class="metric" title="Прогресс">${progressGlyph(state)}</span>
            <span class="muted" title="Оценок: ${count}">(${count})</span>
          </div>
          <div class="meta-right">
            ${starsButtonsHTML(v.id, myRating, avg)}
          </div>
        </div>
      </article>
    `;
  }

  function render(reset = false) {
    const base = getFilterList(catalog, activeFilter);
    const filtered = applySearch(base, query);

    if (reset) {
      cursor = 0;
      els.grid.innerHTML = "";
    }

    const slice = filtered.slice(cursor, cursor + PAGE_SIZE);
    cursor += slice.length;

    if (slice.length) {
      const html = slice.map(cardHTML).join("");
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
      els.status.textContent = "";
      return;
    }

    const hasMore = cursor < filtered.length;
    els.loadMore.style.display = hasMore ? "inline-flex" : "none";

    const shown = Math.min(cursor, filtered.length);
    els.status.textContent = `Показано ${shown} из ${filtered.length}`;
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

    function handleGridClick(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

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

    if (action === "rate") {
      const star = clamp(Number(btn.getAttribute("data-star")) || 0, 1, 5);
      setUserRow(videoId, { myRating: star });
      setCounters();
      render(true);
      return;
    }

    if (action === "clear-rate") {
      setUserRow(videoId, { myRating: 0 });
      setCounters();
      render(true);
      return;
    }
  }

  function bindEvents() {
    els.tabs.forEach(t => {
      t.addEventListener("click", () => {
        setActiveTab(t.dataset.filter);
        render(true);
      });
    });

    els.search.addEventListener("input", () => {
      query = els.search.value;
      render(true);
    });

    els.reset.addEventListener("click", () => {
      els.search.value = "";
      query = "";
      setActiveTab("new");
      render(true);
    });

    els.loadMore.addEventListener("click", () => render(false));
    els.grid.addEventListener("click", handleGridClick);

    if ("IntersectionObserver" in window && els.sentinel) {
      const io = new IntersectionObserver(
        (entries) => {
          const e = entries[0];
          if (!e.isIntersecting) return;
          if (els.loadMore.style.display === "none") return;
          render(false);
        },
        { root: null, rootMargin: "200px 0px", threshold: 0 }
      );
      io.observe(els.sentinel);
    }
  }

  // -------------------- init --------------------

  async function init() {
    try {
      const [resCat, resAgg] = await Promise.all([
        fetch(CATALOG_URL, { cache: "no-store" }),
        fetch(RATINGS_URL, { cache: "no-store" }),
      ]);

      if (!resCat.ok) throw new Error(`Каталог: HTTP ${resCat.status}`);
      if (!resAgg.ok) throw new Error(`Рейтинги: HTTP ${resAgg.status}`);

      const cat = await resCat.json();
      const agg = await resAgg.json();

      if (!Array.isArray(cat)) throw new Error("videos_catalog.json должен быть массивом");
      if (!agg || typeof agg !== "object") throw new Error("ratings_agg.json должен быть объектом");

      catalog = cat;
      ratingsAgg = agg;

      progress = loadProgress();

      setCounters();
      bindEvents();
      setActiveTab("new");
      render(true);
    } catch (err) {
      console.error("Не удалось загрузить каталог", err);
      els.grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">Ошибка загрузки каталога</div>
          <div class="muted">
            Проверь пути и наличие файлов:
            <b>${escapeHtml(CATALOG_URL)}</b> и <b>${escapeHtml(RATINGS_URL)}</b>.
          </div>
        </div>
      `;
      els.loadMore.style.display = "none";
      els.status.textContent = "";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
