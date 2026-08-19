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
  // Charm tier weights per rank, and one new tier unlocked per promotion — which lines
  // the charm tables up with the rank ladder exactly:
  //
  //   Low Rank    mystery + shining     rarity 1-4    Pawn .. Rook
  //   High Rank   adds timeworn         rarity 5-7    .. Dragon
  //   G Rank      adds enduring         rarity 8-10   .. Creator
  //
  // So rank is the only thing deciding which talismans exist for you, and every
  // promotion opens a table you have genuinely never seen. Letting a Creator Talisman
  // fall out of a Low Rank hunt, even at 1-in-100, makes the whole ladder pointless:
  // the best table would already be open on hunt one.
  const TIER_WEIGHTS = [
    { mystery: 60, shining: 40, timeworn: 0, enduring: 0 },
    { mystery: 25, shining: 42, timeworn: 33, enduring: 0 },
    { mystery: 5, shining: 20, timeworn: 50, enduring: 25 },
  ];
  // The lowest rank each tier may appear at, enforced after a variant's `shift` has
  // been applied — otherwise a Dragonite Brachydios at Low Rank could shift its way
  // into a locked table and hand you the very thing the weights just excluded.
  const TIER_MIN_RANK = { mystery: 0, shining: 0, timeworn: 1, enduring: 2 };

  // ── Upgrades ─────────────────────────────────────────────────────────────────
  // Names are deliberately plain; rename them freely, nothing keys off the label.
  // Each level costs zenny (growing by `mult`) plus a few of one ore, and the ore
  // demanded steps up as you climb — early levels want Iron, late ones want Ultimas.
  // Ordered by how hard the ore actually is to get: rank first (from the game's own
  // mining tables), then within a rank by how common the Brachydios wearing it is.
  // Machalite Ore used to sit ahead of Earth Crystal, which made the ladder dip — you
  // climbed to Machalite (sells 160, spawn weight 88) and the next rung asked for
  // Earth Crystal (sells 80, weight 104), an ore both cheaper and commoner than the one
  // before it. Every step now costs at least as much as the last.
  const ORE_LADDER = ["iron", "earth", "machalite", "dragonite", "carbalite",
    "fucium", "lightcrystal", "firecell", "eltalite", "allfire", "purecrystal", "ultimas"];

  // What an ore is worth here. The game's own prices very nearly climb with the ladder
  // — verified against mhgu.db, where sell is buy/10 for every one of these — but they
  // dip once: Firecell Stone sells for 1,720z and Eltalite Ore, which is G-exclusive
  // and rarer, for only 1,280z. Selling a harder-won ore for less reads as a mistake in
  // a game about climbing a ladder, so any rung whose real price would fall below the
  // one beneath it is lifted just clear of it.
  //
  // This lives here rather than in data/ores.js on purpose: that file is transcribed
  // game truth and nothing invented belongs in it. The real number stays there, and
  // this is the design layer choosing to override one of them.
  const ORE_STEP_UP = 1.15;     // how far clear of the rung below a lifted price sits
  const ORE_VALUE = (() => {
    const out = {};
    let floor = 0;
    for (const id of ORE_LADDER) {
      const real = oreById[id].sell;
      // Only a rung that would actually fall gets lifted. Using a flat 15% floor
      // instead also moved Lightcrystal and Ultimas Crystal, which already rise —
      // just by less than 15% — and there is no reason to overwrite a real price
      // that is already going the right way.
      out[id] = real > floor ? real : Math.round(floor * ORE_STEP_UP);
      floor = out[id];
    }
    return out;
  })();
  const oreValue = id => ORE_VALUE[id] != null ? ORE_VALUE[id] : oreById[id].sell;

  // Buying an ore costs ten times what it sells for. That spread isn't invented: in
  // mhgu.db the buy column is exactly 10x sell for all twelve of these, so this is the
  // game's own margin. Derived from oreValue rather than the raw sell price, so the
  // lifted Eltalite price carries through and buying climbs the ladder too.
  const ORE_BUY_MARGIN = 10;
  const oreBuyPrice = id => oreValue(id) * ORE_BUY_MARGIN;

  // Ore you can buy is ore you don't have to wait for. It gives a late player's bank
  // something to do besides sit there, and turns "blocked on Ultimas Crystal" from a
  // wait into a decision about whether it's worth 75,000z a piece.
  function buyOre(id, qty) {
    if (!state || !oreById[id]) return 0;
    const n = Math.max(0, Math.floor(qty || 0));
    if (!n) return 0;
    const cost = n * oreBuyPrice(id);
    if (state.zenny < cost) return 0;
    state.zenny -= cost;
    state.ores[id] = (state.ores[id] || 0) + n;
    onChange();
    return cost;
  }

  const UPGRADES = [
    // ore:0 puts this at the bottom of the ladder — Iron Ore. Nothing else starts
    // that low, and without it the most common drop in the game would never be asked
    // for by anything.
    { id: "dmg", name: "Sharpness", levelled: true, desc: "+1 damage per click",
      target: 9000000, max: 60, ore: 0 },
    { id: "crit", name: "Critical Eye", levelled: true, desc: "+2% critical chance",
      target: 3600000, max: 20, ore: 3 },
    { id: "critdmg", name: "Crit Boost", levelled: true, desc: "+0.25x critical damage",
      target: 3600000, max: 16, ore: 4 },
    // nameAfter: what the entry is called once you own at least one level. The first
    // purchase is the hire; everything after it is kitting them out.
    { id: "dps", name: "Hire a Palico", nameAfter: "Upgrade Palico Gear",
      desc: "+2 damage per second, hands-free",
      target: 9000000, max: 50, ore: 3 },
    // Distinct from a Palico on purpose: a Palico adds flat damage per second, a
    // hired hunter throws a real attack — so these scale with your click damage and
    // can crit. Late on they're worth far more than raw DPS, which is why they cost
    // more and cap lower.
    { id: "hunters", name: "Hunters for Hire", nameAfter: "Upgrade Hunters for Hire Gear",
      desc: "+1 attack per second, using your click damage",
      target: 13500000, max: 30, ore: 6 },
    { id: "zenny", name: "Crazy Lucky Cat", levelled: true, desc: "+15% zenny per kill",
      target: 5400000, max: 12, ore: 5 },
    // The supply side of the smithy: every other upgrade spends ore, this one earns it.
    // Named after the MHGU skill that adds reward slots, which is the same idea.
    { id: "luck", name: "Good Luck", levelled: true, desc: "+1 ore from every hunt",
      target: 5400000, max: 12, ore: 4 },

    // The steep 3.2x is deliberate — each level is a flat multiplier on every charm
    // you'll ever get — but the 40,000 base it was raised to in the cost rebalance
    // was never checked on its own, and it locked a light player out of level one
    // entirely across a whole session. The steepness is what makes it a long goal;
    // the base only decides whether you can start.
    { id: "drop", name: "Charm Chaser", levelled: true, desc: "+1 charm per kill",
      target: 9000000, max: 12, ore: 8 },

    // The two hires. One-offs, priced to be the thing you save for rather than
    // something you drift into: each wants a stack of a G-rank ore, and Ultimas
    // Crystal is the rarest drop in the game.
    { id: "maximeld", name: "Maximeld XIV", hire: true, desc: "Loads the Melding Pot for you after every hunt",
      base: 1500000, mult: 1, max: 1, ore: 16, oreQty: 15 },
    // Sells at whatever "Junk ≤" is already set to, so the hire adds no new control —
    // the dropdown you were already using becomes her instructions.
    { id: "neko", name: "Neko (Means Cat)", hire: true, desc: "Sells junk charms for you, at your Junk ≤ setting",
      base: 2000000, mult: 1, max: 1, ore: 18, oreQty: 12 },
    { id: "argosy", name: "Argosy Captain", hire: true, desc: "Sells ore no upgrade still needs, plus any surplus",
      base: 2500000, mult: 1, max: 1, ore: 20, oreQty: 12 },
    // 10 Ultimas rather than 20: the ore ladder caps at Ultimas Crystal, so the late
    // levels of every other upgrade are competing for the same drop. At 20 the
    // simulation never once managed to bank enough, in any profile.
    { id: "kokoto", name: "Kokoto Gal", hire: true, desc: "Spends your zenny and ore on upgrades for you",
      base: 4000000, mult: 1, max: 1, ore: 22, oreQty: 10 },
    // The last hire, and the only one you can't meet on a first run: it appears once
    // you have prestiged at least once, because until then "prestige for me" is an
    // offer to do something you have never seen happen. With this and Kokoto Gal both
    // working, the farm runs its own loop — climb, finish, prestige, climb again.
    { id: "guild", name: "Guild Manager", hire: true, afterPrestige: true,
      desc: "Prestiges for you as soon as the smithy is finished",
      base: 6000000, mult: 1, max: 1, ore: 22, oreQty: 20 },
  ];
  const upgradeById = Object.fromEntries(UPGRADES.map(u => [u.id, u]));

  // An upgrade with `afterPrestige` doesn't exist until you have prestiged once. The
  // shop and both automated buyers go through here, so it can't be rendered, picked or
  // bought early.
  const isUnlocked = up => !up.afterPrestige || prestige() > 0;
  const visibleUpgrades = () => UPGRADES.filter(isUnlocked);

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
  // Superseded by oreRung below; kept only because the tests still assert on it.
  const oreStep = up => Math.min(8, Math.max(1, Math.round(up.max / 8)));

  // Every upgrade walks the WHOLE ladder over its own lifetime: its rung is simply how
  // far through its levels you are. So level 1 of anything wants Iron Ore and the last
  // level of anything wants Ultimas Crystal, whatever its cap.
  //
  // The old rule gave each upgrade a starting rung and a fixed levels-per-rung, which
  // left the two ends of the ladder stranded — Iron Ore was asked for by Sharpness's
  // first eight levels and nothing else ever, while Ultimas Crystal was asked for only
  // by levels past 80 that no measured session ever reached. An upgrade with fewer
  // levels than there are ores skips rungs rather than stopping partway up.
  const oreRung = (up, level) =>
    Math.min(ORE_LADDER.length - 1, Math.floor(level / maxLevel(up) * ORE_LADDER.length));

  // The quantity climbs every second level. It used to be level/4, which meant the
  // first four levels of anything cost a single ore each — you could buy a row of
  // Palicoes off one hunt's drops.
  // How big a stack a level asks for. Like the rung itself, this is a fraction of the
  // way through the upgrade rather than the raw level number — otherwise a long upgrade
  // demands enormous stacks purely for being long. On the old level/2 rule the last four
  // levels of Hire a Palico wanted 24-25 Ultimas Crystal each, 98 in total, for +8
  // damage per second, while Charm Chaser's top level wanted 6.
  const ORE_QTY_TOP = 12;       // stack size at the very last level of any upgrade
  function oreCost(up, level) {
    // A hire is a single purchase, so it has no ladder to walk and no progress to
    // measure — it keeps the fixed rung and stack its `ore`/`oreQty` fields name.
    if (up.hire) {
      const idx = Math.min(ORE_LADDER.length - 1, Math.floor(up.ore / 2));
      return { ore: ORE_LADDER[idx], qty: up.oreQty || 1 };
    }
    const max = maxLevel(up);
    const progress = max > 1 ? level / (max - 1) : 1;
    return {
      ore: ORE_LADDER[oreRung(up, level)],
      qty: 1 + Math.round(progress * (ORE_QTY_TOP - 1)),
    };
  }
  // What a level costs.
  //
  // Two things are chosen here, and the per-level multiplier falls out of them rather
  // than being set by hand:
  //
  //   COST_SPREAD  how many times dearer the LAST level is than the first. Fixing the
  //                spread instead of the rate is what keeps a 60-level upgrade and a
  //                12-level one feeling alike. A flat rate applied to both put 94% of
  //                Sharpness's entire cost in its last fifteen levels, because a rate
  //                that is mild over twelve levels is savage over sixty.
  //
  //   COST_CLIMB   how much dearer a whole climb is than the one before it. The base is
  //                re-solved from this at the CURRENT cap, so growing the cap at each
  //                prestige lengthens the climb without detonating the top of it.
  //                Left to compound, a climb cost 58M, then 441M, then 4.7B, then 68B —
  //                7x to 14x per prestige against rewards that only grow by half.
  const COST_SPREAD = 200;
  const COST_CLIMB = 1.6;
  function zennyCost(up, level) {
    if (up.hire) return up.base;              // one-off, bought once, never rescaled
    const n = maxLevel(up);
    const mult = Math.pow(COST_SPREAD, 1 / Math.max(1, n - 1));
    const target = up.target * Math.pow(COST_CLIMB, prestige());
    const base = target * (mult - 1) / (Math.pow(mult, n) - 1);
    return Math.round(base * Math.pow(mult, level));
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
  let onPalicoHit = () => {};
  let timer = null;
  let autoCarry = 0;      // fractional auto-attacks owed between ticks
  let palicoCarry = 0;    // seconds owed towards the next Palico mark

  function fresh() {
    // `seen` is the trophy list — which variants you've actually hunted. It gates the
    // theme picker, so it has to persist with the run. The base Brachydios starts
    // unlocked: he's the one already standing in front of you, and a picker showing
    // fourteen locked tiles on a fresh save reads as broken rather than as progression.
    // `gods` is a running tally so each find can announce which number it is.
    return { zenny: 0, kills: 0, hp: 0, variant: "base", upgrades: {}, ores: {},
      seen: { base: true }, gods: 0, prestige: 0 };
  }
  const hasSeen = id => !!(state && state.seen && state.seen[id]);

  // ── Prestige ─────────────────────────────────────────────────────────────────
  // Clear the smithy and start the climb again, keeping a permanent multiplier. What
  // survives is the collection: the charm box, the god charms, the coats you've met
  // and the four hires. What goes is everything you'd re-earn — upgrades, zenny, ore
  // and your rank, so you're back on the base Brachydios at Low Rank.
  //
  // The reward is split across two smaller multipliers rather than one large one:
  // drops give you more charms per hunt directly, damage gets you through the HP curve
  // faster so the hunts come quicker too. Both compound with prestige count.
  const PRESTIGE_DROP = 0.35;    // +35% charms per hunt per prestige
  const PRESTIGE_DAMAGE = 0.50;  // +50% damage per prestige
  // +50% zenny per prestige, matching damage. Without this a climb was strictly poorer
  // than the one before it: the payout is HP x rate x Crazy Lucky Cat, and both HP and
  // that skill reset, so hunt 100 paid 87z at every prestige while the smithy it had to
  // buy grew 1.6x each time.
  const PRESTIGE_ZENNY = 0.50;
  // Each climb is longer than the last: every upgrade gains a quarter of its base cap.
  const PRESTIGE_LEVELS = 0.25;

  const prestige = () => (state && state.prestige) || 0;
  const dropMult = () => 1 + prestige() * PRESTIGE_DROP;
  const damageMult = () => 1 + prestige() * PRESTIGE_DAMAGE;
  // An upgrade's cap for the run you're on. Used everywhere `up.max` used to be, so
  // the ore ladder still spreads across whatever the current cap happens to be.
  const maxLevel = up => up.hire ? up.max
    : Math.round(up.max * (1 + prestige() * PRESTIGE_LEVELS));

  // You may prestige once the smithy is finished — every levelled upgrade at its cap.
  // That makes the button the reward for clearing the shop rather than a trap you can
  // press early and lose progress to.
  const canPrestige = () =>
    UPGRADES.filter(u => !u.hire).every(u => lvl(u.id) >= maxLevel(u));

  function doPrestige() {
    if (!canPrestige()) return false;
    const keep = {
      seen: state.seen,           // the coats you've met stay met
      gods: state.gods,           // and the god charm tally keeps counting
      prestige: prestige() + 1,
      upgrades: {},
    };
    // The hires are quality of life you already paid for; re-buying them every climb
    // would repeat the slowest part of the grind rather than adding to it.
    for (const u of UPGRADES) if (u.hire && lvl(u.id) > 0) keep.upgrades[u.id] = lvl(u.id);
    state = Object.assign(fresh(), keep);
    spawn();
    return true;
  }

  // Rank is gated on hunts, but the ore ladder is gated on how far through an upgrade
  // you are — and those caps grow 25% per prestige. Left fixed, rank raced further ahead
  // every climb: G Rank always arrived at hunt 100, while leaving Iron Ore went from
  // Sharpness Lv5 of 60 to Lv8 of 90. The gates now grow with the caps.
  const rankKills = i => Math.round(RANKS[i].kills * (1 + prestige() * PRESTIGE_LEVELS));
  function rankIndex() {
    let r = 0;
    for (let i = 0; i < RANKS.length; i++) if (state.kills >= rankKills(i)) r = i;
    return r;
  }
  const rankName = () => RANKS[rankIndex()].name;
  const variant = () => variantById[state.variant] || variantById.base;

  function hpMax() {
    const curve = Math.pow(1 + state.kills * HP_RATE, HP_POWER);
    return Math.max(1, Math.round(HP_BASE * curve * variant().hp));
  }

  const lvl = id => state.upgrades[id] || 0;
  const clickDamage = () => Math.round((1 + lvl("dmg")) * damageMult());
  const critChance = () => Math.min(0.5, lvl("crit") * 0.02);
  const critMult = () => 2 + lvl("critdmg") * 0.25;
  const dps = () => Math.round(lvl("dps") * 2 * damageMult());
  const autoClicks = () => lvl("hunters");        // attacks per second
  const dropCount = () => Math.round((1 + lvl("drop")) * dropMult());
  const zennyMult = () => 1 + lvl("zenny") * 0.15;
  // Kept apart from zennyMult so the Crazy Lucky Cat readout stays a report on the
  // skill rather than a blend of the skill and your prestige count.
  const moneyMult = () => 1 + prestige() * PRESTIGE_ZENNY;
  const oreBonus = () => lvl("luck");             // extra ore on every haul

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
    const rank = rankIndex();
    const w = Object.assign({}, TIER_WEIGHTS[rank]);
    const order = window.ROLL.TIER_ORDER;
    for (let i = 0; i < v.shift; i++) {
      // Push weight one tier up the ladder, leaving the top tier to accumulate.
      for (let t = order.length - 1; t > 0; t--) w[order[t]] += w[order[t - 1]] * 0.6;
      for (let t = 0; t < order.length - 1; t++) w[order[t]] *= 0.45;
    }
    // The rank gate is applied last, so no shift can open a tier this rank shouldn't
    // see. Its weight falls back to the tier below rather than being discarded.
    for (let t = order.length - 1; t > 0; t--) {
      if (rank < TIER_MIN_RANK[order[t]]) { w[order[t - 1]] += w[order[t]]; w[order[t]] = 0; }
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
  //
  // Good Luck adds to every haul. It's the only lever that raises TOP-tier supply:
  // measured against a full set of maxed upgrades, the low ores run a surplus in the
  // thousands while the four G ores run short by 22 to 280, and no amount of trading
  // surplus upward closes that — each conversion divides, so a 2,417 Iron surplus is
  // spent long before it has climbed nine rungs. More ore per kill is the fix.
  function rollOres(v) {
    if (!v.ore) return {};
    const bonus = lvl("luck");
    if (v.ore === "*G") {
      const got = {};
      for (const o of ORES.filter(o => o.rank === 2)) got[o.id] = 2 + Math.floor(Math.random() * 3) + bonus;
      return got;
    }
    return { [v.ore]: 2 + Math.floor(Math.random() * 3) + bonus };
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
    const pay = Math.round(worth * 0.38 * zennyMult() * moneyMult());
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
    if (upgradeById[id] && !isUnlocked(upgradeById[id])) return "Not available yet.";
    const up = upgradeById[id];
    if (!up) return "No such upgrade.";
    const level = lvl(id);
    if (level >= maxLevel(up)) return "Already at maximum.";
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
      for (let lv = lvl(up.id); lv < maxLevel(up); lv++) need.add(oreCost(up, lv).ore);
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
  // Buy the ore an upgrade is short of, if that's the only thing stopping it and both
  // the ore and the upgrade are affordable. This is what stops a rich player standing
  // idle waiting for Ultimas Crystal to drop — the wait becomes a decision about
  // whether it's worth the money.
  //
  // Kokoto Gal and the simulation both reach the shop through here, so the automated
  // player spends the way a paying one would rather than hoarding zenny it can't use.
  //
  // `maxGap` limits it to upgrades that are nearly there: the Argosy Captain uses it to
  // close a small shortfall rather than bankroll a whole level's ore.
  function stockUpFor(up, maxGap) {
    const level = lvl(up.id);
    if (level >= maxLevel(up)) return 0;
    const oc = oreCost(up, level);
    const short = oc.qty - (state.ores[oc.ore] || 0);
    if (short <= 0) return 0;
    if (maxGap != null && short > maxGap) return 0;
    const oreBill = short * oreBuyPrice(oc.ore);
    // Never spend so much on ore that the upgrade itself falls out of reach.
    if (state.zenny < oreBill + zennyCost(up, level)) return 0;
    return buyOre(oc.ore, short);
  }

  function nextPurchase() {
    let best = null;
    for (const up of visibleUpgrades()) {
      const level = lvl(up.id);
      if (level >= maxLevel(up)) continue;
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
    const gain = n * oreValue(id);
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
      if (d > 0) {
        hit(d * elapsed, false, true);
        // A Palico's damage is continuous, so there's no natural "a blow landed"
        // moment the way there is for a click or a hired hunter — which left the
        // monster taking Palico damage with nothing showing on it at all. Emit one
        // mark a second: enough to see the Palico working, and a fixed cadence so it
        // doesn't turn into a wall of slashes once the damage gets large.
        palicoCarry += elapsed;
        if (palicoCarry >= 1) { palicoCarry -= Math.floor(palicoCarry); onPalicoHit(); }
      }

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
    palicoCarry = 0;
    if (hooks) {
      onTick = hooks.onTick || (() => {});
      onChange = hooks.onChange || (() => {});
      onKill = hooks.onKill || (() => {});
      onAutoClick = hooks.onAutoClick || (() => {});
      onPalicoHit = hooks.onPalicoHit || (() => {});
    }
    startTick();
    onChange();
  }
  function reset() { init(null, { onTick, onChange, onKill, onAutoClick, onPalicoHit }); }

  return {
    VARIANTS, RANKS, UPGRADES, ORES, oreById, variantById, ORE_LADDER,
    init, reset, click, hit, buy, canBuy, sellOre, oreValue, oreBuyPrice, buyOre, oresStillNeeded, spawn, catchUp, avgHit,
    nextPurchase, stockUpFor, visibleUpgrades, isUnlocked,
    zennyCost, oreCost,
    get state() { return state; },
    rankIndex, rankName, variant, hpMax, hasSeen, upgradeName, maxLevel,
    prestige, dropMult, damageMult, moneyMult, rankKills, canPrestige, doPrestige,
    PRESTIGE_DROP, PRESTIGE_DAMAGE, PRESTIGE_ZENNY, PRESTIGE_LEVELS,
    rollDrops,        // exported so the rank gate on charm rarity can be tested
    clickDamage, critChance, critMult, dps, autoClicks, dropCount, zennyMult, oreBonus, lvl,
  };
})();
