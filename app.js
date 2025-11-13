// ---------- Константы и хранилище ----------
const TEXT = "오늘 날씨가 아주 좋아요. 저는 커피를 마셔요. 공부합시다!";
const LS_WORDS = "myWords";     // [{ word, ts, laps, nextAt }]
const LS_META  = "siteMeta";    // { lastVisit: "YYYY-MM-DD", streak: number, addedToday: number }
const LS_USER = "userProfile"; // { name: "Имя Фамилия" }
const BASE_LIMIT = 10;

function loadWords() {
  try { return JSON.parse(localStorage.getItem(LS_WORDS)) || []; }
  catch { return []; }
}
function saveWords(arr) {
  localStorage.setItem(LS_WORDS, JSON.stringify(arr));
}

function loadMeta() {
  try { return JSON.parse(localStorage.getItem(LS_META)) || {}; }
  catch { return {}; }
}
function saveMeta(m) { localStorage.setItem(LS_META, JSON.stringify(m)); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

// При открытии страницы — освежаем день/стрик
function refreshDaily() {
  const m = loadMeta();
  const t = todayStr();

  if (!m.lastVisit) {
    const init = { lastVisit: t, streak: 1, addedToday: 0 };
    saveMeta(init);
    return init;
  }
  if (m.lastVisit === t) return m;

  const prev = new Date(m.lastVisit);
  const now  = new Date(t);
  const diffDays = Math.round((now - prev) / (24 * 60 * 60 * 1000));

  m.streak = diffDays === 1 ? (m.streak || 0) + 1 : 1;
  m.lastVisit = t;
  m.addedToday = 0;
  saveMeta(m);
  return m;
}

function getDailyLimit(meta) {
  const bonus = Math.floor((meta.streak || 1) / 3) * 5; // каждые 3 дня стрика +5
  return BASE_LIMIT + bonus;
}

// ---------- Логика добавления слова ----------
function addWordWithRules(word) {
  if (!word) return;

  // лимит/стрик
  const meta = refreshDaily();
  const limit = getDailyLimit(meta);

  if ((meta.addedToday || 0) >= limit) {
    alert(`Лимит на сегодня исчерпан (${limit}). Приходи завтра! Стрик: ${meta.streak} дн.`);
    return false;
  }

  // уникальность
  const list = loadWords();
  if (list.find(x => x.word === word)) return false;

  list.push({
    word,
    ts: Date.now(),
    laps: 0,
    nextAt: Date.now(), // для будущих карточек
  });
  saveWords(list);

  meta.addedToday = (meta.addedToday || 0) + 1;
  saveMeta(meta);

  renderWordList();
  renderMeta();
  return true;
}

// ---------- Рендер текста и списка ----------
function tokenizeKorean(text) {
  // простой сплит: «слово»/«не-слово». Позже можно заменить на морфологию.
  return text.split(/(\p{L}+)/gu).filter(Boolean);
}

function renderReader() {
  const root = document.getElementById("reader");
  root.innerHTML = "";

  const current = loadWords().map(w => w.word);
  tokenizeKorean(TEXT).forEach(tok => {
    if (/\p{L}/u.test(tok)) {
      const span = document.createElement("span");
      span.textContent = tok;
      span.className = "token";
      if (current.includes(tok)) span.classList.add("added");

      span.addEventListener("click", () => {
        const added = addWordWithRules(tok);
        if (added) span.classList.add("added");
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

  const list = loadWords();
  list.forEach(({ word }) => {
    const li = document.createElement("li");
    li.textContent = word;
    ul.appendChild(li);
  });
}

function renderMeta() {
  const meta = refreshDaily();
  const limit = getDailyLimit(meta);
  const box = document.getElementById("meta");
  box.innerHTML = `Стрик: <b>${meta.streak}</b> дней · Добавлено сегодня: <b>${meta.addedToday || 0}/${limit}</b>`;
}

// ---------- Инициализация ----------
(function init() {
  refreshDaily();   // актуализируем стрик/день
  renderMeta();
  renderReader();
  renderWordList();
})();