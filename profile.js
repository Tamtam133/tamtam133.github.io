const LS_META    = "siteMeta";
const LS_WORDS   = "myWords";
const LS_USER    = "userProfile"; // { authed?: boolean, name?: string, photoUrl?: string }
const BASE_LIMIT = 10;

const $ = (id) => document.getElementById(id);

// ---------- Метаданные / стрик ----------
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

// ---------- Пользователь ----------
function loadUser(){ try { return JSON.parse(localStorage.getItem(LS_USER)) || {}; } catch { return {}; } }
function saveUser(u){ localStorage.setItem(LS_USER, JSON.stringify(u)); }

// ---------- Меню: open/close ----------
function isMenuOpen(){
  const m = $("profileMenu");
  return !!m && m.getAttribute("aria-hidden") === "false";
}

function openMenu(){
  const m=$("profileMenu"), b=$("profileBtn");
  if(!m) return;
  m.setAttribute("aria-hidden","false");
  b?.setAttribute("aria-expanded","true");
}

function closeMenu(){
  const m=$("profileMenu"), b=$("profileBtn");
  if(!m) return;
  m.setAttribute("aria-hidden","true");
  b?.setAttribute("aria-expanded","false");
}

function toggleMenu(){ isMenuOpen() ? closeMenu() : openMenu(); }

function setupDismiss(){
  // клик вне меню — закрываем
  document.addEventListener("click",(e)=>{
    const m=$("profileMenu"), b=$("profileBtn");
    if(!m || !b) return;
    const t=e.target;
    if (m.contains(t) || b.contains(t)) return;
    closeMenu();
  }, { passive:true });

  // Esc — закрываем
  window.addEventListener("keydown",(e)=>{ if(e.key==="Escape") closeMenu(); });
}

// ---------- Гидратация UI ----------
function hydrateProfile(){
  const user = loadUser();
  const name = user.name || "Гость";
  const meta = refreshDaily();
  const limit = getDailyLimit(meta);

  // Имя и статус
  const pn = $("profileName"); if (pn) pn.textContent = name;
  const ps = $("profileSub");  if (ps) ps.textContent = `Стрик ${meta.streak} дн · лимит ${limit}`;

  // Если дадите photoUrl — покажем картинку (в вашем HTML <img> изначально hidden)
  const img  = $("avatarImg");
  const imgS = $("avatarImgSm");
  if (user.photoUrl) {
    if (img)  { img.src = user.photoUrl;  img.hidden = false; }
    if (imgS) { imgS.src = user.photoUrl; imgS.hidden = false; }
  }
}

// ---------- Простые действия (заглушки) ----------
function fakeAuthFlow(){
  const cur = loadUser();
  const name = prompt("Как тебя отображать в профиле?", cur.name || "") || "Гость";
  const photoUrl = prompt("URL картинки-аватара (можно пусто):", cur.photoUrl || "") || "";
  saveUser({ authed: true, name, photoUrl });
  hydrateProfile();
  closeMenu();
}

function loginFlow(){ fakeAuthFlow(); }

function logoutFlow(){
  saveUser({ authed: false, name: "Гость", photoUrl: "" });
  hydrateProfile();
  closeMenu();
}

function resetLocal(){
  if (!confirm("Сбросить локальный прогресс (слова, стрик)?")) return;
  localStorage.removeItem(LS_WORDS);
  localStorage.removeItem(LS_META);
  alert("Готово. Метаданные пересчитаются при следующем открытии.");
}

// ---------- init ----------
(function init(){
  // меню изначально скрыто: aria-hidden="true" уже в HTML
  const menu = $("profileMenu");
  if (menu) {
    // клики внутри меню не считаем «вне»
    menu.addEventListener("click", (e)=> e.stopPropagation());
  }

  const btn = $("profileBtn");
  if (btn) {
    btn.setAttribute("aria-haspopup","menu");
    btn.setAttribute("aria-controls","profileMenu");
    btn.setAttribute("aria-expanded","false");
    // важно: гасим всплытие, чтобы обработчик «клик вне» не сработал
    btn.addEventListener("click", (e)=>{ e.stopPropagation(); toggleMenu(); });
  }

  // Кнопки в меню (если присутствуют)
  $("loginBtn")?.addEventListener("click", (e)=>{ e.stopPropagation(); loginFlow(); });
  $("logoutBtn")?.addEventListener("click", (e)=>{ e.stopPropagation(); logoutFlow(); });
  $("fakeAuth")?.addEventListener("click", (e)=>{ e.stopPropagation(); fakeAuthFlow(); });
  $("resetProgress")?.addEventListener("click", (e)=>{ e.stopPropagation(); resetLocal(); });

  setupDismiss();
  hydrateProfile();
})();
