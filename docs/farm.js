// The clicker: what you're hitting, how hard, and what falls out of it.
//
// This file holds the *game design* — tints, spawn weights, HP curves, upgrade costs.
// The transcribed game facts it leans on (ore names, sell prices, rank gates) live in
// data/ores.js, kept separate on purpose so invented tuning never gets mistaken for
// something the game actually says.
window.FARM = (function () {
  "use strict";

  const ORES = window.CF_ORES.list;
  const oreById = Object.fromEntries(ORES.map(o => [o.id, o]));

  // ── The roster ───────────────────────────────────────────────────────────────
  // Two sprites exist as real files: the base Brachydios portrait and Raging
  // Brachydios (from the save editor). Every variant is one of those two under a CSS
  // filter.
  //
  // Low and High rank recolour the base portrait; all five G-rank variants recolour
  // the Raging one. That isn't decoration — the two sprites start from different
  // colours, so the same rotation lands somewhere else entirely, and the top of the
  // ladder reads as a different silhouette rather than another pass over the same
  // wheel. The tints themselves were chosen by eye in tools/tint-picker.html.
  //
  // rank  — lowest hunter rank that can meet it (0 Low, 1 High, 2 G), taken from
  //         which mining ranks the ore actually appears at in the game.
  // w     — spawn weight inside the unlocked pool.
  // hp    — HP multiplier on top of the kill-count curve.
  // shift — how many steps up the four-tier charm table its drops roll.
  //
  // This array is the entire variant system. Nothing else in the app knows the roster
  // exists, so adding, recolouring or renaming one is a single edit here.
  const VARIANTS = [
    { id: "base", name: "Brachydios", icon: "brachy", filter: "none", theme: "#0B2757",
      ore: null, rank: 0, w: 200, hp: 1, shift: 0 },

    // Weights fall monotonically down the whole list, so a common ore is never rarer
    // than a better one. They used to be ordered within each rank block only, which
    // put Dragonite (18) below Fucium (22) — you ended up with more of the high-rank
    // ore than the low-rank one it was supposed to be feeding into.
    { id: "iron", name: "Iron Brachydios", icon: "brachy", theme: "#4a4f57",
      filter: "saturate(0) brightness(0.95)",
      ore: "iron", rank: 0, w: 120, hp: 1.3, shift: 0 },
    { id: "earth", name: "Earth Crystal Brachydios", icon: "brachy", theme: "#8a8f96",
      filter: "hue-rotate(195deg) saturate(0.35) brightness(2)",
      ore: "earth", rank: 0, w: 104, hp: 1.45, shift: 0 },
    { id: "machalite", name: "Machalite Brachydios", icon: "brachy", theme: "#1e63a8",
      filter: "hue-rotate(300deg) saturate(1.85) brightness(1.05)",
      ore: "machalite", rank: 0, w: 88, hp: 1.7, shift: 0 },
    { id: "dragonite", name: "Dragonite Brachydios", icon: "brachy", theme: "#2f8f3f",
      filter: "hue-rotate(270deg) saturate(1.65) brightness(1.1)",
      ore: "dragonite", rank: 0, w: 68, hp: 2.2, shift: 1 },

    { id: "carbalite", name: "Carbalite Brachydios", icon: "brachy", theme: "#6b3fa0",
      filter: "hue-rotate(30deg) saturate(1.5)",
      ore: "carbalite", rank: 1, w: 46, hp: 2.6, shift: 1 },
    { id: "fucium", name: "Fucium Brachydios", icon: "brachy", theme: "#d15f92",
      filter: "hue-rotate(60deg) saturate(1.5)",
      ore: "fucium", rank: 1, w: 34, hp: 3, shift: 1 },
    { id: "lightcrystal", name: "Lightcrystal Brachydios", icon: "brachy", theme: "#b9c4cc",
      filter: "hue-rotate(135deg) saturate(0.1) brightness(1.9)",
      ore: "lightcrystal", rank: 1, w: 25, hp: 3.4, shift: 1 },
    { id: "firecell", name: "Firecell Brachydios", icon: "brachy", theme: "#e07820",
      filter: "hue-rotate(135deg) saturate(3) brightness(0.85)",
      ore: "firecell", rank: 1, w: 18, hp: 4.2, shift: 2 },

    { id: "eltalite", name: "Eltalite Brachydios", icon: "raging", theme: "#b52020",
      filter: "hue-rotate(195deg) saturate(3) brightness(0.85)",
      ore: "eltalite", rank: 2, w: 13, hp: 5, shift: 1 },
    { id: "allfire", name: "Allfire Brachydios", icon: "raging", theme: "#6e1010",
      filter: "hue-rotate(240deg) saturate(3) brightness(0.85)",
      ore: "allfire", rank: 2, w: 9, hp: 6.5, shift: 2 },
    { id: "purecrystal", name: "Purecrystal Brachydios", icon: "raging", theme: "#3fa8c8",
      filter: "hue-rotate(120deg) saturate(1.5)",
      ore: "purecrystal", rank: 2, w: 6, hp: 7.5, shift: 2 },
    { id: "ultimas", name: "Ultimas Brachydios", icon: "raging", theme: "#d8b820",
      filter: "hue-rotate(285deg) saturate(1.3) brightness(2)",
      ore: "ultimas", rank: 2, w: 4, hp: 8.5, shift: 2 },

    // The only variant with its own artwork, and the rarest thing in the pool.
    // "*G" means it pays out a spread of G-rank ores instead of a single one.
    { id: "raging", name: "Raging Brachydios", icon: "raging", filter: "none", theme: "#8a2b0f",
      ore: "*G", rank: 2, w: 2, hp: 12, shift: 2 },
  ];
  const variantById = Object.fromEntries(VARIANTS.map(v => [v.id, v]));

  // ── Rank ─────────────────────────────────────────────────────────────────────
  const RANKS = [
    { name: "Low Rank", kills: 0 },
    { name: "High Rank", kills: 25 },
    { name: "G Rank", kills: 100 },
  ];
  // Charm tier weights per rank. Enduring stays a jackpot even at G.
  const TIER_WEIGHTS = [
    { mystery: 60, shining: 30, timeworn: 9, enduring: 1 },
    { mystery: 25, shining: 40, timeworn: 30, enduring: 5 },
    { mystery: 5, shining: 20, timeworn: 50, enduring: 25 },
  ];

  // ── Upgrades ─────────────────────────────────────────────────────────────────
  // Names are deliberately plain; rename them freely, nothing keys off the label.
  // Each level costs zenny (growing by `mult`) plus a few of one ore, and the ore
  // demanded steps up as you climb — early levels want Iron, late ones want Ultimas.
  const ORE_LADDER = ["iron", "machalite", "earth", "dragonite", "carbalite",
    "fucium", "lightcrystal", "firecell", "eltalite", "allfire", "purecrystal", "ultimas"];

  const UPGRADES = [
    // ore:0 puts this at the bottom of the ladder — Iron Ore. Nothing else starts
    // that low, and without it the most common drop in the game would never be asked
    // for by anything.
    { id: "dmg", name: "Sharpness", levelled: true, desc: "+1 damage per click",
      base: 100, mult: 1.20, max: 999, ore: 0 },
    { id: "crit", name: "Critical Eye", levelled: true, desc: "+2% critical chance",
      base: 600, mult: 1.26, max: 20, ore: 3 },
    { id: "critdmg", name: "Crit Boost", levelled: true, desc: "+0.25x critical damage",
      base: 1500, mult: 1.28, max: 16, ore: 4 },
    // nameAfter: what the entry is called once you own at least one level. The first
    // purchase is the hire; everything after it is kitting them out.
    { id: "dps", name: "Hire a Palico", nameAfter: "Upgrade Palico Gear",
      desc: "+2 damage per second, hands-free",
      base: 500, mult: 1.21, max: 200, ore: 3 },
    // Distinct from a Palico on purpose: a Palico adds flat damage per second, a
    // hired hunter throws a real attack — so these scale with your click damage and
    // can crit. Late on they're worth far more than raw DPS, which is why they cost
    // more and cap lower.
    { id: "hunters", name: "Hunters for Hire", nameAfter: "Upgrade Hunters for Hire Gear",
      desc: "+1 attack per second, using your click damage",
      base: 5000, mult: 1.29, max: 40, ore: 6 },
    // The steep 3.2x is deliberate — each level is a flat multiplier on every charm
    // you'll ever get — but the 40,000 base it was raised to in the cost rebalance
    // was never checked on its own, and it locked a light player out of level one
    // entirely across a whole session. The steepness is what makes it a long goal;
    // the base only decides whether you can start.
    { id: "drop", name: "Charm Chaser", levelled: true, desc: "+1 charm per kill",
      base: 12000, mult: 3.2, max: 6, ore: 8 },
    { id: "zenny", name: "Crazy Lucky Cat", levelled: true, desc: "+15% zenny per kill",
      base: 5000, mult: 1.38, max: 12, ore: 5 },

    // The two hires. One-offs, priced to be the thing you save for rather than
    // something you drift into: each wants a stack of a G-rank ore, and Ultimas
    // Crystal is the rarest drop in the game.
    { id: "maximeld", name: "Maximeld XIV", hire: true, desc: "Loads the Melding Pot for you after every hunt",
      base: 60000, mult: 1, max: 1, ore: 16, oreQty: 15 },
    // Sells at whatever "Junk ≤" is already set to, so the hire adds no new control —
    // the dropdown you were already using becomes her instructions.
    { id: "neko", name: "Neko (Means Cat)", hire: true, desc: "Sells junk charms for you, at your Junk ≤ setting",
      base: 90000, mult: 1, max: 1, ore: 18, oreQty: 12 },
    { id: "argosy", name: "Argosy Captain", hire: true, desc: "Sells ore no upgrade still needs, plus any surplus",
      base: 120000, mult: 1, max: 1, ore: 20, oreQty: 12 },
    // 10 Ultimas rather than 20: the ore ladder caps at Ultimas Crystal, so the late
    // levels of every other upgrade are competing for the same drop. At 20 the
    // simulation never once managed to bank enough, in any profile.
    { id: "kokoto", name: "Kokoto Gal", hire: true, desc: "Spends your zenny and ore on upgrades for you",
      base: 250000, mult: 1, max: 1, ore: 22, oreQty: 10 },
  ];
  const upgradeById = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

  // What an upgrade is called right now.
  //   levelled  — named after a real MHGU skill, so it reads with its rank the way the
  //               game writes one: "Sharpness +5". Ranks start at +1; at zero the name
  //               stands alone, because there is no such thing as Sharpness +0 — you
  //               simply don't have the skill yet. The shop drops its separate level
  //               badge for these either way, since the name carries the rank.
  //   nameAfter — entries that read as a one-off act (hiring someone) switch to their
  //               ongoing form once you own one.
  function upgradeName(up) {
    const level = lvl(up.id);
    if (up.levelled) return level > 0 ? `${up.name} +${level}` : up.name;
    return (up.nameAfter && level > 0) ? up.nameAfter : up.name;
  }

  // Which ore a given upgrade level demands, and how many. Levels walk up the ladder
  // so the shop keeps pointing you at whatever you haven't farmed yet.
  // How many levels an upgrade spends on each rung of the ore ladder. Derived from
  // how many levels it HAS, so every upgrade traverses a comparable span of the
  // ladder over its life rather than a fixed three levels per rung.
  //
  // The fixed step made Fucium Ore — the middle rung — the ore half the shop wanted
  // at once through the whole mid-game, and the last ore two upgrades ever asked for:
  // Wider haul has six levels, so at three-per-rung it only ever touched Carbalite
  // and Fucium and stopped. Short upgrades now climb quickly and reach the rare ores;
  // long ones linger, which is right, since you buy far more levels of them.
  const oreStep = up => Math.min(8, Math.max(1, Math.round(up.max / 8)));

  // The quantity climbs every second level. It used to be level/4, which meant the
  // first four levels of anything cost a single ore each — you could buy a row of
  // Palicoes off one hunt's drops.
  function oreCost(up, level) {
    const idx = Math.min(ORE_LADDER.length - 1,
      Math.floor(level / oreStep(up)) + Math.floor(up.ore / 2));
    // oreQty lets a one-off hire ask for a stack rather than the usual single ore.
    const base = up.oreQty || 1;
    return { ore: ORE_LADDER[idx], qty: base + Math.floor(level / 2) };
  }
  function zennyCost(up, level) {
    return Math.round(up.base * Math.pow(up.mult, level));
  }

  // ── State ────────────────────────────────────────────────────────────────────
  // HP curve. This was exponential (20 × 1.055^kills), which doubles the monster
  // every ~13 hunts — but damage only grows linearly with upgrade level while each
  // level costs 1.15× the last, so damage grows roughly with the LOG of your wealth.
  // Exponential HP against logarithmic damage is a wall: simulation had a casual
  // player stalled by hunt 120 with 165,000z they couldn't spend.
  //
  // A gentle power curve keeps it always getting harder without ever outrunning you:
  //   100 hunts ≈ 230 HP · 500 ≈ 1,500 · 1,000 ≈ 3,400 · 5,000 ≈ 25,000
  // then multiplied by the variant, so a Raging Brachydios is still a real event.
  const HP_BASE = 20;
  const HP_RATE = 0.06;      // how fast the curve climbs per kill
  const HP_POWER = 1.25;     // and how much it steepens

  let state = null;
  // Two separate signals on purpose. `onTick` fires for a bare HP change — many times
  // a second once Palicoes are hired — and must stay cheap. `onChange` fires only when
  // the economy actually moves (kill, purchase, sale) and is free to rebuild panels.
  // Collapsing them meant the shop's innerHTML was rewritten ten times a second, which
  // swapped the button out from under a click and made purchases look like they hadn't
  // registered.
  let onTick = () => {};
  let onChange = () => {};
  let onKill = () => {};
  let onAutoClick = () => {};
  let timer = null;
  let autoCarry = 0;      // fractional auto-attacks owed between ticks

  function fresh() {
    // `seen` is the trophy list — which variants you've actually hunted. It gates the
    // theme picker, so it has to persist with the run. The base Brachydios starts
    // unlocked: he's the one already standing in front of you, and a picker showing
    // fourteen locked tiles on a fresh save reads as broken rather than as progression.
    // `gods` is a running tally so each find can announce which number it is.
    return { zenny: 0, kills: 0, hp: 0, variant: "base", upgrades: {}, ores: {}, seen: { base: true }, gods: 0 };
  }
  const hasSeen = id => !!(state && state.seen && state.seen[id]);

  function rankIndex() {
    let r = 0;
    for (let i = 0; i < RANKS.length; i++) if (state.kills >= RANKS[i].kills) r = i;
    return r;
  }
  const rankName = () => RANKS[rankIndex()].name;
  const variant = () => variantById[state.variant] || variantById.base;

  function hpMax() {
    const curve = Math.pow(1 + state.kills * HP_RATE, HP_POWER);
    return Math.max(1, Math.round(HP_BASE * curve * variant().hp));
  }

  const lvl = id => state.upgrades[id] || 0;
  const clickDamage = () => 1 + lvl("dmg");
  const critChance = () => Math.min(0.5, lvl("crit") * 0.02);
  const critMult = () => 2 + lvl("critdmg") * 0.25;
  const dps = () => lvl("dps") * 2;
  const autoClicks = () => lvl("hunters");        // attacks per second
  const dropCount = () => 1 + lvl("drop");
  const zennyMult = () => 1 + lvl("zenny") * 0.15;

  // Pick the next Brachydios from everything this rank has unlocked.
  function rollVariant() {
    const r = rankIndex();
    const pool = VARIANTS.filter(v => v.rank <= r).map(v => [v.id, v.w]);
    return window.ROLL.pickWeighted(pool) || "base";
  }

  function spawn() {
    state.variant = rollVariant();
    state.hp = hpMax();
  }

  // Roll the charms a kill produces. The variant's `shift` walks the tier weights up,
  // so a rarer coat really does mean better charms and not just a bigger number.
  function rollDrops(v) {
    const w = Object.assign({}, TIER_WEIGHTS[rankIndex()]);
    const order = window.ROLL.TIER_ORDER;
    for (let i = 0; i < v.shift; i++) {
      // Push weight one tier up the ladder, leaving the top tier to accumulate.
      for (let t = order.length - 1; t > 0; t--) w[order[t]] += w[order[t - 1]] * 0.6;
      for (let t = 0; t < order.length - 1; t++) w[order[t]] *= 0.45;
    }
    const pairs = order.map(t => [t, w[t]]);
    const out = [];
    for (let i = 0; i < dropCount(); i++) {
      const tier = window.ROLL.pickWeighted(pairs);
      out.push(window.ROLL.rollCharm(window.ROLL.rollRarity(tier)));
    }
    return out.filter(Boolean);
  }

  // Which ores a kill pays. "*G" spreads across every G-rank ore.
  //
  // Quantities are deliberately generous relative to what one upgrade level costs.
  // Ore should be the thing you plan around, not a permanent wall: at 1-3 per kill,
  // simulation had players ore-blocked 100% of the time with six figures of unspent
  // zenny, which is the least interesting failure mode a shop can have.
  function rollOres(v) {
    if (!v.ore) return {};
    if (v.ore === "*G") {
      const got = {};
      for (const o of ORES.filter(o => o.rank === 2)) got[o.id] = 2 + Math.floor(Math.random() * 3);
      return got;
    }
    return { [v.ore]: 2 + Math.floor(Math.random() * 3) };
  }

  function kill() {
    const v = variant();
    // Pay off what the monster was actually worth, not a flat sum times the kill
    // count. The old payout was linear in kills, which compounded with a rising kill
    // rate into tens of millions of unspendable zenny by the two-hour mark. Tying it
    // to the HP you just chewed through keeps money meaningful and makes a Raging
    // Brachydios genuinely worth finding.
    const worth = hpMax();
    const firstOfItsKind = !state.seen[v.id];
    state.seen[v.id] = true;
    state.kills++;
    const pay = Math.round(worth * 0.38 * zennyMult());
    state.zenny += pay;

    const ores = rollOres(v);
    for (const id in ores) state.ores[id] = (state.ores[id] || 0) + ores[id];

    const charms = rollDrops(v);
    const killed = v;
    spawn();
    onKill({ variant: killed, zenny: pay, ores, charms, firstOfItsKind });
    onChange();
  }

  // Apply damage from any source. Returns what actually landed, so the UI can float
  // the number, and rolls the kill over when HP runs out.
  //
  // `exact` skips the one-damage floor. That floor exists so a click can never do
  // nothing, but the idle tick fires ten times a second with a fraction of a second's
  // DPS each time — rounding those up would turn 2 DPS into 10.
  function hit(amount, isCrit, exact) {
    if (!state) return null;
    const dealt = exact ? amount : Math.max(1, Math.round(amount));
    if (dealt <= 0) return null;
    state.hp -= dealt;
    if (state.hp <= 0) kill();      // kill() raises the heavier onChange itself
    else onTick();
    return { dealt: Math.round(dealt), crit: !!isCrit };
  }

  function click() {
    const crit = Math.random() < critChance();
    return hit(clickDamage() * (crit ? critMult() : 1), crit);
  }

  // ── Buying ───────────────────────────────────────────────────────────────────
  // Returns null when the purchase went through, or a sentence saying what's short —
  // the button stays live and explains itself rather than sitting greyed out.
  function canBuy(id) {
    const up = upgradeById[id];
    if (!up) return "No such upgrade.";
    const level = lvl(id);
    if (level >= up.max) return "Already at maximum.";
    const z = zennyCost(up, level);
    const oc = oreCost(up, level);
    const have = state.ores[oc.ore] || 0;
    const missing = [];
    if (state.zenny < z) missing.push(`${(z - state.zenny).toLocaleString()}z`);
    if (have < oc.qty) missing.push(`${oc.qty - have}x ${oreById[oc.ore].name}`);
    return missing.length ? `Need ${missing.join(" and ")}.` : null;
  }
  function buy(id) {
    const why = canBuy(id);
    if (why) return why;
    const up = upgradeById[id], level = lvl(id), oc = oreCost(up, level);
    state.zenny -= zennyCost(up, level);
    state.ores[oc.ore] -= oc.qty;
    state.upgrades[id] = level + 1;
    onChange();
    return null;
  }

  // Every ore that any not-yet-maxed upgrade will still ask for at some future level.
  // Because the ladder walks upward and caps at Ultimas, the cheap early ores drop
  // out of demand permanently once your levels pass their rung — which is exactly
  // what makes them safe for the Argosy Captain to sell off.
  function oresStillNeeded() {
    const need = new Set();
    for (const up of UPGRADES) {
      for (let lv = lvl(up.id); lv < up.max; lv++) need.add(oreCost(up, lv).ore);
    }
    return need;
  }

  // What to buy next, as one shared answer for Kokoto Gal and the simulation. Having
  // both reach for the same function means the economy the simulation measures is the
  // one the game actually plays, rather than two greedy loops that drift apart.
  //
  // Policy: clear a rung of the ore ladder before climbing to the next. Buying the
  // globally cheapest thing instead — the old behaviour in both places — meant a
  // levelled-up line kept winning on price while everything still sitting on Iron Ore
  // went untouched, so cheap ores piled up unspent while you starved for rare ones.
  // Within a rung it still takes the cheapest, so progress inside a tier stays smooth.
  function nextPurchase() {
    let best = null;
    for (const up of UPGRADES) {
      const level = lvl(up.id);
      if (level >= up.max) continue;
      if (canBuy(up.id)) continue;                    // returns a reason when you can't
      const rung = ORE_LADDER.indexOf(oreCost(up, level).ore);
      const cost = zennyCost(up, level);
      if (!best || rung < best.rung || (rung === best.rung && cost < best.cost)) {
        best = { up, level, rung, cost };
      }
    }
    return best;
  }

  function sellOre(id, qty) {
    const have = state.ores[id] || 0;
    const n = Math.min(have, qty === undefined ? have : qty);
    if (n <= 0) return 0;
    const gain = n * oreById[id].sell;
    state.ores[id] = have - n;
    state.zenny += gain;
    onChange();
    return gain;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────
  // The idle tick is one interval for the whole app. It only fires when Palicoes have
  // actually been hired, so an untouched save costs nothing.
  function startTick() {
    if (timer) return;
    let last = performance.now();
    timer = setInterval(() => {
      const now = performance.now();
      // Measured against the clock rather than assuming a clean 100 ms, so a
      // backgrounded tab that throttles the interval doesn't quietly lose damage.
      // Capped so returning to a tab that slept for ten minutes doesn't dump a
      // single colossal hit (or a thousand queued auto-attacks) all at once.
      const elapsed = Math.min(1, (now - last) / 1000);
      last = now;
      if (!state) return;

      const d = dps();
      if (d > 0) hit(d * elapsed, false, true);

      // Hired hunters attack rather than tick damage: each one runs the same path a
      // real click does, so it uses click damage and can crit.
      const cps = autoClicks();
      if (cps > 0) {
        autoCarry += cps * elapsed;
        let n = Math.min(Math.floor(autoCarry), 25);
        autoCarry -= Math.floor(autoCarry);
        while (n-- > 0 && state) onAutoClick(click());
      }
    }, 100);
  }

  // What one attack lands on average, crits included. Used by the offline catch-up
  // and by anything that needs a rate rather than a single roll.
  const avgHit = () => clickDamage() * (1 + critChance() * (critMult() - 1));

  // Time passed while the tab was shut. Palicoes and hired hunters kept working, so
  // replay what they'd have done — through the real kill path, so drops, ore, melds
  // and the hires all happen exactly as they would have live.
  //
  // Bounded twice over: the caller caps how many hours count, and MAX_CATCHUP_KILLS
  // caps the loop itself, because a long absence with heavy DPS could otherwise ask
  // for hundreds of thousands of kills and hang the tab on load.
  const MAX_CATCHUP_KILLS = 3000;
  function catchUp(seconds) {
    if (!state || !(seconds > 0)) return null;
    const perSecond = dps() + autoClicks() * avgHit();
    if (perSecond <= 0) return null;             // nothing hired, nothing happened

    const killsBefore = state.kills, zennyBefore = state.zenny;
    let budget = perSecond * seconds;
    let guard = 0;
    while (budget > 0 && guard < MAX_CATCHUP_KILLS) {
      const take = Math.min(budget, state.hp);
      hit(take, false, true);
      budget -= take;
      guard++;
      if (budget <= 1e-9) break;
    }
    return {
      seconds,
      kills: state.kills - killsBefore,
      zenny: Math.round(state.zenny - zennyBefore),
      capped: guard >= MAX_CATCHUP_KILLS,
    };
  }

  function init(saved, hooks) {
    state = Object.assign(fresh(), saved || {});
    state.upgrades = Object.assign({}, (saved && saved.upgrades) || {});
    state.ores = Object.assign({}, (saved && saved.ores) || {});
    // Base always unlocked, including in saves written before `seen` existed.
    state.seen = Object.assign({ base: true }, (saved && saved.seen) || {});
    state.gods = (saved && saved.gods) || 0;
    // Briefly shipped: the kill count at the last god charm, back when the toast
    // reported the gap rather than the running total. Nothing reads it now, and
    // Object.assign above would otherwise carry it in every save forever.
    delete state.lastGodAt;
    if (!variantById[state.variant]) state.variant = "base";
    if (!state.hp || state.hp <= 0 || state.hp > hpMax()) spawn();
    // Only replace the hooks when we're actually given some. Loading a save calls
    // init again to swap the run state in, and passing null there must not silently
    // unhook the app — that would leave kills dropping charms into nothing.
    autoCarry = 0;
    if (hooks) {
      onTick = hooks.onTick || (() => {});
      onChange = hooks.onChange || (() => {});
      onKill = hooks.onKill || (() => {});
      onAutoClick = hooks.onAutoClick || (() => {});
    }
    startTick();
    onChange();
  }
  function reset() { init(null, { onTick, onChange, onKill, onAutoClick }); }

  return {
    VARIANTS, RANKS, UPGRADES, ORES, oreById, variantById, ORE_LADDER,
    init, reset, click, hit, buy, canBuy, sellOre, oresStillNeeded, spawn, catchUp, avgHit,
    nextPurchase,
    zennyCost, oreCost,
    get state() { return state; },
    rankIndex, rankName, variant, hpMax, hasSeen, upgradeName,
    clickDamage, critChance, critMult, dps, autoClicks, dropCount, zennyMult, lvl,
  };
})();
