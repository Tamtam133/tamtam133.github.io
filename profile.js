(() => {
    const byId = (id) => document.getElementById(id);

    const LS_META = "site_meta_v1";
    const LS_USER = "site_user_v1";
    const BASE_LIMIT = 10;

    function openMenu() {
        const menu = byId("profileMenu");
        const btn = byId("profileBtn");
        if (!menu || !btn) return;
        menu.setAttribute("aria-hidden", "false");
        btn.setAttribute("aria-expanded", "true");
    }

    function closeMenu() {
        const menu = byId("profileMenu");
        const btn = byId("profileBtn");
        if (!menu || !btn) return;
        menu.setAttribute("aria-hidden", "true");
        btn.setAttribute("aria-expanded", "false");
    }

    function toggleMenu(e) {
        e?.preventDefault?.();
        e?.stopPropagation?.();

        const menu = byId("profileMenu");
        if (!menu) return;
        const hidden = menu.getAttribute("aria-hidden") !== "false";
        hidden ? openMenu() : closeMenu();
    }

    function setupDismiss() {
        document.addEventListener("click", (e) => {
            const menu = byId("profileMenu");
            const btn = byId("profileBtn");
            if (!menu || !btn) return;
            if (menu.contains(e.target) || btn.contains(e.target)) return;
            closeMenu();
        });

        window.addEventListener("keydown", (e) => {
            if (e.key === "Escape") closeMenu();
        });
    }

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

    function initials(name = "") {
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return "GK"; // Гость Кор
        const i = (parts[0][0] || "") + (parts[1]?.[0] || "");
        return i.toUpperCase();
    }

    // Заполнение данных в меню
    function hydrateProfile() {
        const user = loadUser();
        const name = user.name || "Гость";
        const meta = refreshDaily();
        const limit = getDailyLimit(meta);
        const init = initials(name);
        const a1 = byId("avatarInitials"), a2 = byId("avatarInitialsSm");
        if (a1) a1.textContent = init;
        if (a2) a2.textContent = init;
        const pn = byId("profileName");
        const streakEl = byId("streakValue");
        const limitEl = byId("limitValue");
        if (pn) pn.textContent = name;
        if (streakEl) {
            streakEl.textContent = `${meta.streak} дн`;
        }
        if (limitEl) {
            limitEl.textContent = limit;
        }
    }

    function initProfile() {
        const btn = byId("profileBtn");
        if (btn) {
            btn.addEventListener("click", toggleMenu);
        }

        setupDismiss();
        hydrateProfile();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initProfile);
    } else {
        initProfile();
    }
})();