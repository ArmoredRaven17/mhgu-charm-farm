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
  // The palette IS the roster: one theme per Brachydios variant, coloured after the
  // ore it wears. The other apps in the family pick their themes from monsters
  // generally; this one only ever fights the one monster, so its swatches are the
  // fourteen coats you'll actually meet, each showing the sprite under its own tint.
  const SPRITES = {
    brachy: "assets/MonsterIcons/MHGU-Brachydios_Icon.webp",
    raging: "assets/MonsterIcons/MHGU-Raging_Brachydios_Icon.webp",
  };
  const THEME_VARIANTS = FARM.VARIANTS.filter(v => v.theme);
  const BY_HEX = Object.fromEntries(THEME_VARIANTS.map(v => [v.theme.toUpperCase(), v]));
  // Brachydios, because he's the one you start on.
  const DEFAULT_THEME = "#0B2757";
  // The swatch caption drops the shared surname — fourteen tiles all ending in
  // "Brachydios" would just be fourteen copies of the same word.
  const shortName = v => v.id === "base" ? "Brachydios"
    : v.name.replace(/ Brachydios$/, "").replace(/^Raging$/, "Raging");

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
  let currentTheme = DEFAULT_THEME;
  function applyTheme(hex) {
    currentTheme = hex;
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
    // The titlebar shows whichever Brachydios you themed the app after, wearing the
    // same tint the arena would give it.
    const titleIcon = document.querySelector(".title-icon");
    const v = BY_HEX[hex.toUpperCase()];
    if (titleIcon && v) {
      titleIcon.src = SPRITES[v.icon];
      titleIcon.style.filter = v.filter === "none" ? "" : v.filter;
      titleIcon.alt = v.name;
      titleIcon.title = v.name;
    }
  }
  // A variant's theme is earned by hunting it. Until then the tile is a placeholder —
  // the Forbidden colour and a question mark — so the roster reads as something to
  // fill in rather than a list of colours you already have.
  const LOCKED_HEX = "#1E2025";
  const LOCKED_ICON = "assets/MonsterIcons/MHGU-Question_Mark_Icon.webp";

  function buildSwatches() {
    const wrap = $("swatches");
    wrap.innerHTML = "";
    for (const v of THEME_VARIANTS) {
      const seen = FARM.hasSeen(v.id);
      const d = document.createElement("div");
      d.className = "swatch" + (seen ? "" : " locked");
      d.dataset.hex = seen ? v.theme : "";
      d.style.background = seen ? v.theme : LOCKED_HEX;
      if (seen) {
        d.title = v.name;
        const filter = v.filter === "none" ? "" : `filter:${v.filter}`;
        d.innerHTML = `<img class="swatch-icon" src="${SPRITES[v.icon]}" alt="" style="${filter}">` +
          `<span>${UI.esc(shortName(v))}</span>`;
        d.addEventListener("click", () => applyTheme(v.theme));
      } else {
        // No name and no tint — knowing which coat is missing is half the hunt.
        d.title = "Hunt this Brachydios to unlock its theme";
        d.innerHTML = `<img class="swatch-icon" src="${LOCKED_ICON}" alt=""><span>Locked</span>`;
      }
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
    buildSwatches();          // a different save has met a different set of coats
    restoreTheme();
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
  // Which swatches are unlocked depends on FARM's `seen` list, so the picker can only
  // be built once the run state exists — that happens further down, after the save is
  // restored. Only the colours go on now, so the page isn't grey while it loads.
  function restoreTheme() {
    let saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) {}
    // A hex from the old monster palette won't match any Brachydios, and a theme for
    // a variant you haven't hunted shouldn't survive a Reset Run — fall back rather
    // than show a theme whose own tile is locked.
    const v = saved && BY_HEX[saved.toUpperCase()];
    applyTheme(v && FARM.hasSeen(v.id) ? saved : DEFAULT_THEME);
  }

  const settings = BOX.readSettings();
  const state = {
    confirmBulk: settings.confirmBulk !== false,
    junkMax: settings.junkMax || 2,
    autoSort: !!settings.autoSort,
    sortKey: settings.sortKey || "",
    sortDir: settings.sortDir === "asc" ? "asc" : "desc",
    // Which hires are stood down. Kokoto Gal used to be the only one you could switch
    // off, from Settings; that single flag is carried over here.
    hiresPaused: Object.assign(
      settings.kokotoActive === false ? { kokoto: true } : {},
      settings.hiresPaused || {}),
  };
  // A hire only acts if you employ them and haven't stood them down.
  const hireOn = id => FARM.lvl(id) > 0 && !state.hiresPaused[id];
  function persistSettings() { BOX.writeSettings(state); }
  UI.setConfirmBulk(state.confirmBulk);
  UI.setJunkMax(state.junkMax);

  BOX.initLocalSave();
  UI.buildGrid();
  UI.renderRoster();

  // The two models both repaint through here. FARM owns the clicker, BOX owns the
  // charms; each tells the UI when something moved rather than the UI polling.
  // How much of a still-needed ore the Argosy Captain leaves you. Enough to cover
  // several upgrade levels without hoarding.
  const ARGOSY_RESERVE = 60;
  let argosyEarned = 0, nekoEarned = 0;

  // Set while replaying an absence. The catch-up runs the real kill path thousands of
  // times, and each kill would otherwise rebuild the shop and ore strip with innerHTML
  // — so painting is suppressed and done once at the end.
  let quiet = false;
  let offlineGod = null, offlineGodHunts = 0, offlineGodNumber = 0;

  // How much of an absence counts. Beyond this you're not "away", you've stopped
  // playing — and an unbounded window would let a save sat on for a month trivialise
  // the whole economy on one reload.
  const MAX_OFFLINE_HOURS = 8;
  const MIN_OFFLINE_SECONDS = 60;

  // Replay what the Palicoes and hired hunters did while the tab was shut, then say
  // what happened. Painting is suppressed for the duration and done once at the end.
  function applyOfflineProgress(savedAt) {
    const parsed = Date.parse(savedAt || "");
    if (!parsed) return;
    const away = (Date.now() - parsed) / 1000;
    if (!(away >= MIN_OFFLINE_SECONDS)) return;
    const counted = Math.min(away, MAX_OFFLINE_HOURS * 3600);

    quiet = true;
    offlineGod = null; offlineGodHunts = 0; offlineGodNumber = 0;
    let summary = null;
    try { summary = FARM.catchUp(counted); }
    finally { quiet = false; }
    if (!summary || !summary.kills) return;
    UI.maybeAutoSort();     // once for the whole absence, not once per replayed kill

    const hrs = Math.floor(counted / 3600), mins = Math.round((counted % 3600) / 60);
    const span = hrs ? `${hrs}h ${mins}m` : `${mins}m`;
    let msg = `Away ${span} — your Palicoes and hunters landed ${summary.kills.toLocaleString()} ` +
      `hunt${summary.kills === 1 ? "" : "s"} and ${summary.zenny.toLocaleString()}z.`;
    if (away > MAX_OFFLINE_HOURS * 3600) msg += ` (Capped at ${MAX_OFFLINE_HOURS} hours.)`;
    if (offlineGod) {
      msg += ` God Charm #${offlineGodNumber} at ${offlineGodHunts.toLocaleString()} hunts.`;
    }
    toast(msg, offlineGod ? 9000 : 6000);
  }

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
    onTick: () => { if (!quiet) UI.renderArena(); },
    // A hired hunter's attack should look like an attack — same flash and floating
    // number a click gets, so you can see the crits they land.
    onAutoClick: res => { UI.showHit(res); },
    onChange: () => {
      if (quiet) return;
      UI.renderArena(); UI.renderOres(); UI.renderShop();
      markRunDirty();
    },
    onKill: res => {
      // The pot resolves first: it frees three slots and returns one, so a nearly
      // full box is likelier to have room for the hunt's drops afterwards.
      const meld = BOX.resolveOneMeld();
      const placed = BOX.add(res.charms);

      // Maximeld XIV reloads the pot once the hunt's drops are in, so the row that
      // just resolved is refilled from whatever the kill produced.
      if (hireOn("maximeld")) BOX.autoFill();

      // Neko clears out junk. She reads the same "Junk ≤" dropdown the Sell Junk
      // button uses, so hiring her doesn't add a control — it just stops you pressing
      // the button. Low-rarity charms are the ones that pile up worst: Auto-fill can
      // only load a rarity you hold three of, so a trickle of rarity 1s and 2s never
      // reaches the pot at all and would otherwise sit there forever.
      if (hireOn("neko")) {
        const sale = BOX.sellWhere(c => c.r <= state.junkMax);  // god charms already exempt
        if (sale.count) nekoEarned += sale.zenny;
      }

      // The Argosy Captain clears the shelves: anything no remaining upgrade level
      // will ever ask for goes entirely, and still-wanted ore is trimmed to a reserve
      // so a full stack of Iron Ore isn't sitting there forever.
      if (hireOn("argosy")) {
        const need = FARM.oresStillNeeded();
        let earned = 0;
        for (const o of FARM.ORES) {
          const have = FARM.state.ores[o.id] || 0;
          if (!have) continue;
          const keep = need.has(o.id) ? ARGOSY_RESERVE : 0;
          if (have > keep) earned += FARM.sellOre(o.id, have - keep);
        }
        if (earned) argosyEarned += earned;
      }

      // Kokoto Gal spends for you, clearing a rung of the ore ladder before climbing
      // to the next — see FARM.nextPurchase, which the simulation uses too. The bound
      // is belt-and-braces: every purchase raises its own next cost, so the loop
      // terminates on its own, but a runaway here would freeze the tab.
      if (hireOn("kokoto")) {
        for (let i = 0; i < 40; i++) {
          const pick = FARM.nextPurchase();
          if (!pick) break;
          FARM.buy(pick.up.id);
        }
      }
      // First of its kind: its theme is now yours, so rebuild the picker. Tracked even
      // while replaying an absence — you did meet it — but the picker is rebuilt once
      // at the end rather than on every one of a few thousand catch-up kills.
      const unlocked = res.firstOfItsKind && res.variant.theme;
      if (unlocked && !quiet) {
        buildSwatches();
        applyTheme(currentTheme);        // reapplies the `sel` marker to the new tiles
        toast(`${res.variant.name} hunted — its theme is unlocked.`, 4000);
      }

      // A god charm outranks every other thing the hunt could tell you about. Worth
      // surfacing even from an offline haul, so it's recorded rather than skipped.
      const god = res.charms.find(ROLL.isGod) || (meld && ROLL.isGod(meld.charm) ? meld.charm : null);
      // Tallied and stamped here rather than when the message is built, so one that
      // drops during a replayed absence reports the hunt count it actually fell at
      // instead of the total after the whole catch-up.
      let godAt = 0, godNumber = 0;
      if (god) {
        godAt = FARM.state.kills;
        godNumber = ++FARM.state.gods;
        offlineGod = god; offlineGodHunts = godAt; offlineGodNumber = godNumber;
      }
      if (quiet) return;                 // the rest is painting and toasts

      if (god) {
        toast(`God Charm #${godNumber} at ${godAt.toLocaleString()} hunts.`, 9000);
      } else if (placed < res.charms.length) {
        const lost = res.charms.length - placed;
        toast(`Box full — ${lost} charm${lost === 1 ? "" : "s"} lost. Sell or meld something.`, 3600);
      } else if (meld) {
        toast(`The pot returned a ${ROLL.charmName(meld.charm.r)}.`);
      }
      // Last thing before painting, so the pot's output and this hunt's drops are
      // sorted in with everything else rather than left where they landed. Sorting
      // moves objects, so the melded charm's index has to be looked up again.
      const sorted = UI.maybeAutoSort();
      UI.renderAll();
      if (meld) UI.flashFresh(sorted ? BOX.indexOf(meld.charm) : meld.index);
    },
  });
  BOX.on(() => {
    // Also silenced during catch-up. Each replayed kill touches the box several times
    // over (drops, meld, Auto-fill, Neko), and every touch would otherwise repaint the
    // grid and rebuild the pot's markup — which is what made an eight-hour absence
    // block the page for ten seconds on load.
    if (quiet) return;
    UI.renderGrid();
    UI.renderPot();
    UI.renderDetail();
    $("dirtyDot").classList.toggle("hidden", !BOX.dirty);
    document.title = (BOX.dirty ? "● " : "") + "MHGU Charm Farm";
  });

  UI.initEvents({
    attack: () => { UI.showHit(FARM.click()); },
    confirm: askConfirm,
    settingChanged: (key, value) => { state[key] = value; persistSettings(); },
  });

  // These live in the toolbar, so set them after initEvents has bound them.
  UI.setJunkMax(state.junkMax);
  UI.setAutoSort(state.autoSort);
  UI.setHiresPaused(state.hiresPaused);
  UI.setSortDir(state.sortDir);
  UI.setSortKey(state.sortKey);

  // Restore. With browser-save on it loads silently; with it off, the banner offers
  // the choice rather than throwing away last session's work without asking.
  const stored = BOX.storedSave();
  if (stored && !BOX.validateSave(stored)) {
    if (BOX.localSaveEnabled) {
      BOX.load(stored);
      BOX.dirty = false;
      // The offline haul is the more interesting message, so it replaces the plain
      // "restored" note when there is one.
      const before = FARM.state.kills;
      applyOfflineProgress(stored.savedAt);
      if (FARM.state.kills === before) toast("Farm restored.");
    } else {
      $("restoreBanner").classList.remove("hidden");
      $("restoreYes").addEventListener("click", () => {
        BOX.load(stored);
        BOX.dirty = false;
        $("restoreBanner").classList.add("hidden");
        const before = FARM.state.kills;
        applyOfflineProgress(stored.savedAt);
        buildSwatches();                 // the absence may have unlocked coats
        applyTheme(currentTheme);
        UI.renderAll();
        if (FARM.state.kills === before) toast("Farm restored.");
      });
      $("restoreNo").addEventListener("click", () => $("restoreBanner").classList.add("hidden"));
    }
  }

  // Now that the run state is loaded, the picker knows which coats you've met.
  buildSwatches();
  restoreTheme();

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
      buildSwatches();          // every coat but the base is a stranger again
      applyTheme(DEFAULT_THEME);
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
      UI.showHit(FARM.click());
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
