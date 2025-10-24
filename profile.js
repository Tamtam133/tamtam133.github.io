const LS_META = "siteMeta";
const LS_WORDS = "myWords";
const LS_USER = "userProfile"; // { name: "Имя Фамилия" }
const BASE_LIMIT = 10;

const $ = (id) => document.getElementById(id);
// ---------- Метаданные/стрик ----------
function loadMeta() {
    try { return JSON.parse(localStorage.getItem(LS_META)) || {}; }
    catch { return {}; }
}
function saveMeta(m) { localStorage.setItem(LS_META, JSON.stringify(m)); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

function refreshDaily() {
    const m = loadMeta();
    const t = todayStr();
    if (!m.lastVisit) {
        const init = { lastVisit: t, streak: 1, addedToday: 0 };
        saveMeta(init);
        return init;
    }
    if (m.lastVisit === t) return m;
    const prev = new Date(m.lastVisit), now = new Date(t);
    const diff = Math.round((now - prev) / (24 * 60 * 60 * 1000));
    m.streak = diff === 1 ? (m.streak || 0) + 1 : 1;
    m.lastVisit = t;
    m.addedToday = 0;
    saveMeta(m);
    return m;
}
function getDailyLimit(meta) {
    const bonus = Math.floor((meta.streak || 1) / 3) * 5; // +5 за каждые 3 дня
    return BASE_LIMIT + bonus;
}

// ---------- Пользователь ----------
function loadUser() {
    try { return JSON.parse(localStorage.getItem(LS_USER)) || {}; }
    catch { return {}; }
}
function saveUser(u) { localStorage.setItem(LS_USER, JSON.stringify(u)); }
function initials(name = "") {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "GK"; // Гость Кор
    const i = (parts[0][0] || "") + (parts[1]?.[0] || "");
    return i.toUpperCase();
}

// ---------- Меню ----------
function openMenu() {
    const menu = $("profileMenu");
    if (!menu) return;
    menu.setAttribute("aria-hidden", "false");
    $("profileBtn").setAttribute("aria-expanded", "true");
}
function closeMenu() {
    const menu = $("profileMenu");
    if (!menu) return;
    menu.setAttribute("aria-hidden", "true");
    $("profileBtn").setAttribute("aria-expanded", "false");
}

function toggleMenu() {
    const menu = $("profileMenu");
    const hidden = menu.getAttribute("aria-hidden") !== "false";
    hidden ? openMenu() : closeMenu();
}

// Закрытие по клику вне и по Esc
function setupDismiss() {
    document.addEventListener("click", (e) => {
        const menu = $("profileMenu"), btn = $("profileBtn");
        if (!menu) return;
        if (menu.contains(e.target) || btn.contains(e.target)) return;
        closeMenu();
    });
    window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeMenu();
    });
}

// Сброс локального прогресса
function resetLocalProgress() {
    if (!confirm("Сбросить локальный прогресс (слова, стрик, лимит)?")) return;
    localStorage.removeItem(LS_WORDS);
    localStorage.removeItem(LS_META);
    closeMenu();
    alert("Готово. Страница обновит метаданные при следующем открытии.");
}

// «Авторизация» на месте (смена отображаемого имени)
function fakeAuthFlow() {
    const cur = loadUser().name || "";
    const name = prompt("Как тебя отображать в профиле?", cur) || "Гость";
    saveUser({ name });
    hydrateProfile(); // обновим шапку
    closeMenu();
}

// Заполнение данных в меню
function hydrateProfile() {
    const user = loadUser();
    const name = user.name || "Гость";
    const meta = refreshDaily();
    const limit = getDailyLimit(meta);

    const init = initials(name);
    const a1 = $("avatarInitials"), a2 = $("avatarInitialsSm");

    if (a1) a1.textContent = init;
    if (a2) a2.textContent = init;

    const pn = $("profileName");
    const ps = $("profileSub");
    if (pn) pn.textContent = name;
    if (ps) ps.textContent = `Стрик ${meta.streak} дн · лимит ${limit}`;
}

// Инициализация
(function initProfile() {
    const btn = $("profileBtn");
    if (btn) btn.addEventListener("click", toggleMenu);

    const resetBtn = $("resetProgress");
    if (resetBtn) resetBtn.addEventListener("click", resetLocalProgress);

    const authBtn = $("fakeAuth");
    if (authBtn) authBtn.addEventListener("click", fakeAuthFlow);

    setupDismiss();
    hydrateProfile();
})();