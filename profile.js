// profile.js
const LS_META   = "siteMeta";
const LS_WORDS  = "myWords";
const LS_USER   = "userProfile"; // { authed: bool, name: string, photoUrl: string }
const BASE_LIMIT = 10;

const $ = (id) => document.getElementById(id);

// ---------- helpers: meta/streak ----------
function loadMeta(){ try { return JSON.parse(localStorage.getItem(LS_META)) || {}; } catch { return {}; } }
function saveMeta(m){ localStorage.setItem(LS_META, JSON.stringify(m)); }
function todayStr(){ return new Date().toISOString().slice(0,10); }

function refreshDaily(){
  const m = loadMeta(); const t = todayStr();
  if (!m.lastVisit) { const init = { lastVisit: t, streak: 1, addedToday: 0 }; saveMeta(init); return init; }
  if (m.lastVisit === t) return m;
  const diff = Math.round((new Date(t) - new Date(m.lastVisit)) / 86400000);
  m.streak = diff === 1 ? (m.streak || 0) + 1 : 1;
  m.lastVisit = t; m.addedToday = 0; saveMeta(m); return m;
}
function getDailyLimit(meta){ const bonus = Math.floor((meta.streak || 1) / 3) * 5; return BASE_LIMIT + bonus; }

// ---------- helpers: user ----------
function loadUser(){ try { return JSON.parse(localStorage.getItem(LS_USER)) || {}; } catch { return {}; } }
function saveUser(u){ localStorage.setItem(LS_USER, JSON.stringify(u)); }
function initials(name=""){ const p=name.trim().split(/\s+/).filter(Boolean); if(!p.length) return "Г"; return (p[0][0]+(p[1]?.[0]||"")).toUpperCase(); }

// ---------- menu open/close ----------
function openMenu(){ const m=$("profileMenu"); if(!m) return; m.setAttribute("aria-hidden","false"); m.removeAttribute("hidden"); $("profileBtn")?.setAttribute("aria-expanded","true"); }
function closeMenu(){ const m=$("profileMenu"); if(!m) return; m.setAttribute("aria-hidden","true"); m.setAttribute("hidden",""); $("profileBtn")?.setAttribute("aria-expanded","false"); }
function toggleMenu(){ ( $("profileMenu")?.getAttribute("aria-hidden") !== "false" ) ? openMenu() : closeMenu(); }

function setupDismiss(){
  document.addEventListener("click",(e)=>{
    const m=$("profileMenu"), b=$("profileBtn"); if(!m||!b) return;
    if (m.contains(e.target) || b.contains(e.target)) return;
    closeMenu();
  });
  window.addEventListener("keydown",(e)=>{ if(e.key==="Escape") closeMenu(); });
}

// ---------- hydrate UI ----------
function hydrateProfile(){
  const user = loadUser();
  const isAuthed = !!user.authed;
  const name = isAuthed ? (user.name || "Без имени") : "Гость";

  // Аватар: фото или инициалы
  const img  = $("avatarImg");
  const init = $("avatarInitials");
  const imgS = $("avatarImgSm");
  const initS= $("avatarInitialsSm");

  if (user.photoUrl) {
    if (img)  { img.src = user.photoUrl;  img.hidden = false; }
    if (init) init.hidden = true;
    if (imgS) { imgS.src = user.photoUrl; imgS.hidden = false; }
    if (initS) initS.hidden = true;
  } else {
    if (img)  img.hidden = true;
    if (init) { init.textContent = initials(name); init.hidden = false; }
    if (imgS) imgS.hidden = true;
    if (initS) { initS.textContent = initials(name); initS.hidden = false; }
  }

  // Имя
  const pn = $("profileName"); if (pn) pn.textContent = name;

  // Стрик/лимит: скрываем у гостя
  const ps = $("profileSub");
  if (ps) {
    if (isAuthed) {
      const meta = refreshDaily(); const limit = getDailyLimit(meta);
      ps.textContent = `Стрик ${meta.streak} дн · лимит ${limit}`;
      ps.classList.remove("hidden");
    } else {
      ps.classList.add("hidden");
    }
  }

  // Ссылки меню: показываем только авторизованным
  const links = $("menuLinks");
  if (links) links.classList.toggle("hidden", !isAuthed);

  // Кнопки входа/выхода
  $("loginBtn")?.classList.toggle("hidden", isAuthed);
  $("logoutBtn")?.classList.toggle("hidden", !isAuthed);
}

// ---------- actions ----------
function loginFlow(){
  // простой флоу: спросим имя и (опционально) ссылку на аватар
  const cur = loadUser();
  const name = prompt("Как тебя отображать в профиле?", cur.name || "") || "Пользователь";
  const photoUrl = prompt("URL картинки-аватара (можно оставить пустым):", cur.photoUrl || "") || "";
  saveUser({ authed: true, name, photoUrl });
  hydrateProfile(); closeMenu();
}
function logoutFlow(){
  const keep = loadUser();
  saveUser({ authed: false, name: "Гость", photoUrl: "" }); // не трогаем слова/стрик
  hydrateProfile(); closeMenu();
}
function resetLocal(){
  if (!confirm("Сбросить локальный прогресс (слова, стрик)?")) return;
  localStorage.removeItem(LS_WORDS);
  localStorage.removeItem(LS_META);
  alert("Готово. Метаданные пересчитаются при следующем открытии.");
}

// ---------- init ----------
(function init(){
  // гарантированно скрыть меню при загрузке
  closeMenu();

  $("profileBtn")?.addEventListener("click", toggleMenu);
  $("loginBtn")?.addEventListener("click", loginFlow);
  $("logoutBtn")?.addEventListener("click", logoutFlow);
  $("resetProgress")?.addEventListener("click", resetLocal);

  setupDismiss();
  hydrateProfile();
})();

