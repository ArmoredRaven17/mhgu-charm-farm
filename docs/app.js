/* MHGU Charm Farm — wiring, theme, file I/O and boot.
 *
 * roll.js / farm.js / box.js / ui.js hold the substance; this file connects them to
 * the chrome and starts everything.
 */
(function () {
  "use strict";
  const ROLL = window.ROLL, FARM = window.FARM, BOX = window.BOX, UI = window.UI;
  const $ = id => document.getElementById(id);
  if (!window.CF_CHARM || !window.CF_SKILLS || !window.CF_ORES || !ROLL) {
    document.body.innerHTML = "<p style='padding:20px'>Failed to load charm data.</p>";
    return;
  }
  const THEME_KEY = "mhgu-charm-farm-theme";
  const toast = UI.toast;

  // ── Theme ──────────────────────────────────────────────────────────────
  // Same palette as the rest of the family, so the apps sit together.
  const THEME_COLORS = [
    ["Teostra", "#570B0B"], ["Rathalos", "#b51717"],
    ["Tetsucabra", "#c65900"], ["Agnaktor", "#fc933e"],
    ["Tigrex", "#C8A319"], ["Rajang", "#f1d364"],
    ["Deviljho", "#0B570F"], ["Rathian", "#3a9b3f"],
    ["Astalos", "#14503d"], ["Zinogre", "#2dae85"],
    ["Zamtrios", "#005984"], ["Plesioth", "#0080c1"],
    ["Brachydios", "#0B2757"], ["Lagiacrus", "#0b3f97"],
    ["G. Magala", "#1F0B57", "Gore Magala"], ["Nerscylla", "#4e2fa2"],
    ["Y. Garuga", "#62008f", "Yian Garuga"], ["Chameleos", "#8e50ab"],
    ["Mizutsune", "#D84696"], ["Congalala", "#ce79a8"],
    ["Duramboros", "#5a411f"], ["Diablos", "#997c54"],
    ["Barroth", "#B57C45"], ["Bulldrome", "#cfaa87"],
    ["K. Daora", "#505358", "Kushala Daora"], ["Valstrax", "#aeb5c1"],
    ["Forbidden", "#1E2025", "Question Mark"],
  ];
  // Brachydios, because he's the one you're hitting.
  const DEFAULT_THEME = "#0B2757";
  const COLORS_HEX = Object.fromEntries(THEME_COLORS.map(([name, hex]) => [hex.toUpperCase(), name]));
  const COLORS_ICON = Object.fromEntries(THEME_COLORS.filter(c => c[2]).map(([name, , icon]) => [name, icon]));
  const FALLBACK_ICON = "assets/MonsterIcons/MHGU-Question_Mark_Icon.webp";
  const monsterIcon = name => name ? "assets/MonsterIcons/MHGU-" + name.replace(/ /g, "_") + "_Icon.webp" : FALLBACK_ICON;

  const hexRgb = h => { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); };
  const clamp = n => Math.max(0, Math.min(255, Math.round(n)));
  const clamp01 = n => Math.max(0, Math.min(1, n));
  const rgbToHsl = ([r, g, b]) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2;
    if (d === 0) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6
      : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
    return [h, s, l];
  };
  const hslToRgb = ([h, s, l]) => {
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h * 6) % 2 - 1)), m = l - c / 2;
    const hi = Math.floor(h * 6) % 6;
    const [r, g, b] = hi === 0 ? [c, x, 0] : hi === 1 ? [x, c, 0] : hi === 2 ? [0, c, x]
      : hi === 3 ? [0, x, c] : hi === 4 ? [x, 0, c] : [c, 0, x];
    return [r + m, g + m, b + m].map(v => clamp(v * 255));
  };
  const darken = (rgb, f) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l * f)]); };
  const lighten = (rgb, b) => { const [h, s, l] = rgbToHsl(rgb); return hslToRgb([h, s, clamp01(l + (1 - l) * b)]); };
  const cssRgb = rgb => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;

  // Every variable is a lightness scaling of the one chosen colour, so hue and
  // saturation carry through and the ordering (bg1 < nav < bg2) holds on every theme.
  function applyTheme(hex) {
    const c = hexRgb(hex), r = document.documentElement.style;
    r.setProperty("--bg", cssRgb(darken(c, .70)));
    r.setProperty("--bg1", cssRgb(darken(c, .80)));
    r.setProperty("--grid-bg", cssRgb(darken(c, .35)));
    r.setProperty("--content-bg", cssRgb(darken(c, .55)));
    r.setProperty("--panel-bg", cssRgb(darken(c, .40)));
    r.setProperty("--bg2", cssRgb(darken(c, .95)));
    r.setProperty("--nav-bg", cssRgb(darken(c, .85)));
    r.setProperty("--control-bg", cssRgb(darken(c, .34)));
    r.setProperty("--control-bg-hover", cssRgb(darken(c, .42)));
    r.setProperty("--control-active", cssRgb(darken(c, .24)));
    r.setProperty("--accent", cssRgb(darken(c, .7)));
    r.setProperty("--accent-hover", cssRgb(lighten(c, .4)));
    try { localStorage.setItem(THEME_KEY, hex); } catch (e) {}
    document.querySelectorAll(".swatch").forEach(s => s.classList.toggle("sel", s.dataset.hex === hex));
    const titleIcon = document.querySelector(".title-icon");
    if (titleIcon) {
      const name = COLORS_HEX[hex.toUpperCase()];
      titleIcon.src = name ? monsterIcon(COLORS_ICON[name] || name) : FALLBACK_ICON;
    }
  }
  function buildSwatches() {
    const wrap = $("swatches");
    wrap.innerHTML = "";
    for (const [name, hex, iconOverride] of THEME_COLORS) {
      const d = document.createElement("div");
      d.className = "swatch";
      d.dataset.hex = hex;
      d.style.background = hex;
      d.title = name;
      d.innerHTML = `<img class="swatch-icon" src="${monsterIcon(iconOverride || name)}" alt=""><span>${name}</span>`;
      d.addEventListener("click", () => applyTheme(hex));
      wrap.appendChild(d);
    }
  }

  // ── Confirm dialog ─────────────────────────────────────────────────────
  let confirmAction = null;
  function askConfirm(title, body, onOk) {
    $("confirmTitle").textContent = title;
    $("confirmBody").textContent = body;
    confirmAction = onOk;
    $("confirmModal").classList.remove("hidden");
  }
  $("confirmOk").addEventListener("click", () => {
    $("confirmModal").classList.add("hidden");
    const fn = confirmAction; confirmAction = null;
    if (fn) fn();
  });
  $("confirmCancel").addEventListener("click", () => {
    $("confirmModal").classList.add("hidden");
    confirmAction = null;
  });

  // ── File save / load ───────────────────────────────────────────────────
  const supportsFsApi = "showSaveFilePicker" in window;
  const JSON_TYPES = [{ description: "JSON", accept: { "application/json": [".json"] } }];
  const SAVE_NAME = "mhgu-charm-farm.json";
  let fileHandle = null;

  async function saveToFile(forceNew) {
    const data = JSON.stringify(BOX.payload(), null, 2);
    if (supportsFsApi) {
      try {
        if (forceNew || !fileHandle) fileHandle = await window.showSaveFilePicker({ suggestedName: SAVE_NAME, types: JSON_TYPES });
        const w = await fileHandle.createWritable();
        await w.write(data);
        await w.close();
        BOX.dirty = false;
        UI.renderAll();
        toast("Saved.");
        return;
      } catch (e) { if (e && e.name === "AbortError") return; /* else fall through */ }
    }
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = SAVE_NAME; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    BOX.dirty = false;
    UI.renderAll();
    toast("Downloaded save file.");
  }
  async function openFile() {
    if (supportsFsApi) {
      try {
        const [h] = await window.showOpenFilePicker({ types: JSON_TYPES });
        fileHandle = h;
        loadFromText(await (await h.getFile()).text());
        return;
      } catch (e) { if (e && e.name === "AbortError") return; }
    }
    $("importFile").click();
  }
  function loadFromText(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { return toast("That file isn't valid JSON."); }
    const err = BOX.validateSave(obj);
    if (err) return toast(err);
    BOX.load(obj);
    UI.page = 0;
    UI.clearSelection();
    UI.renderAll();
    toast("Farm loaded.");
  }

  // ── Settings toggles ───────────────────────────────────────────────────
  function bindToggle(id, get, set) {
    const el = $(id);
    const sync = () => el.setAttribute("aria-checked", get() ? "true" : "false");
    sync();
    el.addEventListener("click", () => { set(!get()); sync(); });
    return sync;
  }

  function bindModal(btnId, modalId, closeId) {
    $(btnId).addEventListener("click", () => $(modalId).classList.remove("hidden"));
    $(closeId).addEventListener("click", () => $(modalId).classList.add("hidden"));
    $(modalId).addEventListener("click", e => {
      if (e.target.id === modalId) $(modalId).classList.add("hidden");
    });
  }

  // ── Boot ───────────────────────────────────────────────────────────────
  buildSwatches();
  applyTheme((() => {
    try { return localStorage.getItem(THEME_KEY) || DEFAULT_THEME; } catch (e) { return DEFAULT_THEME; }
  })());

  const settings = BOX.readSettings();
  const state = {
    confirmBulk: settings.confirmBulk !== false,
    dmgNumbers: settings.dmgNumbers !== false,
    junkMax: settings.junkMax || 2,
  };
  function persistSettings() { BOX.writeSettings(state); }
  UI.setConfirmBulk(state.confirmBulk);
  UI.setShowDamage(state.dmgNumbers);
  UI.setJunkMax(state.junkMax);

  BOX.initLocalSave();
  UI.buildGrid();
  UI.renderRoster();

  // The two models both repaint through here. FARM owns the clicker, BOX owns the
  // charms; each tells the UI when something moved rather than the UI polling.
  function markRunDirty() {
    // Zenny, ore and upgrades live in FARM, so a purchase or a kill has to mark the
    // save stale too — otherwise only charm movements would ever persist and a
    // shopping trip would vanish on reload.
    BOX.markDirty();
    $("dirtyDot").classList.remove("hidden");
    if (!document.title.startsWith("●")) document.title = "● MHGU Charm Farm";
  }

  FARM.init(null, {
    // Bare HP change: repaint the arena and nothing else. This runs on every click
    // and ten times a second while Palicoes are working, so it must not touch the
    // shop or the ore strip — rebuilding those here is what made purchases misfire.
    onTick: () => { UI.renderArena(); },
    // A hired hunter's attack should look like an attack — same flash and floating
    // number a click gets, so you can see the crits they land.
    onAutoClick: res => {
      if (!res) return;
      UI.hitFlash();
      UI.floatDamage(res.crit ? `${res.dealt}!` : String(res.dealt), res.crit);
    },
    onChange: () => {
      UI.renderArena(); UI.renderOres(); UI.renderShop();
      markRunDirty();
    },
    onKill: res => {
      // The pot resolves first: it frees three slots and returns one, so a nearly
      // full box is likelier to have room for the hunt's drops afterwards.
      const meld = BOX.resolveOneMeld();
      const placed = BOX.add(res.charms);
      // A god charm outranks every other thing the hunt could tell you about.
      const god = res.charms.find(ROLL.isGod) || (meld && ROLL.isGod(meld.charm) ? meld.charm : null);
      if (god) {
        toast(`God charm! A ${ROLL.charmName(god.r)} with three slots and both skills maxed.`, 6000);
      } else if (placed < res.charms.length) {
        const lost = res.charms.length - placed;
        toast(`Box full — ${lost} charm${lost === 1 ? "" : "s"} lost. Sell or meld something.`, 3600);
      } else if (meld) {
        toast(`The pot returned a ${ROLL.charmName(meld.charm.r)}.`);
      }
      UI.renderAll();
      if (meld) UI.flashFresh(meld.index);
    },
  });
  BOX.on(() => {
    UI.renderGrid();
    UI.renderPot();
    UI.renderDetail();
    $("dirtyDot").classList.toggle("hidden", !BOX.dirty);
    document.title = (BOX.dirty ? "● " : "") + "MHGU Charm Farm";
  });

  UI.initEvents({
    attack: () => {
      const res = FARM.click();
      if (!res) return;
      UI.hitFlash();
      UI.floatDamage(res.crit ? `${res.dealt}!` : String(res.dealt), res.crit);
    },
    confirm: askConfirm,
    settingChanged: (key, value) => { state[key] = value; persistSettings(); },
  });

  // The select lives in the toolbar, so set it after initEvents has bound it.
  UI.setJunkMax(state.junkMax);

  // Restore. With browser-save on it loads silently; with it off, the banner offers
  // the choice rather than throwing away last session's work without asking.
  const stored = BOX.storedSave();
  if (stored && !BOX.validateSave(stored)) {
    if (BOX.localSaveEnabled) {
      BOX.load(stored);
      BOX.dirty = false;
      toast("Farm restored.");
    } else {
      $("restoreBanner").classList.remove("hidden");
      $("restoreYes").addEventListener("click", () => {
        BOX.load(stored);
        BOX.dirty = false;
        $("restoreBanner").classList.add("hidden");
        UI.renderAll();
        toast("Farm restored.");
      });
      $("restoreNo").addEventListener("click", () => $("restoreBanner").classList.add("hidden"));
    }
  }

  // Booting isn't a change the user made, and FARM.init's first onChange marks the
  // save stale on the way in — so clear it once everything is up.
  BOX.dirty = false;
  document.title = "MHGU Charm Farm";
  UI.renderAll();

  // ── Chrome wiring ──────────────────────────────────────────────────────
  $("saveBtn").addEventListener("click", () => saveToFile(false));
  $("saveAsBtn").addEventListener("click", () => saveToFile(true));
  $("openBtn").addEventListener("click", () => openFile());
  $("importFile").addEventListener("change", function () {
    const f = this.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = e => loadFromText(e.target.result);
    r.readAsText(f);
    this.value = "";
  });

  bindModal("aboutBtn", "aboutModal", "aboutClose");
  bindModal("linksBtn", "linksModal", "linksClose");
  bindModal("settingsBtn", "settingsModal", "settingsClose");
  bindModal("helpBtn", "helpModal", "helpClose");

  bindToggle("localSaveToggle", () => BOX.localSaveEnabled, v => {
    BOX.setLocalSave(v);
    toast(v ? "This browser will remember your farm." : "Browser save turned off.");
  });
  bindToggle("confirmBulkToggle", () => state.confirmBulk, v => {
    state.confirmBulk = v; UI.setConfirmBulk(v); persistSettings();
  });
  bindToggle("dmgNumbersToggle", () => state.dmgNumbers, v => {
    state.dmgNumbers = v; UI.setShowDamage(v); persistSettings();
  });

  $("clearLocalBtn").addEventListener("click", () => {
    BOX.clearLocalSave();
    toast("Browser save cleared.");
  });
  $("resetRunBtn").addEventListener("click", () => {
    askConfirm("Reset the run?", "Zenny, hunts, upgrades, ore, the box and the pot all go back to zero. This can't be undone.", () => {
      BOX.emptyBox();
      BOX.emptyPot();
      BOX.emptyBox();          // anything the pot handed back goes too
      FARM.reset();
      UI.page = 0;
      UI.clearSelection();
      UI.renderAll();
      $("settingsModal").classList.add("hidden");
      toast("Run reset.");
    });
  });

  // ── Keyboard ───────────────────────────────────────────────────────────
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal:not(.hidden)").forEach(m => m.classList.add("hidden"));
      confirmAction = null;
      $("restoreBanner").classList.add("hidden");
      return;
    }
    if (e.key === "s" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); saveToFile(false); return; }
    if (document.querySelector(".modal:not(.hidden)")) return;
    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "select" || tag === "textarea") return;
    // Space attacks. It's also the browser's scroll key and the activate key for the
    // focused button, so swallow it here and drive the hit ourselves — otherwise a
    // focused monster button would register two hits per press.
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      const res = FARM.click();
      if (res) { UI.hitFlash(); UI.floatDamage(res.crit ? `${res.dealt}!` : String(res.dealt), res.crit); }
    }
  });

  window.addEventListener("beforeunload", e => {
    if (BOX.dirty && !BOX.localSaveEnabled) { e.preventDefault(); e.returnValue = ""; }
  });

  // The MHFU font swaps in after first paint and some glyph widths change with it;
  // nudging opacity forces a repaint so nothing is left mis-measured.
  document.fonts.ready.then(() => {
    document.body.style.opacity = "0.999";
    requestAnimationFrame(() => { document.body.style.opacity = ""; });
  });
})();
