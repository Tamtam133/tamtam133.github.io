// --- данные и хелперы ---
const TEXT = "오늘 날씨가 아주 좋아요. 저는 커피를 마셔요. 공부합시다!";
const LS_KEY = "myWords"; // {word, ts}[]
const words = loadWords();

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
