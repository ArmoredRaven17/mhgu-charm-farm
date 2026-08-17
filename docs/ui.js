// All DOM rendering: the arena, the ore strip, the shop, the box grid, the pot and
// the detail panel. Everything reads state from FARM/BOX and paints; nothing here owns
// game state.
window.UI = (function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const SPRITES = {
    brachy: "assets/MonsterIcons/MHGU-Brachydios_Icon.webp",
    raging: "assets/MonsterIcons/MHGU-Raging_Brachydios_Icon.webp",
  };
  const oreIcon = id => "assets/OreIcons/" + window.FARM.oreById[id].icon;
  const charmIcon = c => `assets/icons/icon_talisman_r${c.r}.png`;

  let page = 0;
  let selected = -1;        // flat box index of the inspected charm
  let sortDir = "desc";
  let showDamage = true;
  let confirmBulk = true;
  let toastTimer = null;
  let cells = [];           // the 100 cell divs, built once and repainted in place

  // ── Toast ────────────────────────────────────────────────────────────────────
  function toast(msg, ms) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), ms || 2600);
  }

  // ── Arena ────────────────────────────────────────────────────────────────────
  function renderArena() {
    const F = window.FARM, v = F.variant(), s = F.state;
    $("arenaName").textContent = v.name;
    $("arenaRank").textContent = `${F.rankName()} · ${s.kills} hunt${s.kills === 1 ? "" : "s"}`;

    const img = $("targetImg");
    const src = SPRITES[v.icon];
    if (img.getAttribute("src") !== src) img.setAttribute("src", src);
    if (img.style.filter !== v.filter) img.style.filter = v.filter === "none" ? "" : v.filter;

    const max = F.hpMax();
    const hp = Math.max(0, s.hp);
    $("hpFill").style.width = (max > 0 ? (hp / max) * 100 : 0) + "%";
    $("hpText").textContent = `${Math.ceil(hp).toLocaleString()} / ${max.toLocaleString()}`;

    $("statDmg").textContent = F.clickDamage().toLocaleString();
    $("statCrit").textContent = Math.round(F.critChance() * 100) + "%";
    $("statDps").textContent = F.dps() + "/s";
    $("statDrop").textContent = F.dropCount();

    $("zennyPill").textContent = Math.floor(s.zenny).toLocaleString() + "z";
  }

  // A damage number floating off the monster. Removed on animationend so nothing
  // piles up under a fast clicker.
  function floatDamage(text, crit) {
    if (!showDamage) return;
    const host = $("target");
    const el = document.createElement("div");
    el.className = "dmg" + (crit ? " crit" : "");
    el.textContent = text;
    el.style.left = (25 + Math.random() * 50) + "%";
    el.style.top = (30 + Math.random() * 30) + "%";
    el.addEventListener("animationend", () => el.remove());
    host.appendChild(el);
  }

  function hitFlash() {
    const t = $("target");
    t.classList.add("hitflash");
    setTimeout(() => t.classList.remove("hitflash"), 60);
  }

  // ── Ore strip ────────────────────────────────────────────────────────────────
  function renderOres() {
    const F = window.FARM, stock = F.state.ores;
    // Only ores your rank could have met are worth a row; the rest would be twelve
    // permanent zeroes on a fresh save.
    const rank = F.rankIndex();
    const visible = F.ORES.filter(o => o.rank <= rank || (stock[o.id] || 0) > 0);
    $("oreStrip").innerHTML = visible.map(o => {
      const n = stock[o.id] || 0;
      return `<button type="button" class="ore-chip${n ? "" : " none"}" data-ore="${o.id}"
        title="${esc(o.name)} — sells for ${o.sell.toLocaleString()}z each${n ? ". Click to sell one" : ""}">
        <img src="${oreIcon(o.id)}" alt=""><span>${n}</span></button>`;
    }).join("") || `<span class="detail-empty">No ore yet.</span>`;
  }

  // ── Shop ─────────────────────────────────────────────────────────────────────
  function renderShop() {
    const F = window.FARM;
    $("shop").innerHTML = F.UPGRADES.map(up => {
      const level = F.lvl(up.id);
      const maxed = level >= up.max;
      if (maxed) {
        return `<div class="shop-item maxed">
          <div class="shop-row"><span class="shop-name">${esc(up.name)}</span>
            <span class="shop-lv">MAX</span></div>
          <div class="shop-desc">${esc(up.desc)}</div></div>`;
      }
      const z = F.zennyCost(up, level);
      const oc = F.oreCost(up, level);
      const ore = F.oreById[oc.ore];
      const haveZ = F.state.zenny >= z;
      const haveO = (F.state.ores[oc.ore] || 0) >= oc.qty;
      // Explicit label: the button's name is otherwise assembled from nested divs,
      // which screen readers announce as a wall of numbers or not at all.
      const label = `${up.name}, level ${level}. ${up.desc}. Costs ${z.toLocaleString()} zenny and ${oc.qty} ${ore.name}`;
      return `<button type="button" class="shop-item" data-buy="${up.id}" aria-label="${esc(label)}">
        <div class="shop-row"><span class="shop-name">${esc(up.name)}</span>
          <span class="shop-lv">Lv ${level}</span></div>
        <div class="shop-desc">${esc(up.desc)}</div>
        <div class="shop-cost">
          <span class="${haveZ ? "afford" : "short"}">${z.toLocaleString()}z</span>
          <span class="${haveO ? "afford" : "short"}"><img src="${oreIcon(oc.ore)}" alt="">
            ${oc.qty}x ${esc(ore.name)}</span>
        </div></button>`;
    }).join("");
  }

  // ── Box grid ─────────────────────────────────────────────────────────────────
  function buildGrid() {
    const grid = $("grid");
    grid.innerHTML = "";
    cells = [];
    for (let i = 0; i < window.BOX.PAGE; i++) {
      const d = document.createElement("div");
      d.className = "box-cell empty";
      d.dataset.i = i;
      d.innerHTML = `<img class="cell-icon hidden" alt=""><span class="cell-slot"></span>
        <span class="cell-slots hidden"></span>`;
      grid.appendChild(d);
      cells.push({
        el: d,
        icon: d.querySelector(".cell-icon"),
        slot: d.querySelector(".cell-slot"),
        slots: d.querySelector(".cell-slots"),
      });
    }
  }

  const flatIndex = i => page * window.BOX.PAGE + i;

  function paintCell(i) {
    const c = cells[i];
    const flat = flatIndex(i);
    const charm = window.BOX.get(flat);
    const el = c.el;
    // Preserve transient classes the pointer/animation own, rebuild the rest.
    const fresh = el.classList.contains("fresh");
    el.className = "box-cell" + (charm ? ` filled rarity-${charm.r}` : " empty") +
      (flat === selected ? " selected" : "") + (fresh ? " fresh" : "");
    if (charm) {
      el.draggable = true;
      c.icon.src = charmIcon(charm);
      c.icon.classList.remove("hidden");
      c.slot.textContent = "";
      if (charm.s > 0) {
        c.slots.style.setProperty("--slots", charm.s);
        c.slots.innerHTML = "<span></span>".repeat(charm.s);
        c.slots.classList.remove("hidden");
      } else c.slots.classList.add("hidden");
      el.title = `${window.ROLL.charmName(charm.r)} — ${describe(charm)}`;
    } else {
      el.draggable = false;
      c.icon.classList.add("hidden");
      c.slots.classList.add("hidden");
      c.slot.textContent = flat + 1;
      el.title = `Slot ${flat + 1} — empty`;
    }
  }

  function renderGrid() {
    for (let i = 0; i < cells.length; i++) paintCell(i);
    $("pageIndicator").textContent = `Page ${page + 1} / ${window.BOX.pages()}`;
    $("prevPage").disabled = page === 0;
    $("nextPage").disabled = page >= window.BOX.pages() - 1;
    $("capacityPill").textContent = `${window.BOX.count()} / ${window.BOX.BOX_SIZE}`;
  }

  // One-line summary used in tooltips.
  function describe(c) {
    const parts = (c.k || []).map(s => `${window.ROLL.treeName(s[0])} ${s[1] > 0 ? "+" : ""}${s[1]}`);
    if (c.s > 0) parts.push(`${c.s} slot${c.s === 1 ? "" : "s"}`);
    return parts.join(", ");
  }

  // ── Melding pot ──────────────────────────────────────────────────────────────
  function renderPot() {
    const B = window.BOX;
    let html = "";
    for (let r = 0; r < B.POT_ROWS; r++) {
      let slots = "";
      for (let c = 0; c < B.POT_COLS; c++) {
        const charm = B.potGet(r, c);
        slots += `<div class="pot-slot${charm ? ` filled rarity-${charm.r}` : ""}"
          data-pot="${r}-${c}"${charm ? ` title="${esc(window.ROLL.charmName(charm.r))} — ${esc(describe(charm))}. Click to return it"` : ' title="Drag a charm here"'}>
          ${charm ? `<img src="${charmIcon(charm)}" alt="">` : ""}</div>`;
      }
      const ready = !B.rowProblem(r);
      html += `<div class="pot-row">${slots}
        <button type="button" class="pot-meld${ready ? "" : " notready"}" data-meld="${r}">Meld</button>
      </div>`;
    }
    $("pot").innerHTML = html;

    // The status line explains the first row that isn't ready, rather than greying
    // out ten buttons with no reason given.
    const ready = [];
    let firstProblem = null;
    for (let r = 0; r < B.POT_ROWS; r++) {
      const p = B.rowProblem(r);
      if (!p) ready.push(r);
      else if (firstProblem === null && B.potGet(r, 0)) firstProblem = `Row ${r + 1}: ${p}`;
    }
    $("potStatus").textContent = ready.length
      ? `${ready.length} row${ready.length === 1 ? "" : "s"} ready to meld.`
      : (firstProblem || "Drag three charms of the same rarity into a row.");
  }

  // ── Detail ───────────────────────────────────────────────────────────────────
  const row = (k, v, cls) =>
    `<div class="stat-row"><span class="k">${esc(k)}</span><span class="v${cls ? " " + cls : ""}">${esc(v)}</span></div>`;
  const signed = n => (n > 0 ? "+" : "") + n;

  function renderDetail() {
    const el = $("detail");
    const c = selected >= 0 ? window.BOX.get(selected) : null;
    if (!c) {
      el.innerHTML = `<div class="detail-empty">Click a charm to inspect it.</div>`;
      return;
    }
    const tier = window.ROLL.tierOf(c.r);
    let html = `<div class="detail-icon-wrap"><img src="${charmIcon(c)}" alt=""></div>
      <div class="detail-name">${esc(window.ROLL.charmName(c.r))}</div>
      <div class="detail-section-title">Charm</div>
      ${row("Rarity", c.r)}
      ${row("Roll table", tier.charAt(0).toUpperCase() + tier.slice(1))}
      ${row("Slots", c.s)}
      ${row("Sells for", window.ROLL.charmValue(c).toLocaleString() + "z")}
      <div class="detail-section-title">Skills</div>`;
    for (const s of c.k || []) {
      html += row(window.ROLL.treeName(s[0]), signed(s[1]), s[1] > 0 ? "pos" : s[1] < 0 ? "neg" : "");
    }
    html += `<div class="detail-actions">
      <button class="btn" data-act="pot">Send to pot</button>
      <button class="btn danger" data-act="sell">Sell</button>
    </div>`;
    el.innerHTML = html;

    el.querySelector('[data-act="sell"]').addEventListener("click", () => {
      const v = window.BOX.sellAt(selected);
      if (v) { toast(`Sold for ${v.toLocaleString()}z.`); selected = -1; renderAll(); }
    });
    el.querySelector('[data-act="pot"]').addEventListener("click", () => {
      const spot = firstFreePotSlot();
      if (!spot) return toast("Every melding slot is full.");
      window.BOX.potLoad(spot[0], spot[1], selected);
      selected = -1;
      renderAll();
    });
  }

  function firstFreePotSlot() {
    for (let r = 0; r < window.BOX.POT_ROWS; r++)
      for (let c = 0; c < window.BOX.POT_COLS; c++)
        if (!window.BOX.potGet(r, c)) return [r, c];
    return null;
  }

  // ── Roster (shown in Help) ───────────────────────────────────────────────────
  function renderRoster() {
    const rankName = ["Low", "High", "G"];
    $("roster").innerHTML = window.FARM.VARIANTS.map(v =>
      `<div class="roster-item">
        <img src="${SPRITES[v.icon]}" alt="" style="filter:${v.filter === "none" ? "none" : v.filter}">
        ${esc(v.name)}<div class="roster-rank">${rankName[v.rank]} rank</div>
      </div>`).join("");
  }

  // ── Paint everything ─────────────────────────────────────────────────────────
  function renderAll() {
    renderArena();
    renderOres();
    renderShop();
    renderGrid();
    renderPot();
    renderDetail();
    $("dirtyDot").classList.toggle("hidden", !window.BOX.dirty);
  }

  // ── Events ───────────────────────────────────────────────────────────────────
  function initEvents(hooks) {
    // Attacking. The monster is a <button>, so Enter/Space come free — but Space also
    // scrolls, so the keyboard path is handled in app.js and preventDefault'ed there.
    $("target").addEventListener("click", () => hooks.attack());

    // Grid: one delegated listener rather than 100.
    const grid = $("grid");
    grid.addEventListener("click", ev => {
      const cell = ev.target.closest(".box-cell");
      if (!cell) return;
      const flat = flatIndex(Number(cell.dataset.i));
      selected = window.BOX.get(flat) ? flat : -1;
      renderGrid();
      renderDetail();
    });
    grid.addEventListener("dragstart", ev => {
      const cell = ev.target.closest(".box-cell");
      if (!cell) return;
      const flat = flatIndex(Number(cell.dataset.i));
      if (!window.BOX.get(flat)) return ev.preventDefault();
      // Firefox refuses a drag with an empty dataTransfer, hence the payload.
      ev.dataTransfer.setData("text/plain", String(flat));
      ev.dataTransfer.effectAllowed = "move";
      cell.classList.add("drag-source");
    });
    grid.addEventListener("dragend", ev => {
      const cell = ev.target.closest(".box-cell");
      if (cell) cell.classList.remove("drag-source");
    });

    // Pot: drop target for box drags, click to unload.
    const pot = $("pot");
    pot.addEventListener("dragover", ev => {
      const slot = ev.target.closest(".pot-slot");
      if (!slot) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      slot.classList.add("drag-over");
    });
    pot.addEventListener("dragleave", ev => {
      const slot = ev.target.closest(".pot-slot");
      if (slot) slot.classList.remove("drag-over");
    });
    pot.addEventListener("drop", ev => {
      const slot = ev.target.closest(".pot-slot");
      if (!slot) return;
      ev.preventDefault();
      slot.classList.remove("drag-over");
      const from = Number(ev.dataTransfer.getData("text/plain"));
      if (!Number.isInteger(from)) return;
      const [r, c] = slot.dataset.pot.split("-").map(Number);
      if (window.BOX.potLoad(r, c, from)) { selected = -1; renderAll(); }
    });
    pot.addEventListener("click", ev => {
      const meldBtn = ev.target.closest("[data-meld]");
      if (meldBtn) {
        const r = Number(meldBtn.dataset.meld);
        const why = window.BOX.rowProblem(r);
        if (why) return toast(why);
        const res = window.BOX.meldRow(r);
        if (!res) return toast("The box is full — sell something first.");
        flashFresh(res.index);
        toast(`Melded into a ${window.ROLL.charmName(res.charm.r)}.`);
        renderAll();
        return;
      }
      const slot = ev.target.closest(".pot-slot");
      if (!slot) return;
      const [r, c] = slot.dataset.pot.split("-").map(Number);
      if (!window.BOX.potGet(r, c)) return;
      if (!window.BOX.potUnload(r, c)) return toast("The box is full — sell something first.");
      renderAll();
    });

    // Ore chips sell one at a time; the title says so.
    $("oreStrip").addEventListener("click", ev => {
      const chip = ev.target.closest("[data-ore]");
      if (!chip) return;
      const gain = window.FARM.sellOre(chip.dataset.ore, 1);
      if (gain) toast(`Sold for ${gain.toLocaleString()}z.`);
    });

    // Shop.
    $("shop").addEventListener("click", ev => {
      const btn = ev.target.closest("[data-buy]");
      if (!btn) return;
      const why = window.FARM.buy(btn.dataset.buy);
      if (why) toast(why);
    });

    // Paging.
    $("prevPage").addEventListener("click", () => { if (page > 0) { page--; renderGrid(); } });
    $("nextPage").addEventListener("click", () => {
      if (page < window.BOX.pages() - 1) { page++; renderGrid(); }
    });

    // Sorting.
    const sortKey = $("sortKey"), applySort = $("applySort"), sortDirBtn = $("sortDir");
    sortKey.addEventListener("change", () => { applySort.disabled = !sortKey.value; });
    sortDirBtn.addEventListener("click", () => {
      sortDir = sortDir === "desc" ? "asc" : "desc";
      sortDirBtn.textContent = sortDir === "desc" ? "Desc ↓" : "Asc ↑";
    });
    applySort.addEventListener("click", () => {
      if (!sortKey.value) return;
      window.BOX.sortBox(sortKey.value, sortDir);
      selected = -1;
      renderAll();
    });

    $("sellJunkBtn").addEventListener("click", () => {
      const doIt = () => {
        const res = window.BOX.sellWhere(c => c.r <= 2);
        toast(res.count ? `Sold ${res.count} charms for ${res.zenny.toLocaleString()}z.` : "Nothing at rarity 1–2 to sell.");
        selected = -1;
        renderAll();
      };
      const n = countWhere(c => c.r <= 2);
      if (!n) return toast("Nothing at rarity 1–2 to sell.");
      if (confirmBulk) hooks.confirm("Sell junk charms?", `This sells ${n} charm${n === 1 ? "" : "s"} at rarity 1–2.`, doIt);
      else doIt();
    });
    $("emptyBoxBtn").addEventListener("click", () => {
      const n = window.BOX.count();
      if (!n) return toast("The box is already empty.");
      const doIt = () => { window.BOX.emptyBox(); selected = -1; renderAll(); toast("Box emptied."); };
      if (confirmBulk) hooks.confirm("Empty the box?", `This throws away ${n} charm${n === 1 ? "" : "s"} without selling them.`, doIt);
      else doIt();
    });

    $("autoFillBtn").addEventListener("click", () => {
      const n = window.BOX.autoFill();
      toast(n ? `Filled ${n} row${n === 1 ? "" : "s"}.` : "No rarity has three spare charms.");
      renderAll();
    });
    $("meldAllBtn").addEventListener("click", () => {
      const res = window.BOX.meldAll();
      if (!res.length) return toast("No row is ready to meld.");
      res.forEach(r => flashFresh(r.index));
      toast(`Melded ${res.length} row${res.length === 1 ? "" : "s"}.`);
      renderAll();
    });
    $("emptyPotBtn").addEventListener("click", () => {
      if (!window.BOX.emptyPot()) return toast("The box is too full to take everything back.");
      renderAll();
    });
  }

  function countWhere(pred) {
    let n = 0;
    for (let i = 0; i < window.BOX.BOX_SIZE; i++) {
      const c = window.BOX.get(i);
      if (c && pred(c)) n++;
    }
    return n;
  }

  // Flash a newly melded charm, jumping to its page so it's actually on screen.
  function flashFresh(flat) {
    const p = Math.floor(flat / window.BOX.PAGE);
    if (p !== page) page = p;
    const i = flat - p * window.BOX.PAGE;
    renderGrid();
    const cell = cells[i];
    if (!cell) return;
    cell.el.classList.remove("fresh");
    void cell.el.offsetWidth;   // restart the animation
    cell.el.classList.add("fresh");
    setTimeout(() => cell.el.classList.remove("fresh"), 1500);
  }

  const setShowDamage = v => { showDamage = !!v; };
  const setConfirmBulk = v => { confirmBulk = !!v; };
  const clearSelection = () => { selected = -1; };

  return {
    buildGrid, renderAll, renderArena, renderGrid, renderPot, renderDetail, renderOres,
    renderShop, renderRoster, initEvents, toast, floatDamage, hitFlash,
    setShowDamage, setConfirmBulk, clearSelection, esc,
    get page() { return page; },
    set page(p) { page = p; },
  };
})();
