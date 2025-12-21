(function () {
  "use strict";

  const JSON_URL = "data/videos.json";
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
  let allVideos = [];
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

  function progressGlyph(state) {
    if (state === 2) return "▮▮▮";
    if (state === 1) return "▮▯▯";
    return "▯▯▯";
  }

  function starsGlyph(stars) {
    const s = clamp(Number(stars) || 0, 0, 5);
    return "★".repeat(s) + "☆".repeat(5 - s);
  }

  function parseDate(dateStr) {
    const t = Date.parse(dateStr);
    return Number.isFinite(t) ? t : 0;
  }

  function getFilterList(videos, filter) {
    const list = [...videos];

    // дефолтная сортировка
    list.sort((a, b) => (parseDate(b.dateAdded) - parseDate(a.dateAdded)) || (b.id - a.id));

    if (filter === "new") return list;

    if (filter === "starter") {
      return list.filter(v => Number(v.state) === 1);
    }

    if (filter === "fav") {
      // сейчас «избранное» = высокие звёзды; позже можно заменить на отдельный флаг
      return list.filter(v => Number(v.stars) >= 4);
    }

    if (filter === "trend") {
      return list
        .slice()
        .sort((a, b) => (Number(b.stars) - Number(a.stars)) || (parseDate(b.dateAdded) - parseDate(a.dateAdded)));
    }

    return list;
  }

  function applySearch(list, q) {
    const qq = q.trim().toLowerCase();
    if (!qq) return list;
    return list.filter(v => String(v.title || "").toLowerCase().includes(qq));
  }

  // -------------------- rendering --------------------

  function setCounters() {
    const base = allVideos;
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

  function cardHTML(video) {
    const title = escapeHtml(video.title ?? "(без названия)");
    const phrases = Number(video.phraseCount) || 0;
    const diff = clamp(Number(video.difficulty) || 1, 1, 3);
    const state = clamp(Number(video.state) || 0, 0, 2);
    const stars = clamp(Number(video.stars) || 0, 0, 5);

    // ВАЖНО: здесь ссылка на страницу плеера.
    // Если у тебя другой маршрут — поменяй.
    const href = `video.html?id=${encodeURIComponent(video.id)}`;
    const img = thumbUrl(video);

    return `
      <article class="video-card" data-id="${video.id}">
        <a class="thumb" href="${href}" aria-label="Открыть видео: ${title}">
          <img src="${img}" alt="" loading="lazy" referrerpolicy="no-referrer" />
          <span class="chip top-right">${phrases} фраз</span>
          <span class="chip top-left">Ур. ${diff}</span>
          <span class="thumb-overlay"></span>
          <span class="title">${title}</span>
        </a>
        <div class="meta-row">
          <div class="meta-left">
            <span class="metric" title="Прогресс">${progressGlyph(state)}</span>
          </div>
          <div class="meta-right">
            <span class="stars" aria-label="Оценка: ${stars} из 5">${starsGlyph(stars)}</span>
          </div>
        </div>
      </article>
    `;
  }

  function render(reset = false) {
    const base = getFilterList(allVideos, activeFilter);
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

    // Автоподгрузка при прокрутке до низа
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
      const res = await fetch(JSON_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error("videos.json должен быть массивом");

      allVideos = data;
      setCounters();
      bindEvents();
      setActiveTab("new");
      render(true);
    } catch (err) {
      console.error("Не удалось загрузить videos.json", err);
      els.grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-title">Ошибка загрузки каталога</div>
          <div class="muted">Проверь, что файл <b>videos.json</b> лежит рядом с этой страницей и сервер отдаёт его без блокировок.</div>
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
