// The charm box, the melding pot, and everything that persists.
//
// Storage note: this app keeps its OWN document. It deliberately does not touch
// `mhgu-tracker-autosave`, the doc the Collection Tracker / Equipment Box / Set Builder
// share — a farm sim generating thousands of junk charms has no business writing into
// the box you actually plan sets with.
window.BOX = (function () {
  "use strict";

  const SAVE_APP = "mhgu-charm-farm";
  const SAVE_VERSION = 1;
  const AUTOSAVE_KEY = "mhgu-charm-farm-autosave";
  const LOCAL_ENABLED_KEY = "mhgu-charm-farm-local";
  const SETTINGS_KEY = "mhgu-charm-farm-settings";

  const BOX_SIZE = 500;      // 5 pages of 100
  const PAGE = 100;
  const POT_ROWS = 10;
  const POT_COLS = 3;

  let box = new Array(BOX_SIZE).fill(null);
  let pot = Array.from({ length: POT_ROWS }, () => new Array(POT_COLS).fill(null));
  // Load order per row — 0 means "not a complete row". See queuedRows().
  let potSeq = new Array(POT_ROWS).fill(0);
  let seqNext = 1;
  let localSaveEnabled = true;
  let dirty = false;
  let saveTimer = null;
  let listeners = [];

  const on = fn => listeners.push(fn);
  const emit = () => listeners.forEach(fn => fn());

  // Flag the save as stale and schedule a flush. Deliberately NOT a resetting
  // debounce: the clicker marks state dirty many times a second, and a debounce that
  // restarted on every mark would never actually fire while you were playing. Setting
  // the timer only when none is pending caps the write rate at one per 500 ms while
  // guaranteeing it happens.
  function markDirty() {
    dirty = true;
    if (!saveTimer) saveTimer = setTimeout(() => { saveTimer = null; flushAutosave(); }, 500);
  }

  // Every mutation that changes what's on screen funnels through here, so the dirty
  // dot and storage can never drift apart from the box you're looking at. Run state
  // (zenny, ore, upgrades) uses markDirty instead — it changes ten times a second and
  // has no business repainting 100 grid cells.
  function touched() {
    markDirty();
    emit();
  }

  // ── Box ──────────────────────────────────────────────────────────────────────
  const count = () => box.reduce((n, c) => n + (c ? 1 : 0), 0);
  const isFull = () => count() >= BOX_SIZE;
  const get = i => box[i] || null;
  const pages = () => Math.ceil(BOX_SIZE / PAGE);

  function firstEmpty() {
    for (let i = 0; i < BOX_SIZE; i++) if (!box[i]) return i;
    return -1;
  }

  // Returns how many actually landed — the caller reports the shortfall rather than
  // silently dropping charms on the floor.
  function add(charms) {
    let placed = 0;
    for (const c of charms) {
      const i = firstEmpty();
      if (i < 0) break;
      box[i] = c;
      placed++;
    }
    if (placed) touched();
    return placed;
  }

  function removeAt(i) {
    const c = box[i];
    if (!c) return null;
    box[i] = null;
    touched();
    return c;
  }
  function setAt(i, c) { box[i] = c || null; touched(); }

  // A god charm can't be sold, melded, or thrown away by any route. The guard lives
  // here rather than in the UI so no path — a button, a bulk action, a future feature
  // — can get around it by forgetting to check.
  const sellable = c => !!c && !window.ROLL.isGod(c);

  function sellAt(i) {
    const c = box[i];
    if (!sellable(c)) return 0;
    const v = window.ROLL.charmValue(c);
    box[i] = null;
    window.FARM.state.zenny += v;
    touched();
    return v;
  }

  // Bulk sell by a predicate — the release valve when the box fills up.
  function sellWhere(pred) {
    let total = 0, n = 0;
    for (let i = 0; i < BOX_SIZE; i++) {
      if (sellable(box[i]) && pred(box[i], i)) {
        total += window.ROLL.charmValue(box[i]); box[i] = null; n++;
      }
    }
    if (n) { window.FARM.state.zenny += total; touched(); }
    return { zenny: total, count: n };
  }

  function sortBox(key, dir) {
    const filled = box.filter(Boolean);
    const sign = dir === "desc" ? -1 : 1;
    const skill = c => (c.k[0] ? c.k[0][1] : 0);
    const cmp = {
      rarity: (a, b) => a.r - b.r,
      slots: (a, b) => a.s - b.s,
      value: (a, b) => window.ROLL.charmValue(a) - window.ROLL.charmValue(b),
      skill: (a, b) => skill(a) - skill(b),
      name: (a, b) => window.ROLL.treeName(a.k[0][0]).localeCompare(window.ROLL.treeName(b.k[0][0])),
    }[key];
    if (!cmp) return;
    filled.sort((a, b) => sign * cmp(a, b));
    box = filled.concat(new Array(BOX_SIZE - filled.length).fill(null));
    touched();
  }

  function emptyBox() { box = new Array(BOX_SIZE).fill(null); touched(); }

  // ── Melding pot ──────────────────────────────────────────────────────────────
  const potGet = (r, c) => pot[r][c] || null;

  // Move a charm from a box slot into a pot slot. Anything already in the pot slot
  // goes back to the box rather than being destroyed.
  function potLoad(r, c, boxIndex) {
    const charm = box[boxIndex];
    if (!charm) return false;
    if (window.ROLL.isGod(charm)) return false;   // never meld away a god charm
    const displaced = pot[r][c];
    pot[r][c] = charm;
    box[boxIndex] = displaced || null;
    restamp(r);
    touched();
    return true;
  }

  function potUnload(r, c) {
    const charm = pot[r][c];
    if (!charm) return false;
    const i = firstEmpty();
    if (i < 0) return false;      // box full — caller toasts
    box[i] = charm;
    pot[r][c] = null;
    restamp(r);
    touched();
    return true;
  }

  const rowReady = r => window.ROLL.legalMeld(pot[r][0], pot[r][1], pot[r][2]);

  // Why a row can't be melded, as a sentence. Null means it can.
  function rowProblem(r) {
    const row = pot[r];
    const filled = row.filter(Boolean);
    if (filled.length < 3) return `Needs ${3 - filled.length} more charm${filled.length === 2 ? "" : "s"}.`;
    if (filled.some(window.ROLL.isGod)) return "A god charm can't be melded.";
    const rar = filled.map(c => c.r);
    if (new Set(rar).size > 1) {
      const names = [...new Set(rar)].sort((a, b) => a - b).map(x => window.ROLL.charmName(x));
      return `All three must be the same rarity — you have ${names.join(" and ")}.`;
    }
    const fee = window.ROLL.meldFee(rar[0]);
    if (window.FARM.state.zenny < fee) return `Needs ${fee.toLocaleString()}z to meld.`;
    return null;
  }

  // Three of a rarity in, one of that rarity out. Result goes to the box; the index is
  // returned so the UI can flash it.
  function meldRow(r) {
    if (rowProblem(r)) return null;
    const rar = pot[r][0].r;
    const out = window.ROLL.meld(pot[r][0], pot[r][1], pot[r][2]);
    if (!out) return null;
    const i = firstEmpty();
    if (i < 0) return null;
    window.FARM.state.zenny -= window.ROLL.meldFee(rar);
    pot[r] = [null, null, null];
    potSeq[r] = 0;
    box[i] = out;
    touched();
    return { index: i, charm: out };
  }

  // Rows waiting their turn, oldest first. The pot is a genuine FIFO queue: whatever
  // has been sitting there longest resolves next.
  //
  // Row position can't carry that order on its own. Auto-fill always refills the
  // topmost empty row, so a row that just resolved gets brand-new charms and — under
  // plain top-down resolution — would immediately jump the queue ahead of rows that
  // had been waiting since before it. Each row therefore gets a sequence number when
  // it's completed, and that, not its position, decides its turn.
  function queuedRows() {
    const out = [];
    for (let r = 0; r < POT_ROWS; r++) if (!rowProblem(r)) out.push(r);
    out.sort((a, b) => (potSeq[a] || 0) - (potSeq[b] || 0) || a - b);
    return out;
  }

  // Stamp a row the moment it holds three charms, and clear the stamp when it stops.
  function restamp(r) {
    const full = pot[r].every(Boolean);
    if (full && !potSeq[r]) potSeq[r] = seqNext++;
    else if (!full) potSeq[r] = 0;
  }

  // Called when a Brachydios dies. Resolves the next row in the queue and nothing
  // else — one meld per hunt is the whole rule.
  function resolveOneMeld() {
    const queue = queuedRows();
    if (!queue.length) return null;
    const r = queue[0];
    const m = meldRow(r);
    return m ? Object.assign({ row: r }, m) : null;
  }

  // Fill the pot greedily from the box: whichever rarities have three or more spare
  // copies get loaded, best rarity first. Saves a lot of dragging.
  function autoFill() {
    let loaded = 0;
    for (let r = 0; r < POT_ROWS; r++) {
      if (pot[r].some(Boolean)) continue;
      const byRarity = {};
      for (let i = 0; i < BOX_SIZE; i++) {
        if (!box[i] || window.ROLL.isGod(box[i])) continue;
        (byRarity[box[i].r] = byRarity[box[i].r] || []).push(i);
      }
      const pick = Object.keys(byRarity).map(Number).filter(k => byRarity[k].length >= 3)
        .sort((a, b) => b - a)[0];
      if (pick === undefined) break;
      const idx = byRarity[pick].slice(0, 3);
      for (let c = 0; c < 3; c++) { pot[r][c] = box[idx[c]]; box[idx[c]] = null; }
      restamp(r);
      loaded++;
    }
    if (loaded) touched();
    return loaded;
  }

  function emptyPot() {
    for (let r = 0; r < POT_ROWS; r++) {
      for (let c = 0; c < POT_COLS; c++) {
        if (!pot[r][c]) continue;
        const i = firstEmpty();
        if (i < 0) return false;
        box[i] = pot[r][c];
        pot[r][c] = null;
      }
      potSeq[r] = 0;
    }
    touched();
    return true;
  }

  // ── Save payload ─────────────────────────────────────────────────────────────
  // Sparse and index-keyed: 500 nulls would dwarf the content in a young save.
  function payload() {
    const entries = {};
    for (let i = 0; i < BOX_SIZE; i++) if (box[i]) entries[i] = box[i];
    return {
      app: SAVE_APP,
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      run: JSON.parse(JSON.stringify(window.FARM.state)),
      box: { size: BOX_SIZE, entries },
      pot: pot.map(row => row.map(c => c || null)),
      // Queue order, so reloading doesn't shuffle whose turn it is.
      potSeq: potSeq.slice(),
    };
  }

  // Returns a user-facing sentence, or null when the file is usable.
  function validateSave(obj) {
    if (!obj || typeof obj !== "object") return "That file isn't JSON this app understands.";
    if (obj.app !== SAVE_APP) {
      return obj.app
        ? `That's a save from "${obj.app}", not the Charm Farm.`
        : "That file doesn't say which app wrote it.";
    }
    if (obj.version > SAVE_VERSION) return "That save was written by a newer version of this app.";
    if (!obj.box || typeof obj.box.entries !== "object") return "That save has no charm box in it.";
    return null;
  }

  function load(obj) {
    box = new Array(BOX_SIZE).fill(null);
    const entries = (obj.box && obj.box.entries) || {};
    for (const k in entries) {
      const i = Number(k);
      if (i >= 0 && i < BOX_SIZE && entries[k]) box[i] = entries[k];
    }
    pot = Array.from({ length: POT_ROWS }, () => new Array(POT_COLS).fill(null));
    if (Array.isArray(obj.pot)) {
      obj.pot.slice(0, POT_ROWS).forEach((row, r) => {
        if (Array.isArray(row)) row.slice(0, POT_COLS).forEach((c, i) => { pot[r][i] = c || null; });
      });
    }
    // Restore queue order. A save written before this existed has no potSeq, so fall
    // back to row order — the best guess available, and stable from then on.
    potSeq = new Array(POT_ROWS).fill(0);
    const saved = Array.isArray(obj.potSeq) ? obj.potSeq : null;
    for (let r = 0; r < POT_ROWS; r++) {
      if (!pot[r].every(Boolean)) continue;
      potSeq[r] = saved && saved[r] ? saved[r] : r + 1;
    }
    seqNext = Math.max(0, ...potSeq) + 1;
    window.FARM.init(obj.run, null);
    dirty = false;
    emit();
  }

  // ── localStorage ─────────────────────────────────────────────────────────────
  function readStored(key) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
    catch (e) { return null; }
  }
  function flushAutosave() {
    if (!localSaveEnabled) return;
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(payload())); } catch (e) {}
  }
  function clearLocalSave() { try { localStorage.removeItem(AUTOSAVE_KEY); } catch (e) {} }
  const storedSave = () => readStored(AUTOSAVE_KEY);

  function setLocalSave(on) {
    localSaveEnabled = !!on;
    try { localStorage.setItem(LOCAL_ENABLED_KEY, on ? "1" : "0"); } catch (e) {}
    if (on) flushAutosave(); else clearLocalSave();
  }
  function initLocalSave() {
    const v = (() => { try { return localStorage.getItem(LOCAL_ENABLED_KEY); } catch (e) { return null; } })();
    localSaveEnabled = v === null ? true : v === "1";
    return localSaveEnabled;
  }

  const readSettings = () => readStored(SETTINGS_KEY) || {};
  function writeSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) {} }

  return {
    BOX_SIZE, PAGE, POT_ROWS, POT_COLS, SAVE_APP, SAVE_VERSION,
    on, touched, markDirty, emit,
    get, add, removeAt, setAt, sellAt, sellWhere, sortBox, emptyBox,
    count, isFull, pages, firstEmpty,
    potGet, potLoad, potUnload, rowReady, rowProblem, meldRow, queuedRows, resolveOneMeld,
    autoFill, emptyPot,
    payload, validateSave, load,
    storedSave, flushAutosave, clearLocalSave, setLocalSave, initLocalSave,
    readSettings, writeSettings,
    get dirty() { return dirty; },
    set dirty(v) { dirty = v; },
    get localSaveEnabled() { return localSaveEnabled; },
  };
})();
