const $ = (id) => document.getElementById(id);

let ytPlayer = null;
let playerReady = false;

let subtitles = [];
let translations = [];
let userSentence = [];

let tickTimer = null;

let snippetResumePuzzle = false;

// какой субтитр следующий по порядку
let nextIdx = 0;

// какой паззл сейчас активен (важно для кнопок и solved)
let activePuzzleIdx = null;

// режим "прослушать отрывок"
let snippetMode = false;
let snippetEnd = 0;
let snippetIdx = null;

let videoLoaded = false;

// панель субтитров справа
let loggedSolved = new Set(); // чтобы не добавлять одно и то же дважды

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

    // классы позиции
    el.classList.remove("top", "bottom");
    el.classList.add(maskPos === "bottom" ? "bottom" : "top");

    // размер/прозрачность
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
        if (!snippetMode) setClickShield(false);
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

        // текст без тегов, но с пунктуацией
        const textRaw = lines.slice(timeLineIndex + 1).join(' ');
        const clean = textRaw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        if (!clean) continue;

        result.push({ start, end, text: clean });
    }

    result.sort((a, b) => a.start - b.start);
    return result;
}

function getTranslationText(idx) {
    // базовый вариант: по индексу
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
    $("feedback").textContent = '';

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

            // Храним и слово, и кнопку
            userSentence.push({ word, btn });
            renderUserSentence();
        };

        $("words-pool").appendChild(btn);
    }

    // маленькая подсказка, какую фразу собираем (можно убрать)
    $("feedback").innerHTML = `<span class="muted">Фраза #${idx + 1}/${subtitles.length}</span>`;
}

function syncNextIdxToTime(t) {
    if (!subtitles.length) {
        nextIdx = 0;
        return;
    }
    nextIdx = 0;
    // пропускаем все фразы, которые уже закончились к текущему времени
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
        $("feedback").innerHTML = '<span class="correct">Все фразы пройдены ✅</span>';
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

        // Клик по слову в собранной фразе — убрать его
        span.onclick = () => {
            // возвращаем кнопку в пул
            item.btn.classList.remove('used');

            // удаляем выбранное слово из собранной фразы
            userSentence.splice(i, 1);

            renderUserSentence();
        };

        $("result-area").appendChild(span);
    });

    if (currentText === originalText) {
        $("feedback").innerHTML = '<span class="correct">Правильно!</span>';

        setTimeout(() => {
            const idx = activePuzzleIdx;
            if (idx == null) return;
            subtitles[idx].solved = true;
            nextIdx = Math.max(nextIdx, idx + 1);
            addSolvedLineToLog(idx, "done");
            activePuzzleIdx = null;
            openNextPuzzle({ autoplay: true });
        }, 450);

    } else {
        const total = originalTokens.length;
        $("feedback").innerHTML = `<span class="muted">Собрано: ${userSentence.length}/${total}</span>`;
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

function scrollToEl(el) {
    if (!el) return;
    requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
    });
}

function scrollToPuzzle() {
    scrollToEl($("puzzle-under"));
}

function scrollToPlayer() {
    scrollToEl($("player"));
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

    if (!playerReady) {
        alert("Плеер YouTube ещё не готов. Запускай страницу через localhost (Live Server), не через file://");
        return;
    }

    if (!id) return;

    // сброс прогресса
    nextIdx = 0;
    activePuzzleIdx = null;
    snippetMode = false;

    resetSubsPanel();
    // ВАЖНО: грузим строго с 0 секунды
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
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        subtitles = parseSRT(event.target.result);

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
});
