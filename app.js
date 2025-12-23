(function () {
  "use strict";

  // --- откуда берём данные ---
  const CATALOG_URL = "data/videos_catalog.json";

  // --- пользовательские данные (закладки/прогресс) ---
  const LS_PROGRESS = "video_progress_v1"; // { version, updatedAt, videos: { [id]: { state, bookmarked } } }

  const els = {
    track: document.getElementById("latestTrack"),
    empty: document.getElementById("homeEmpty"),
    carousel: document.getElementById("latestCarousel"),
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

      const updated = latestListRef.map(v => enrich(progress, v));
      renderLatest(updated);
    }
  }

  // -------------------- carousel auto-scroll (hover edges) --------------------

  function setupHoverAutoScroll(track, carousel) {
    if (!track || !carousel) return;

    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const HOT_ZONE = 72;
    const MIN_SPEED = 4;
    const MAX_SPEED = 22;

    let dir = 0;
    let speed = 0;
    let raf = 0;


    function maxScroll() {
      return Math.max(0, track.scrollWidth - track.clientWidth);
    }

    function updateCanClasses() {
      const max = maxScroll();
      const left = track.scrollLeft;

      const canLeft = left > EPS;
      const canRight = left < (max - EPS);

      carousel.classList.toggle("can-left", canLeft);
      carousel.classList.toggle("can-right", canRight);

      if (!canLeft) carousel.classList.remove("is-scroll-left");
      if (!canRight) carousel.classList.remove("is-scroll-right");

      return { canLeft, canRight };
    }

    function stop() {
      dir = 0;
      speed = 0;
      carousel.classList.remove("is-scroll-left", "is-scroll-right");
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function tick() {
      raf = requestAnimationFrame(() => {
        if (!dir) {
          raf = 0;
          return;
        }

        track.scrollLeft += dir * speed;
        const { canLeft, canRight } = updateCanClasses();

        if ((dir < 0 && !canLeft) || (dir > 0 && !canRight)) {
          stop();
          return;
        }

        tick();
      });
    }

    function setDir(nextDir, nextSpeed) {
      if (reduceMotion) {
        nextDir = 0;
        nextSpeed = 0;
      }

      // если направление то же — просто обновим скорость и выйдем
      if (nextDir === dir) {
        speed = nextSpeed || 0;
        return;
      }

      dir = nextDir;
      speed = nextSpeed || 0;

      carousel.classList.toggle("is-scroll-left", dir < 0);
      carousel.classList.toggle("is-scroll-right", dir > 0);

      if (!dir) {
        if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
        return;
      }

      if (!raf) tick();
    }

    function handlePointerMove(e) {
      if (e.pointerType && e.pointerType !== "mouse") return;

      const rect = track.getBoundingClientRect();
      const x = e.clientX - rect.left;

      const { canLeft, canRight } = updateCanClasses();

      let next = 0;
      let nextSpeed = 0;

      // слева
      if (x < HOT_ZONE && canLeft) {
        next = -1;

        // dist = насколько курсор далеко от самого края (0..HOT_ZONE)
        const dist = x;
        const t = 1 - clamp(dist / HOT_ZONE, 0, 1); // 0..1, где 1 = у самого края
        const k = t * t; // квадратичная кривая (мягко стартует, быстрее у края)
        nextSpeed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * k;
      }
      // справа
      else if (x > rect.width - HOT_ZONE && canRight) {
        next = 1;

        const dist = rect.width - x;
        const t = 1 - clamp(dist / HOT_ZONE, 0, 1);
        const k = t * t;
        nextSpeed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * k;
      }

      setDir(next, nextSpeed);

    }

    track.addEventListener("pointerenter", updateCanClasses);
    track.addEventListener("pointermove", handlePointerMove);
    track.addEventListener("pointerleave", stop);

    track.addEventListener("scroll", () => {
      updateCanClasses();
      const max = maxScroll();
      if ((dir < 0 && track.scrollLeft <= EPS) || (dir > 0 && track.scrollLeft >= max - EPS)) {
        stop();
      }
    }, { passive: true });

    window.addEventListener("resize", updateCanClasses);

    updateCanClasses();
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

    const latestRaw = newestFirst(catalog).slice(0, 8);

    const latest = latestRaw.map(v => enrich(progress, v));

    renderLatest(latest);

    setupHoverAutoScroll(els.track, els.carousel);

    els.track.addEventListener("click", (e) => handleTrackClick(progress, latestRaw, e));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
