(() => {
    const $ = (id) => document.getElementById(id);
    const CATALOG_URL = "data/videos_catalog.json";
    let ytPlayer = null;
    let playerReady = false;
    let subtitles = [];
    let translations = [];
    let userSentence = [];
    let tickTimer = null;
    let snippetResumePuzzle = false;
    let nextIdx = 0;
    let activePuzzleIdx = null;
    let snippetMode = false;
    let snippetEnd = 0;
    let videoLoaded = false;
    let currentVideoId = null;
    let ratingWasAsked = false;
    let ratingModalOpen = false;
    let segmentMode = false;
    let segmentStart = 0;
    let segmentEnd = 0;
    let loggedSolved = new Set();
    let maskEnabled = false;
    let maskPos = "top";
    let maskHeight = 95;
    let maskOpacity = 0.78;
    let maskGap = 0;

    function readMaskControls() {
        maskEnabled = !!$("mask-on")?.checked;
        maskPos = $("mask-pos")?.value || "top";
        maskGap = Number($("mask-gap")?.value || 0);
        maskHeight = Number($("mask-h")?.value || 95);
        maskOpacity = Number($("mask-op")?.value || 78) / 100;
    }

    function applyTextMaskStyles() {
        const el = $("text-mask");
        if (!el) return;

        readMaskControls();

        el.classList.remove("top", "bottom");
        el.classList.add(maskPos === "bottom" ? "bottom" : "top");

        el.style.height = maskHeight + "px";
        el.style.background = `rgba(0,0,0,${maskOpacity})`;

        el.style.top = "";
        el.style.bottom = "";

        if (maskPos === "bottom") {
            el.style.bottom = maskGap + "px";
        } else {
            el.style.top = maskGap + "px";
        }
    }

    function setTextMaskVisible(show) {
        const el = $("text-mask");
        if (!el) return;

        readMaskControls();

        if (!maskEnabled || !show) {
            el.style.display = "none";
            return;
        }

        applyTextMaskStyles();
        el.style.display = "block";
    }

    function resetSubsPanel() {
        loggedSolved = new Set();
        const log = $("subs-log");
        if (log) log.innerHTML = "";

        const panel = log?.closest(".subs-panel");
        if (panel) panel.scrollTop = 0;
    }

    function scrollSubsPanelToBottom({ smooth = true } = {}) {
        const log = $("subs-log");
        const panel = log ? log.closest(".subs-panel") : null;
        if (!panel) return;

        const doScroll = () => {
            const top = panel.scrollHeight;
            if (smooth && panel.scrollTo) {
                panel.scrollTo({ top, behavior: "smooth" });
            } else {
                panel.scrollTop = top;
            }
        };

        doScroll();
        requestAnimationFrame(() => {
            doScroll();
            requestAnimationFrame(doScroll);
        });
        setTimeout(doScroll, 50);
    }


    function addSolvedLineToLog(idx, status /* 'done' | 'skipped' */) {
        if (idx == null || !subtitles[idx]) return;
        if (loggedSolved.has(idx)) return;
        loggedSolved.add(idx);

        const log = $("subs-log");
        if (!log) return;

        const s = subtitles[idx];
        const tr = getTranslationText(idx);

        const li = document.createElement("li");
        li.className = status === "skipped" ? "skipped" : "done";
        li.dataset.idx = String(idx);

        const wrap = document.createElement("div");
        wrap.className = "line-wrap";

        const srcSpan = document.createElement("div");
        srcSpan.textContent = s.text;
        wrap.appendChild(srcSpan);

        const trSpan = document.createElement("div");
        trSpan.className = "tr";
        trSpan.textContent = tr || "";
        trSpan.style.display = tr ? "block" : "none";
        wrap.appendChild(trSpan);

        li.appendChild(wrap);
        log.appendChild(li);

        scrollSubsPanelToBottom({ smooth: true });
    }

    function applyTranslationsToExistingLog() {
        const log = $("subs-log");
        if (!log) return;

        log.querySelectorAll("li[data-idx]").forEach(li => {
            const idx = Number(li.dataset.idx);
            const tr = getTranslationText(idx);
            const trEl = li.querySelector(".tr");

            if (!trEl) return;

            if (tr) {
                trEl.textContent = tr;
                trEl.style.display = "block";
            }
        });
    }

    function setPuzzlePanel(show) {
        $("puzzle-under").style.display = show ? "block" : "none";
    }

    function setVideoDim(show) {
        $("dim-overlay").style.display = show ? "block" : "none";
        $("puzzle-overlay").style.display = show ? "block" : "none";
        if (show) {
            setTextMaskVisible(false);
            setClickShield(true);
        } else {
            if (!snippetMode && !segmentMode) setClickShield(false);
        }
    }


    function timeToSeconds(timeStr) {
        timeStr = timeStr.replace('.', ',');
        const [h, m, s] = timeStr.split(':');
        const [sec, ms] = s.split(',');
        return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(sec) + parseInt(ms) / 1000;
    }

    function tokenizeText(text) {
        const noTags = text.replace(/<[^>]*>/g, ' ');
        const raw = noTags.replace(/\u00A0/g, ' ').split(/\s+/).filter(Boolean);
        const tokens = [];
        for (let tok of raw) {
            tok = tok
                .replace(/^[\p{P}\p{S}]+/u, '')
                .replace(/[\p{P}\p{S}]+$/u, '');

            if (!tok) continue;
            if (/^[\p{P}\p{S}]+$/u.test(tok)) continue;

            tokens.push(tok);
        }
        return tokens;
    }


    function parseSRT(data) {
        data = data
            .replace(/^\uFEFF/, '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .trim();

        const blocks = data.split(/\n{2,}/);
        const result = [];

        for (const block of blocks) {
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) continue;

            const timeLineIndex = lines.findIndex(l => l.includes('-->'));
            if (timeLineIndex === -1) continue;

            const timeLine = lines[timeLineIndex];
            const m = timeLine.match(
                /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
            );
            if (!m) continue;

            const start = timeToSeconds(m[1]);
            const end = timeToSeconds(m[2]);

            const textRaw = lines.slice(timeLineIndex + 1).join(' ');

            const displayText = textRaw
                .replace(/<[^>]*>/g, '')
                .replace(/\u00A0/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();

            const tokens = tokenizeText(textRaw);
            if (!tokens.length) continue;

            result.push({ start, end, text: displayText, tokens, solved: false });
        }

        result.sort((a, b) => a.start - b.start);

        alert(`Загружено фраз: ${result.length}`);
        return result;
    }

    function setClickShield(show) {
        const el = $("click-shield");
        if (!el) return;
        el.style.display = show ? "block" : "none";
    }

    function setRatingModalVisible(show) {
        const modal = $("rating-modal");
        if (!modal) return;

        modal.setAttribute("aria-hidden", show ? "false" : "true");
        ratingModalOpen = !!show;
        document.body.style.overflow = show ? "hidden" : "";
    }

    function paintStars(value) {
        const stars = document.querySelectorAll("#rating-stars .rate-star");
        stars.forEach(btn => {
            const v = Number(btn.dataset.value || 0);
            btn.classList.toggle("filled", v <= value);
        });

        const hint = $("rating-hint");
        if (hint) {
            hint.textContent = value ? `Твоя оценка: ${value}/5` : "Выбери от 1 до 5";
        }
    }

    function saveVideoRating(value) {
        try {
            const key = "video_ratings";
            const raw = localStorage.getItem(key);
            const obj = raw ? JSON.parse(raw) : {};

            const vid = currentVideoId || "unknown";
            obj[vid] = {
                rating: Number(value),
                ts: Date.now(),
                subtitlesCount: subtitles?.length ?? 0
            };

            localStorage.setItem(key, JSON.stringify(obj));
        } catch (e) {
            console.warn("Cannot save rating:", e);
        }
    }

    function showRatingModal() {
        if (ratingWasAsked) return;

        ratingWasAsked = true;
        paintStars(0);

        ytPlayer?.pauseVideo?.();

        setRatingModalVisible(true);
        setClickShield(true);

        setTimeout(() => {
            document.querySelector("#rating-stars .rate-star")?.focus?.();
        }, 0);
    }

    function closeRatingModalWithRating(value) {
        saveVideoRating(value);
        setRatingModalVisible(false);


        setFinishScreenVisible(false);
        segmentMode = false;
        showFinishActions();

        showFinishOverlay();
    }

    // ===== Экран завершения =====
    function setFinishScreenVisible(show) {
        finishScreenVisible = !!show;

        const finish = $("finish-actions");
        const result = $("result-area");
        const pool = $("words-pool");

        const listenBtn = $("listen-btn");
        const listen1Btn = $("listen-1s-btn");
        const skipBtn = $("skip-btn");

        if (finish) finish.style.display = show ? "block" : "none";
        if (result) result.style.display = show ? "none" : "";
        if (pool) pool.style.display = show ? "none" : "";

        if (listenBtn) listenBtn.style.display = show ? "none" : "";
        if (listen1Btn) listen1Btn.style.display = show ? "none" : "";
        if (skipBtn) skipBtn.style.display = show ? "none" : "";
    }

    function showFinishActions() {
        snippetMode = false;
        segmentMode = false;

        activePuzzleIdx = null;

        setPuzzlePanel(true);
        setVideoDim(false);
        setTextMaskVisible(false);
        setClickShield(false);

        setFinishScreenVisible(true);
        scrollToPuzzle();
    }

    function resetAllPuzzlesAndStart() {
        hideFinishOverlay();
        if (!subtitles.length) return;

        snippetMode = false;
        segmentMode = false;
        try { ytPlayer?.pauseVideo?.(); } catch (e) { }

        subtitles.forEach(s => s.solved = false);
        resetSubsPanel();
        nextIdx = 0;
        activePuzzleIdx = null;

        setFinishScreenVisible(false);

        openNextPuzzle({ autoplay: true });
    }

    function playSubtitlesSegment() {
        hideFinishOverlay();
        setPuzzlePanel(false);
        if (!ytPlayer?.seekTo || !subtitles.length) return;

        segmentStart = Math.max(0, subtitles[0].start || 0);
        segmentEnd = Math.max(segmentStart, subtitles[subtitles.length - 1].end || segmentStart);

        snippetMode = false;
        activePuzzleIdx = null;

        setVideoDim(false);
        setClickShield(true);

        setTextMaskVisible(true);

        segmentMode = true;

        ytPlayer.seekTo(segmentStart, true);
        ytPlayer.playVideo();

        scrollToPlayer();
    }

    function parseSRTPlain(data) {
        data = data
            .replace(/^\uFEFF/, '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .trim();

        const blocks = data.split(/\n{2,}/);
        const result = [];

        for (const block of blocks) {
            const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
            if (lines.length < 2) continue;

            const timeLineIndex = lines.findIndex(l => l.includes('-->'));
            if (timeLineIndex === -1) continue;

            const timeLine = lines[timeLineIndex];
            const m = timeLine.match(
                /(\d{2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[,.]\d{3})/
            );
            if (!m) continue;

            const start = timeToSeconds(m[1]);
            const end = timeToSeconds(m[2]);

            const textRaw = lines.slice(timeLineIndex + 1).join(' ');
            const clean = textRaw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
            if (!clean) continue;

            result.push({ start, end, text: clean });
        }

        result.sort((a, b) => a.start - b.start);
        return result;
    }

    function getTranslationText(idx) {
        return translations[idx]?.text ?? "";
    }

    function initPuzzleByIndex(idx) {
        if (idx == null || idx < 0 || idx >= subtitles.length) return;

        activePuzzleIdx = idx;
        const s = subtitles[idx];
        ytPlayer?.seekTo?.(Math.max(0, s.start), true);
        ytPlayer?.pauseVideo?.();
        const tokens = subtitles[idx].tokens ?? subtitles[idx].text.split(/\s+/).filter(Boolean);
        const words = [...tokens].sort(() => Math.random() - 0.5);

        userSentence = [];
        $("words-pool").innerHTML = '';
        $("result-area").innerHTML = '';

        setPuzzlePanel(true);
        setVideoDim(true);
        scrollToPuzzle();

        for (const word of words) {
            const btn = document.createElement('button');
            btn.className = 'word-btn';
            btn.textContent = word;

            btn.onclick = () => {
                if (btn.classList.contains('used')) return;
                btn.classList.add('used');

                userSentence.push({ word, btn });
                renderUserSentence();
            };

            $("words-pool").appendChild(btn);
        }
    }

    function syncNextIdxToTime(t) {
        if (!subtitles.length) {
            nextIdx = 0;
            return;
        }
        nextIdx = 0;
        while (nextIdx < subtitles.length && subtitles[nextIdx].end <= t + 0.05) {
            nextIdx++;
        }
    }

    function getNextUnsolvedIdx(from) {
        let i = from ?? 0;
        while (i < subtitles.length && subtitles[i].solved) i++;
        return (i < subtitles.length) ? i : null;
    }

    function openNextPuzzle({ autoplay = false } = {}) {
        if (!subtitles.length) return;

        const idx = getNextUnsolvedIdx(nextIdx);
        if (idx == null) {
            activePuzzleIdx = null;
            setPuzzlePanel(false);
            setVideoDim(false);


            setFinishScreenVisible(false);
            showRatingModal();

            return;
        }

        nextIdx = idx;
        initPuzzleByIndex(idx);
        if (autoplay) {
            setTimeout(() => {
                playSnippet(idx, 0);
            }, 50);
        }

    }


    function maybeStartFirstPuzzle({ autoplayFirst = false } = {}) {
        if (!playerReady) return;
        if (!videoLoaded) return;
        if (!subtitles.length) return;

        nextIdx = 0;
        openNextPuzzle({ autoplay: autoplayFirst });
    }

    function renderUserSentence() {
        const originalTokens = subtitles[activePuzzleIdx]?.tokens
            ?? (subtitles[activePuzzleIdx]?.text ?? '').split(/\s+/).filter(Boolean);

        const originalText = originalTokens.join(' ');
        const currentText = userSentence.map(x => x.word).join(' ');

        $("result-area").innerHTML = '';

        userSentence.forEach((item, i) => {
            const span = document.createElement('button');
            span.type = 'button';
            span.className = 'word-btn';
            span.textContent = item.word;
            span.title = 'Нажми, чтобы убрать слово';

            span.onclick = () => {
                item.btn.classList.remove('used');
                userSentence.splice(i, 1);
                renderUserSentence();
            };

            $("result-area").appendChild(span);
        });

        if (currentText === originalText) {

            setTimeout(() => {
                const idx = activePuzzleIdx;
                if (idx == null) return;
                subtitles[idx].solved = true;
                nextIdx = Math.max(nextIdx, idx + 1);
                addSolvedLineToLog(idx, "done");
                activePuzzleIdx = null;
                openNextPuzzle({ autoplay: true });
            }, 450);

        }
    }


    function playSnippet(idx, offsetSeconds = 0) {
        if (!ytPlayer?.seekTo) return;
        if (idx == null || idx < 0 || idx >= subtitles.length) return;
        snippetResumePuzzle = (activePuzzleIdx != null && activePuzzleIdx === idx);

        const s = subtitles[idx];

        snippetMode = true;
        snippetIdx = idx;
        snippetEnd = s.end;

        setClickShield(true);

        if (snippetResumePuzzle) {
            setVideoDim(false);
            setTextMaskVisible(true);
        } else {
            setTextMaskVisible(true);
        }


        const start = Math.max(0, s.start + offsetSeconds);
        ytPlayer.seekTo(start, true);
        ytPlayer.playVideo();
    }

    function scrollToCardCenter(fromEl, { smooth = true, extraOffset = 0 } = {}) {
        if (!fromEl) return;

        const card = fromEl.closest(".card") || fromEl;

        const rect = card.getBoundingClientRect();

        const header = document.querySelector(".site-header");
        const headerH = header ? header.getBoundingClientRect().height : 0;

        const cardCenterY = window.scrollY + rect.top + rect.height / 2;
        const viewportCenterY = window.innerHeight / 2;

        let targetY = cardCenterY - viewportCenterY - headerH / 2 + extraOffset;
        const maxY = document.documentElement.scrollHeight - window.innerHeight;
        targetY = Math.max(0, Math.min(maxY, targetY));

        window.scrollTo({ top: targetY, behavior: smooth ? "smooth" : "auto" });
    }

    function scrollToPuzzle() {
        scrollToCardCenter($("puzzle-under"));
    }

    function scrollToPlayer() {
        scrollToCardCenter($("player"));
    }

    function tick() {
        if (!ytPlayer?.getCurrentTime) return;
        if (!subtitles.length) return;

        const t = ytPlayer.getCurrentTime();

        if (snippetMode) {
            if (t >= snippetEnd - 0.05) {
                snippetMode = false;
                ytPlayer.pauseVideo();
                setTextMaskVisible(false);
                setVideoDim(true);
            }
        }

        if (segmentMode) {
            if (t >= segmentEnd - 0.05) {
                segmentMode = false;
                ytPlayer.pauseVideo();
                setTextMaskVisible(false);
                showFinishOverlay();
            }
        }
    }


    function onStateChange(e) {
        if (e.data === YT.PlayerState.PLAYING) {
            const t = ytPlayer?.getCurrentTime?.() ?? 0;
            syncNextIdxToTime(t);
            if (tickTimer) return;
            tickTimer = setInterval(tick, 120);
        } else {
            if (tickTimer) {
                clearInterval(tickTimer);
                tickTimer = null;
            }
        }
    }

    function setFinishOverlayVisible(show) {
        const ov = $("finish-overlay");
        if (!ov) return;
        ov.setAttribute("aria-hidden", show ? "false" : "true");
    }

    function showFinishOverlay() {
        try { ytPlayer?.pauseVideo?.(); } catch (e) { }

        snippetMode = false;
        segmentMode = false;

        setVideoDim(false);
        setTextMaskVisible(false);
        setClickShield(false);

        setPuzzlePanel(false);

        setFinishOverlayVisible(true);
    }

    function hideFinishOverlay() {
        setFinishOverlayVisible(false);
    }


    window.onYouTubeIframeAPIReady = function () {
        ytPlayer = new YT.Player("player", {
            height: "360",
            width: "640",
            playerVars: {
                playsinline: 1,
                origin: location.origin,
                controls: 0,
                rel: 0,
                modestbranding: 1,
                iv_load_policy: 3,
                cc_load_policy: 0
            },
            events: {
                onReady: () => {
                    playerReady = true;
                    try { ytPlayer.unloadModule("captions"); } catch (e) { }
                    try { ytPlayer.unloadModule("cc"); } catch (e) { }
                    console.log("YouTube player is ready");
                },
                onStateChange: onStateChange
            }
        });
    };

    $("load").onclick = () => {
        const id = extractId($("vid").value);
        updateDisclaimerLink();

        hideFinishOverlay();
        if (!playerReady) {
            alert("Плеер YouTube ещё не готов. Запускай страницу через localhost (Live Server), не через file://");
            return;
        }

        if (!id) return;

        currentVideoId = id;
        ratingWasAsked = false;
        setRatingModalVisible(false);
        setFinishScreenVisible(false);
        segmentMode = false;

        nextIdx = 0;
        activePuzzleIdx = null;
        snippetMode = false;

        resetSubsPanel();
        ytPlayer.cueVideoById({
            videoId: id,
            startSeconds: 0
        });

        scrollToPlayer();

        videoLoaded = true;

        setTimeout(() => {
            maybeStartFirstPuzzle({ autoplayFirst: true });
        }, 300);
    };


    $("srtFile").onchange = (e) => {
        hideFinishOverlay();
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            subtitles = parseSRT(event.target.result);
            ratingWasAsked = false;
            setRatingModalVisible(false);
            setFinishScreenVisible(false);
            segmentMode = false;
            resetSubsPanel();

            setTimeout(() => {
                maybeStartFirstPuzzle({ autoplayFirst: true });
            }, 0);

            // если видео уже играет / стоит не на нуле — подстроимся
            const t = ytPlayer?.getCurrentTime?.() ?? 0;
            syncNextIdxToTime(t);

            activePuzzleIdx = null;
            snippetMode = false;
        };

        reader.readAsText(file);
    };

    $("srtFileTr").onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            translations = parseSRTPlain(event.target.result);
            alert(`Загружено переводов: ${translations.length}`);

            applyTranslationsToExistingLog();
        };
        reader.readAsText(file);
    };

    $("listen-btn").onclick = () => {
        // слушаем текущий паззл (если паззла нет — слушаем nextIdx)
        const idx = (activePuzzleIdx != null) ? activePuzzleIdx : nextIdx;
        playSnippet(idx, 0);
    };

    $("listen-1s-btn").onclick = () => {
        const idx = (activePuzzleIdx != null) ? activePuzzleIdx : nextIdx;
        playSnippet(idx, -1);
    };

    $("skip-btn").onclick = () => {
        const idx = (activePuzzleIdx != null) ? activePuzzleIdx : nextIdx;
        if (idx == null || idx < 0 || idx >= subtitles.length) return;

        subtitles[idx].solved = true;
        nextIdx = Math.max(nextIdx, idx + 1);
        addSolvedLineToLog(idx, "skipped");
        activePuzzleIdx = null;
        openNextPuzzle({ autoplay: true });
    };

    function extractId(url) {
        if (!url) return null;
        const m = url.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
        return m ? m[1] : url.trim();
    }

    function buildYoutubeHrefFromVidInput(raw) {
        const s = (raw || "").trim();
        if (!s) return null;

        const looksLikeUrl = /^https?:\/\//i.test(s) || s.includes("youtu.be") || s.includes("youtube.com");
        if (looksLikeUrl) {
            try {
                return new URL(s).toString();
            } catch {
                const id = extractId(s);
                return id ? `https://www.youtube.com/watch?v=${encodeURIComponent(id)}` : null;
            }
        }

        const id = extractId(s);
        if (!id) return null;
        return `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    }

    function updateDisclaimerLink() {
        const a = document.getElementById("disclaimer-link");
        const input = document.getElementById("vid");
        if (!a || !input) return;

        const href = buildYoutubeHrefFromVidInput(input.value);

        if (!href) {
            a.href = "#";
            a.classList.add("is-disabled");
            a.setAttribute("aria-disabled", "true");
            a.removeAttribute("title");
            return;
        }

        a.href = href;
        a.classList.remove("is-disabled");
        a.setAttribute("aria-disabled", "false");
        a.title = href;
    }

    function todayStr() {
        return new Date().toISOString().slice(0, 10);
    }

    // необязательно, но приятно: сразу помечать видео как "начатое"
    function markVideoStarted(videoId) {
        const LS_PROGRESS = "video_progress_v1"; // как в video_catalog.js
        try {
            const raw = localStorage.getItem(LS_PROGRESS);
            const obj = raw ? JSON.parse(raw) : { version: 1, updatedAt: todayStr(), videos: {} };

            if (!obj.videos || typeof obj.videos !== "object") obj.videos = {};
            const key = String(videoId);
            const prev = obj.videos[key] || { state: 0, bookmarked: 0 };

            // state: 0=новое, 1=начатое, 2=пройдено (у тебя так же логика строится)
            obj.videos[key] = { ...prev, state: Math.max(1, Number(prev.state) || 0) };
            obj.updatedAt = todayStr();

            localStorage.setItem(LS_PROGRESS, JSON.stringify(obj));
        } catch (e) {
            // молча игнорируем
        }
    }

    // Ждём готовности YouTube-плеера, чтобы не ловить alert "плеер ещё не готов"
    function autoClickLoadWhenPlayerReady() {
        const btn = document.getElementById("load");
        if (!btn) return;

        const tryStart = () => {
            if (!playerReady) {
                setTimeout(tryStart, 80);
                return;
            }
            btn.click();
        };

        tryStart();
    }

    async function prefillFromQueryAndAutoload() {
        const params = new URLSearchParams(window.location.search);

        // 1) если вдруг решили передавать прямо ссылку: video.html?yt=...
        const yt = params.get("yt") || params.get("url") || params.get("v");
        if (yt) {
            const input = document.getElementById("vid");
            if (input) {
                input.value = yt;
                updateDisclaimerLink?.();
                autoClickLoadWhenPlayerReady();
            }
            return;
        }

        // 2) основной вариант: video.html?id=123
        const catalogId = params.get("id");
        if (!catalogId) return;

        try {
            const url = new URL(CATALOG_URL, window.location.href).toString();
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

            const list = await res.json();
            if (!Array.isArray(list)) throw new Error("videos_catalog.json должен быть массивом");

            const item = list.find(v => String(v.id) === String(catalogId));
            if (!item) return;

            const input = document.getElementById("vid");
            if (!input) return;

            // В твоём каталоге поле похоже называется youtubeUrl (см. thumbUrl/getYoutubeId)
            input.value = item.youtubeUrl || "";
            updateDisclaimerLink?.();

            // отмечаем как начатое (по желанию)
            markVideoStarted(catalogId);

            // автозапуск загрузки
            if (input.value.trim()) autoClickLoadWhenPlayerReady();
        } catch (err) {
            console.warn("Не удалось автозагрузить видео из каталога:", err);
        }
    }


    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.body.appendChild(tag);

    document.addEventListener("DOMContentLoaded", () => {
        ["mask-on", "mask-pos", "mask-gap", "mask-h", "mask-op"].forEach(id => {
            const el = $(id);
            if (!el) return;
            el.addEventListener("input", () => {
                const dimVisible = $("dim-overlay")?.style.display === "block";
                if (!dimVisible) setTextMaskVisible(true);
            });
            el.addEventListener("change", () => {
                const dimVisible = $("dim-overlay")?.style.display === "block";
                if (!dimVisible) setTextMaskVisible(true);
            });
        });

        const modal = $("rating-modal");
        const starsWrap = $("rating-stars");

        if (modal) {
            modal.addEventListener("click", (e) => {
                if (ratingModalOpen) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            });
        }

        if (starsWrap) {
            starsWrap.addEventListener("mousemove", (e) => {
                if (!ratingModalOpen) return;
                const btn = e.target.closest(".rate-star");
                if (!btn) return;
                paintStars(Number(btn.dataset.value || 0));
            });

            starsWrap.addEventListener("mouseleave", () => {
                if (!ratingModalOpen) return;
                paintStars(0);
            });

            starsWrap.querySelectorAll(".rate-star").forEach(btn => {
                btn.addEventListener("click", () => {
                    const v = Number(btn.dataset.value || 0);
                    if (!v) return;
                    closeRatingModalWithRating(v);
                });
            });
        }
        updateDisclaimerLink();
        document.getElementById("vid")?.addEventListener("input", updateDisclaimerLink);
        document.getElementById("vid")?.addEventListener("change", updateDisclaimerLink);
        prefillFromQueryAndAutoload();

        document.addEventListener("keydown", (e) => {
            if (!ratingModalOpen) return;
            if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
            }
        });

        // ===== кнопки после завершения =====
        const restartBtn = $("restart-btn");
        if (restartBtn) {
            restartBtn.addEventListener("click", () => {
                resetAllPuzzlesAndStart();
            });
        }

        const watchBtn = $("watch-segment-btn");
        if (watchBtn) {
            watchBtn.addEventListener("click", () => {
                playSubtitlesSegment();
            });
        }

    });
})();
