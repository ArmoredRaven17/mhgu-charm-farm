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
  let junkMax = 2;          // highest rarity Sell Junk will take
  let autoSort = false;     // re-apply the chosen sort after every hunt
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

    // "Click" is the BASE damage of one hit. What you see floating off the monster is
    // usually higher — crits multiply it, and hired hunters throw their own attacks
    // that float numbers too. Spell both out rather than leave you doing the maths.
    const base = F.clickDamage(), critMult = F.critMult(), chance = F.critChance();
    const avg = base * (1 + chance * (critMult - 1));
    $("statDmg").textContent = base.toLocaleString();
    $("statDmg").title = `${base.toLocaleString()} damage per click. ` +
      `A crit deals ${Math.round(base * critMult).toLocaleString()} ` +
      `(${Math.round(chance * 100)}% chance), averaging ${avg.toFixed(1)} per hit. ` +
      `Hired hunters attack for the same.`;
    $("statCrit").textContent = Math.round(chance * 100) + "% · " + critMult.toFixed(2) + "x";
    $("statCrit").title = `${Math.round(chance * 100)}% chance to deal ${critMult.toFixed(2)}x damage.`;
    $("statDps").textContent = F.dps() + "/s";
    $("statAuto").textContent = F.autoClicks() + "/s";
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
      const label = F.upgradeName(up);      // "Hire a Palico" becomes "Upgrade Palico Gear"
      if (maxed) {
        return `<div class="shop-item maxed">
          <div class="shop-row"><span class="shop-name">${esc(label)}</span>
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
      const spoken = `${label}, level ${level}. ${up.desc}. Costs ${z.toLocaleString()} zenny and ${oc.qty} ${ore.name}`;
      // A skill-named entry already reads "Sharpness +5"; a second "Lv 5" beside it is
      // the same fact twice.
      const badge = up.levelled ? "" : `<span class="shop-lv">Lv ${level}</span>`;
      return `<button type="button" class="shop-item" data-buy="${up.id}" aria-label="${esc(spoken)}">
        <div class="shop-row"><span class="shop-name">${esc(label)}</span>${badge}</div>
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
      (charm && window.ROLL.isGod(charm) ? " god" : "") +
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
      // No title= on filled cells: the hover card covers them, and a native tooltip
      // would fade in on top of it a moment later.
      el.removeAttribute("title");
      el.setAttribute("aria-label", `${window.ROLL.charmName(charm.r)} — ${describe(charm)}`);
    } else {
      el.draggable = false;
      c.icon.classList.add("hidden");
      c.slots.classList.add("hidden");
      c.slot.textContent = flat + 1;
      el.title = `Slot ${flat + 1} — empty`;
      el.setAttribute("aria-label", `Slot ${flat + 1}, empty`);
    }
  }

  function renderGrid() {
    for (let i = 0; i < cells.length; i++) paintCell(i);
    $("pageIndicator").textContent = `Page ${page + 1} / ${window.BOX.pages()}`;
    $("prevPage").disabled = page === 0;
    $("nextPage").disabled = page >= window.BOX.pages() - 1;
    $("capacityPill").textContent = `${window.BOX.count()} / ${window.BOX.BOX_SIZE}`;
  }

  // One-line summary, used as the accessible name on a cell. The hover card below
  // carries the same facts laid out properly; this is what a screen reader gets.
  function describe(c) {
    const parts = (c.k || []).map(s => `${window.ROLL.treeName(s[0])} ${s[1] > 0 ? "+" : ""}${s[1]}`);
    parts.push(c.s > 0 ? `${c.s} slot${c.s === 1 ? "" : "s"}` : "no slots");
    return parts.join(", ");
  }

  // ── Charm hover card ─────────────────────────────────────────────────────────
  // Native title= is slow to appear, unstyled, and can't colour a negative skill
  // red — which is exactly the thing you want to spot before melding a charm away.
  let tipAnchor = null;

  function tipHtml(c) {
    const tier = window.ROLL.tierOf(c.r);
    const skills = (c.k || []).map(s => {
      const cls = s[1] > 0 ? "pos" : s[1] < 0 ? "neg" : "";
      return `<div class="tip-row"><span class="k">${esc(window.ROLL.treeName(s[0]))}</span>
        <span class="v ${cls}">${s[1] > 0 ? "+" : ""}${s[1]}</span></div>`;
    }).join("");
    const pips = c.s > 0
      ? `<span class="tip-pips">${"<i></i>".repeat(c.s)}</span>${c.s}`
      : "None";
    const god = window.ROLL.isGod(c);
    return `<div class="tip-head">
        <div class="tip-icon"><img src="${charmIcon(c)}" alt=""></div>
        <div><div class="tip-name">${esc(window.ROLL.charmName(c.r))}</div>
          <div class="tip-tier">${esc(tier)} table</div>
          ${god ? `<span class="tip-god">God charm</span>` : ""}</div>
      </div>
      <div class="tip-row"><span class="k">Rarity</span>
        <span class="v"><span class="tip-rarity rarity-${c.r}">${c.r}</span></span></div>
      <div class="tip-row"><span class="k">Slots</span><span class="v">${pips}</span></div>
      <div class="tip-sec">Skills</div>
      ${skills || `<div class="tip-none">No skills.</div>`}
      <div class="tip-sec">Value</div>
      <div class="tip-row"><span class="k">Sells for</span>
        <span class="v">${window.ROLL.charmValue(c).toLocaleString()}z</span></div>`;
  }

  // Anchored to the cell, not the cursor: a card that chases the pointer across a
  // 10x10 grid is unreadable. Flips to the other side or above when it would run
  // off the viewport.
  function placeTip(anchorEl) {
    const tip = $("charmTip");
    const a = anchorEl.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const M = 8;
    let x = a.right + M;
    if (x + t.width > innerWidth - M) x = a.left - t.width - M;
    if (x < M) x = Math.min(M, innerWidth - t.width - M);
    let y = a.top;
    if (y + t.height > innerHeight - M) y = innerHeight - t.height - M;
    if (y < M) y = M;
    tip.style.left = Math.round(x) + "px";
    tip.style.top = Math.round(y) + "px";
  }

  function showTip(charm, anchorEl) {
    if (!charm || tipAnchor === anchorEl) return;
    tipAnchor = anchorEl;
    const tip = $("charmTip");
    tip.innerHTML = tipHtml(charm);
    tip.classList.remove("hidden");
    tip.setAttribute("aria-hidden", "false");
    placeTip(anchorEl);          // measured after fill, so the flip uses real height
  }

  function hideTip() {
    if (!tipAnchor) return;
    tipAnchor = null;
    const tip = $("charmTip");
    tip.classList.add("hidden");
    tip.setAttribute("aria-hidden", "true");
  }

  // ── Melding pot ──────────────────────────────────────────────────────────────
  // The pot is a queue, not a set of buttons: one row resolves each time a
  // Brachydios dies, top-down. So each row shows its place in that queue rather than
  // a Meld control you could press at will.
  function renderPot() {
    const B = window.BOX;
    const queue = B.queuedRows();
    const place = Object.fromEntries(queue.map((r, i) => [r, i]));
    let html = "";
    for (let r = 0; r < B.POT_ROWS; r++) {
      let slots = "";
      for (let c = 0; c < B.POT_COLS; c++) {
        const charm = B.potGet(r, c);
        slots += `<div class="pot-slot${charm ? ` filled rarity-${charm.r}` : ""}${charm && window.ROLL.isGod(charm) ? " god" : ""}"
          data-pot="${r}-${c}"${charm ? "" : ' title="Drag a charm here"'}>
          ${charm ? `<img src="${charmIcon(charm)}" alt="">` : ""}</div>`;
      }
      let tag, cls;
      if (place[r] === 0) { tag = "Next hunt"; cls = "next"; }
      else if (place[r] !== undefined) { tag = `${place[r] + 1} hunts`; cls = "waiting"; }
      else if ([0, 1, 2].some(c => B.potGet(r, c))) { tag = "Not set"; cls = "blocked"; }
      else { tag = ""; cls = "idle"; }
      // Spell out the ladder on the row itself — three of a rarity come back as one
      // of the next rarity up, and that's the whole reason to use the pot.
      const inRarity = place[r] !== undefined ? B.potGet(r, 0).r : null;
      const title = inRarity !== null
        ? ` title="Three ${esc(window.ROLL.charmName(inRarity))} → one ${esc(window.ROLL.charmName(window.ROLL.meldOutputRarity(inRarity)))}, for ${window.ROLL.meldFee(inRarity).toLocaleString()}z"`
        : "";
      html += `<div class="pot-row">${slots}<span class="pot-queue ${cls}"${title}>${tag}</span></div>`;
    }
    $("pot").innerHTML = html;

    // Explain the first loaded row that can't resolve, rather than leaving a row
    // flagged red with no reason given. When melds are already queued the full reason
    // would be a paragraph in a narrow column, so it shrinks to a pointer — the row's
    // own red tag is the flag, and hovering its charms shows the rarities.
    let stuck = null;
    for (let r = 0; r < B.POT_ROWS; r++) {
      if (place[r] !== undefined) continue;
      if (!B.potGet(r, 0) && !B.potGet(r, 1) && !B.potGet(r, 2)) continue;
      stuck = { row: r + 1, why: B.rowProblem(r) };
      break;
    }
    $("potStatus").textContent = queue.length
      ? `${queue.length} queued — one resolves per hunt.` +
        (stuck ? ` Row ${stuck.row} isn't set.` : "")
      : (stuck ? `Row ${stuck.row}: ${stuck.why}`
              : "Drag three charms of the same rarity into a row. One meld resolves per hunt.");
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
      ${window.ROLL.isGod(c) ? `<div style="text-align:center"><span class="tip-god">God charm</span></div>` : ""}
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
      if (window.ROLL.isGod(c)) return toast("A god charm can't be melded.");
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
    // Hover cards. mouseover/mouseout rather than mouseenter so one listener covers
    // all 100 cells; showTip no-ops when the anchor hasn't actually changed, so
    // moving within a cell doesn't rebuild the card.
    grid.addEventListener("mouseover", ev => {
      const cell = ev.target.closest(".box-cell");
      if (!cell) return hideTip();
      const charm = window.BOX.get(flatIndex(Number(cell.dataset.i)));
      if (charm) showTip(charm, cell); else hideTip();
    });
    grid.addEventListener("mouseout", ev => {
      if (!ev.relatedTarget || !ev.relatedTarget.closest(".box-cell")) hideTip();
    });
    grid.addEventListener("dragstart", ev => {
      hideTip();
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

    // Pot: drop target for box drags, click to unload, same hover card.
    const pot = $("pot");
    pot.addEventListener("mouseover", ev => {
      const slot = ev.target.closest(".pot-slot");
      if (!slot) return hideTip();
      const [r, c] = slot.dataset.pot.split("-").map(Number);
      const charm = window.BOX.potGet(r, c);
      if (charm) showTip(charm, slot); else hideTip();
    });
    pot.addEventListener("mouseout", ev => {
      if (!ev.relatedTarget || !ev.relatedTarget.closest(".pot-slot")) hideTip();
    });
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
      const charm = window.BOX.get(from);
      if (charm && window.ROLL.isGod(charm)) return toast("A god charm can't be melded.");
      if (window.BOX.potLoad(r, c, from)) { selected = -1; hideTip(); renderAll(); }
    });
    pot.addEventListener("click", ev => {
      const slot = ev.target.closest(".pot-slot");
      if (!slot) return;
      const [r, c] = slot.dataset.pot.split("-").map(Number);
      if (!window.BOX.potGet(r, c)) return;
      if (!window.BOX.potUnload(r, c)) return toast("The box is full — sell something first.");
      hideTip();
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
    const autoBtn = $("autoSortToggle");
    const syncAuto = () => autoBtn.setAttribute("aria-checked", autoSort ? "true" : "false");
    syncAuto();
    autoBtn.addEventListener("click", () => {
      autoSort = !autoSort;
      syncAuto();
      hooks.settingChanged("autoSort", autoSort);
      // Switching it on with no sort chosen would silently do nothing forever.
      if (autoSort && !sortKey.value) toast("Pick a sort type for auto-sort to use.");
      else if (autoSort) { maybeAutoSort(); renderAll(); }
    });
    sortKey.addEventListener("change", () => {
      applySort.disabled = !sortKey.value;
      if (autoSort && sortKey.value) { maybeAutoSort(); renderAll(); }
    });
    sortDirBtn.addEventListener("click", () => {
      sortDir = sortDir === "desc" ? "asc" : "desc";
      sortDirBtn.textContent = sortDir === "desc" ? "Desc ↓" : "Asc ↑";
      if (autoSort && sortKey.value) { maybeAutoSort(); renderAll(); }
    });
    applySort.addEventListener("click", () => {
      if (!sortKey.value) return;
      window.BOX.sortBox(sortKey.value, sortDir);
      selected = -1;
      renderAll();
    });

    // Sell Junk takes everything up to the chosen rarity — but never a god charm.
    // Bulk actions are exactly where you'd lose one without noticing.
    const junkSel = $("junkRarity");
    junkSel.value = String(junkMax);
    junkSel.addEventListener("change", () => {
      junkMax = Number(junkSel.value) || 1;
      hooks.settingChanged("junkMax", junkMax);
    });
    $("sellJunkBtn").addEventListener("click", () => {
      const isJunk = c => c.r <= junkMax && !window.ROLL.isGod(c);
      const n = countWhere(isJunk);
      const spared = countWhere(c => c.r <= junkMax && window.ROLL.isGod(c));
      const upTo = junkMax === 1 ? "rarity 1" : `rarity 1–${junkMax}`;
      if (!n) return toast(`Nothing at ${upTo} to sell.`);
      const doIt = () => {
        const res = window.BOX.sellWhere(isJunk);
        toast(`Sold ${res.count} charm${res.count === 1 ? "" : "s"} for ${res.zenny.toLocaleString()}z.` +
          (spared ? ` Kept ${spared} god charm${spared === 1 ? "" : "s"}.` : ""));
        selected = -1;
        renderAll();
      };
      if (confirmBulk) {
        hooks.confirm("Sell junk charms?",
          `This sells ${n} charm${n === 1 ? "" : "s"} at ${upTo}.` +
          (spared ? ` ${spared} god charm${spared === 1 ? " is" : "s are"} kept.` : ""), doIt);
      } else doIt();
    });
    // No Empty Box control. It only ever destroyed charms without paying for them,
    // and Sell Junk does the same job while giving you the zenny. Reset Run still
    // clears the box, which is the one place wiping it is actually the intent.
    $("autoFillBtn").addEventListener("click", () => {
      const n = window.BOX.autoFill();
      toast(n ? `Filled ${n} row${n === 1 ? "" : "s"}.` : "No rarity has three spare charms.");
      renderAll();
    });
    $("emptyPotBtn").addEventListener("click", () => {
      if (!window.BOX.emptyPot()) return toast("The box is too full to take everything back.");
      renderAll();
    });
  }

  // Re-apply the chosen sort. Called at the very end of a hunt — after the pot has
  // resolved and the drops are in — so the charm the pot just returned and everything
  // that fell this hunt are sorted along with the rest, rather than sitting wherever
  // they happened to land.
  //
  // The inspected charm is followed by identity: sorting shuffles the same objects, so
  // its index changes even though your selection shouldn't.
  function maybeAutoSort() {
    if (!autoSort) return false;
    const key = $("sortKey").value;
    if (!key) return false;
    const held = selected >= 0 ? window.BOX.get(selected) : null;
    window.BOX.sortBox(key, sortDir);
    selected = held ? window.BOX.indexOf(held) : -1;
    return true;
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
  const setAutoSort = v => {
    autoSort = !!v;
    const el = $("autoSortToggle");
    if (el) el.setAttribute("aria-checked", autoSort ? "true" : "false");
  };
  const setJunkMax = v => {
    junkMax = Math.min(10, Math.max(1, Number(v) || 2));
    const sel = $("junkRarity");
    if (sel) sel.value = String(junkMax);
  };
  const clearSelection = () => { selected = -1; };

  return {
    buildGrid, renderAll, renderArena, renderGrid, renderPot, renderDetail, renderOres,
    renderShop, renderRoster, initEvents, toast, floatDamage, hitFlash, flashFresh,
    setShowDamage, setConfirmBulk, setJunkMax, setAutoSort, maybeAutoSort,
    clearSelection, hideTip, esc,
    get page() { return page; },
    set page(p) { page = p; },
  };
})();
