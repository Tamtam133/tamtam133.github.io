/* video_card.js */
(function () {
  "use strict";

  // ---------- utils ----------
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

  function phraseWord(n) {
    const abs = Math.abs(Number(n)) || 0;
    const mod10 = abs % 10;
    const mod100 = abs % 100;

    if (mod10 === 1 && mod100 !== 11) return "фраза";
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return "фразы";
    return "фраз";
  }

  function phraseLabel(n) {
    return `${n} ${phraseWord(n)}`;
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

  // ---------- icons ----------
  const bmSvgOff = `
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="m480-240-168 72q-40 17-76-6.5T200-241v-519q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v519q0 43-36 66.5t-76 6.5l-168-72Zm0-88 200 86v-518H280v518l200-86Zm0-432H280h400-200Z"/>
    </svg>
  `;

  const bmSvgOn = `
    <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="m480-240-168 72q-40 17-76-6.5T200-241v-519q0-33 23.5-56.5T280-840h400q33 0 56.5 23.5T760-760v519q0 43-36 66.5t-76 6.5l-168-72Z"/>
    </svg>
  `;

  // ---------- main renderer ----------
  function cardHTML(v) {
    const title = escapeHtml(v.title ?? "(без названия)");
    const phrases = Number(v.phraseCount) || 0;
    const diff = clamp(Number(v.difficulty) || 1, 1, 3);

    const bookmarked = v.userBookmarked ? 1 : 0;
    const bmLabel = bookmarked ? "Убрать из закладок" : "В закладки";
    const bmSvg = bookmarked ? bmSvgOn : bmSvgOff;

    const href = `video.html?id=${encodeURIComponent(v.id)}`;
    const img = thumbUrl(v);

    return `
      <article class="video-card" data-id="${v.id}">
        <a class="thumb" href="${href}" aria-label="Открыть видео: ${title}">
          <img src="${img}" alt="" loading="lazy" referrerpolicy="no-referrer" />
          <span class="chip top-right">${phraseLabel(phrases)}</span>

          <span class="thumb-overlay"></span>
          <span class="title">${title}</span>
        </a>

        <div class="meta-row">
          <div class="meta-left">
            <span class="meta-diff" title="Сложность" aria-label="Сложность: уровень ${diff}">
              <span class="diff-bars diff-${diff} compact" aria-hidden="true">
                <span></span><span></span><span></span>
              </span>
            </span>
          </div>

          <button class="bookmark-btn ${bookmarked ? "is-on" : ""}"
            type="button"
            data-action="bookmark"
            data-id="${v.id}"
            aria-label="${bmLabel}"
            aria-pressed="${bookmarked ? "true" : "false"}"
            title="${bmLabel}">
            ${bmSvg}
          </button>
        </div>
      </article>
    `;
  }

  // Экспорт в глобал (без модулей/сборки)
  window.VideoCard = Object.freeze({
    cardHTML,
    phraseLabel,
    phraseWord
  });
})();
