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
  // Brachydios (from the save editor). Every ore variant is that same base webp under
  // a CSS filter, rotating its navy body toward the ore's real icon colour.
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
    { id: "base", name: "Brachydios", icon: "brachy", filter: "none",
      ore: null, rank: 0, w: 100, hp: 1, shift: 0 },

    { id: "iron", name: "Iron Brachydios", icon: "brachy",
      filter: "saturate(.2) brightness(1.05)",
      ore: "iron", rank: 0, w: 45, hp: 1.3, shift: 0 },
    { id: "earth", name: "Earth Crystal Brachydios", icon: "brachy",
      filter: "grayscale(.85) brightness(1.3)",
      ore: "earth", rank: 0, w: 40, hp: 1.45, shift: 0 },
    { id: "machalite", name: "Machalite Brachydios", icon: "brachy",
      filter: "hue-rotate(-10deg) saturate(1.5) brightness(1.05)",
      ore: "machalite", rank: 0, w: 32, hp: 1.7, shift: 0 },
    { id: "dragonite", name: "Dragonite Brachydios", icon: "brachy",
      filter: "hue-rotate(-100deg) saturate(1.4)",
      ore: "dragonite", rank: 0, w: 18, hp: 2.2, shift: 1 },

    { id: "carbalite", name: "Carbalite Brachydios", icon: "brachy",
      filter: "hue-rotate(60deg) saturate(1.5)",
      ore: "carbalite", rank: 1, w: 30, hp: 2.6, shift: 1 },
    { id: "fucium", name: "Fucium Brachydios", icon: "brachy",
      filter: "hue-rotate(112deg) saturate(1.45) brightness(1.5)",
      ore: "fucium", rank: 1, w: 22, hp: 3, shift: 1 },
    { id: "lightcrystal", name: "Lightcrystal Brachydios", icon: "brachy",
      filter: "saturate(.04) brightness(1.8)",
      ore: "lightcrystal", rank: 1, w: 16, hp: 3.4, shift: 1 },
    { id: "firecell", name: "Firecell Brachydios", icon: "brachy",
      filter: "hue-rotate(170deg) saturate(1.8) brightness(1.05)",
      ore: "firecell", rank: 1, w: 10, hp: 4.2, shift: 2 },

    { id: "eltalite", name: "Eltalite Brachydios", icon: "brachy",
      filter: "hue-rotate(140deg) saturate(1.9)",
      ore: "eltalite", rank: 2, w: 26, hp: 5, shift: 1 },
    { id: "allfire", name: "Allfire Brachydios", icon: "brachy",
      filter: "hue-rotate(140deg) saturate(2.4) brightness(.5)",
      ore: "allfire", rank: 2, w: 14, hp: 6.5, shift: 2 },
    { id: "purecrystal", name: "Purecrystal Brachydios", icon: "brachy",
      filter: "hue-rotate(-30deg) saturate(1.3) brightness(1.25)",
      ore: "purecrystal", rank: 2, w: 8, hp: 7.5, shift: 2 },
    { id: "ultimas", name: "Ultimas Brachydios", icon: "brachy",
      filter: "hue-rotate(195deg) saturate(1.9) brightness(1.1)",
      ore: "ultimas", rank: 2, w: 6, hp: 8.5, shift: 2 },

    // The only variant with its own artwork, and the rarest thing in the pool.
    // "*G" means it pays out a spread of G-rank ores instead of a single one.
    { id: "raging", name: "Raging Brachydios", icon: "raging", filter: "none",
      ore: "*G", rank: 2, w: 3, hp: 12, shift: 2 },
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
    { id: "dmg", name: "Sharper strikes", desc: "+1 damage per click",
      base: 25, mult: 1.15, max: 999, ore: 2 },
    { id: "crit", name: "Keener eye", desc: "+2% critical chance",
      base: 150, mult: 1.22, max: 20, ore: 3 },
    { id: "critdmg", name: "Heavier crits", desc: "+0.25x critical damage",
      base: 400, mult: 1.25, max: 16, ore: 4 },
    { id: "dps", name: "Hire a Palico", desc: "+2 damage per second, hands-free",
      base: 200, mult: 1.18, max: 200, ore: 3 },
    { id: "drop", name: "Wider haul", desc: "+1 charm per kill",
      base: 5000, mult: 3.2, max: 6, ore: 8 },
    { id: "zenny", name: "Better appraisal", desc: "+15% zenny per kill",
      base: 1200, mult: 1.35, max: 12, ore: 5 },
  ];
  const upgradeById = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

  // Which ore a given upgrade level demands, and how many. Levels walk up the ladder
  // so the shop keeps pointing you at whatever you haven't farmed yet.
  function oreCost(up, level) {
    const idx = Math.min(ORE_LADDER.length - 1, Math.floor(level / 3) + Math.floor(up.ore / 2));
    return { ore: ORE_LADDER[idx], qty: 1 + Math.floor(level / 4) };
  }
  function zennyCost(up, level) {
    return Math.round(up.base * Math.pow(up.mult, level));
  }

  // ── State ────────────────────────────────────────────────────────────────────
  const HP_BASE = 20;
  const HP_GROWTH = 1.055;   // per kill, before the variant multiplier

  let state = null;
  let onChange = () => {};
  let onKill = () => {};
  let timer = null;

  function fresh() {
    return { zenny: 0, kills: 0, hp: 0, variant: "base", upgrades: {}, ores: {} };
  }

  function rankIndex() {
    let r = 0;
    for (let i = 0; i < RANKS.length; i++) if (state.kills >= RANKS[i].kills) r = i;
    return r;
  }
  const rankName = () => RANKS[rankIndex()].name;
  const variant = () => variantById[state.variant] || variantById.base;

  function hpMax() {
    return Math.max(1, Math.round(HP_BASE * Math.pow(HP_GROWTH, state.kills) * variant().hp));
  }

  const lvl = id => state.upgrades[id] || 0;
  const clickDamage = () => 1 + lvl("dmg");
  const critChance = () => Math.min(0.5, lvl("crit") * 0.02);
  const critMult = () => 2 + lvl("critdmg") * 0.25;
  const dps = () => lvl("dps") * 2;
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
  function rollOres(v) {
    if (!v.ore) return {};
    if (v.ore === "*G") {
      const g = ORES.filter(o => o.rank === 2);
      const got = {};
      for (const o of g) got[o.id] = 1 + Math.floor(Math.random() * 2);
      return got;
    }
    return { [v.ore]: 1 + Math.floor(Math.random() * 3) };
  }

  function kill() {
    const v = variant();
    state.kills++;
    const pay = Math.round((40 + state.kills * 6) * v.hp * zennyMult());
    state.zenny += pay;

    const ores = rollOres(v);
    for (const id in ores) state.ores[id] = (state.ores[id] || 0) + ores[id];

    const charms = rollDrops(v);
    const killed = v;
    spawn();
    onKill({ variant: killed, zenny: pay, ores, charms });
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
    if (state.hp <= 0) kill();
    else onChange();
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
      const elapsed = (now - last) / 1000;
      last = now;
      const d = dps();
      // Measured against the clock rather than assuming a clean 100 ms, so a
      // backgrounded tab that throttles the interval doesn't quietly lose damage.
      if (d > 0 && state) hit(d * elapsed, false, true);
    }, 100);
  }

  function init(saved, hooks) {
    state = Object.assign(fresh(), saved || {});
    state.upgrades = Object.assign({}, (saved && saved.upgrades) || {});
    state.ores = Object.assign({}, (saved && saved.ores) || {});
    if (!variantById[state.variant]) state.variant = "base";
    if (!state.hp || state.hp <= 0 || state.hp > hpMax()) spawn();
    // Only replace the hooks when we're actually given some. Loading a save calls
    // init again to swap the run state in, and passing null there must not silently
    // unhook the app — that would leave kills dropping charms into nothing.
    if (hooks) {
      onChange = hooks.onChange || (() => {});
      onKill = hooks.onKill || (() => {});
    }
    startTick();
    onChange();
  }
  function reset() { init(null, { onChange, onKill }); }

  return {
    VARIANTS, RANKS, UPGRADES, ORES, oreById, variantById, ORE_LADDER,
    init, reset, click, hit, buy, canBuy, sellOre, spawn,
    zennyCost, oreCost,
    get state() { return state; },
    rankIndex, rankName, variant, hpMax,
    clickDamage, critChance, critMult, dps, dropCount, zennyMult, lvl,
  };
})();
