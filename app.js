// --- данные и хелперы ---
const TEXT = "오늘 날씨가 아주 좋아요. 저는 커피를 마셔요. 공부합시다!";
const LS_KEY = "myWords"; // {word, ts}[]
const words = loadWords();
const LS_META = "siteMeta"; // { lastVisit: "2025-10-23", streak: 0, addedToday: 0 }
const BASE_LIMIT = 10;

function loadWords() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; }
  catch { return []; }
}
function saveWords() { localStorage.setItem(LS_KEY, JSON.stringify(words)); }
function addWord(w) {
  if (!w) return;
  if (!words.find(x => x.word === w)) {
    words.push({ word: w, ts: Date.now(), laps: 0, nextAt: Date.now() }); // для карточек
    saveWords();
    renderWordList();
  }
}

// --- рендер текста с кликабельными токенами ---
function tokenizeKorean(text) {
  // очень простой сплит по не-буквенным символам; позже заменим на более умный парсер
  return text.split(/(\p{L}+)/gu).filter(Boolean);
}
function renderReader() {
  const root = document.getElementById("reader");
  root.innerHTML = "";
  tokenizeKorean(TEXT).forEach(tok => {
    if (/\p{L}/u.test(tok)) {
      const span = document.createElement("span");
      span.textContent = tok;
      span.style.cursor = "pointer";
      span.style.padding = "2px 4px";
      span.style.borderRadius = "8px";
      span.addEventListener("click", () => {
        addWord(tok);
        span.style.background = "#e6ffe6";
      });
      root.appendChild(span);
      root.append(" ");
    } else {
      root.append(tok);
    }
  });
}

function renderWordList() {
  const ul = document.getElementById("wordList");
  ul.innerHTML = "";
  words.forEach(({ word }) => {
    const li = document.createElement("li");
    li.textContent = word;
    ul.appendChild(li);
  });
}

renderReader();
renderWordList();

function loadMeta(){
  try { return JSON.parse(localStorage.getItem(LS_META)) || {}; }
  catch { return {}; }
}
function saveMeta(m){ localStorage.setItem(LS_META, JSON.stringify(m)); }
function todayStr(){ return new Date().toISOString().slice(0,10); }

function refreshDaily() {
  const m = loadMeta();
  const t = todayStr();
  if (!m.lastVisit) { m.lastVisit = t; m.streak = 1; m.addedToday = 0; saveMeta(m); return m; }
  if (m.lastVisit === t) return m;
  const y = new Date(m.lastVisit);
  const d = new Date(t);
  const diff = Math.round((d - y) / (24*60*60*1000));
  if (diff === 1) m.streak = (m.streak||0) + 1; else m.streak = 1;
  m.lastVisit = t;
  m.addedToday = 0;
  saveMeta(m);
  return m;
}

function getDailyLimit(meta) {
  const bonus = Math.floor((meta.streak||1) / 3) * 5; // каждые 3 дня +5
  return BASE_LIMIT + bonus;
}

function addWord(w) {
  const meta = refreshDaily();
  const limit = getDailyLimit(meta);
  if ((meta.addedToday||0) >= limit) {
    alert(`Лимит на сегодня исчерпан (${limit}). Приходи завтра! Стрик: ${meta.streak}д.`);
    return;
  }
  if (!w) return;
  if (!words.find(x => x.word === w)) {
    words.push({ word: w, ts: Date.now(), laps: 0, nextAt: Date.now() });
    meta.addedToday = (meta.addedToday||0) + 1;
    saveWords(); saveMeta(meta);
    renderWordList(); renderMeta();
  }
}

function renderMeta() {
  const meta = refreshDaily();
  const limit = getDailyLimit(meta);
  let el = document.getElementById("meta");
  if (!el) {
    el = document.createElement("div");
    el.id = "meta";
    document.body.prepend(el);
  }
  el.innerHTML = `Стрик: <b>${meta.streak}</b> дней · Добавлено сегодня: <b>${meta.addedToday||0}/${limit}</b>`;
}

renderMeta();
