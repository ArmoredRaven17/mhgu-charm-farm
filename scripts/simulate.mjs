// Economy simulation: how long does it actually take to upgrade things?
//
// Run: node scripts/simulate.mjs [hours]
//
// This drives the real farm.js — the same HP curve, variant weights, drop tables,
// costs and payouts the app uses — on a fake clock, so the numbers below are the
// game's own, not a model of it. The only things invented here are the *player*:
// how fast they click, what they buy, and what they sell.
//
// The idle tick is stubbed out (setInterval never fires) and time is advanced by
// hand one simulated second at a time, so a 24-hour run takes a moment rather than
// a day.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const docs = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");
const win = {};
globalThis.window = win;
// farm.js calls startTick() from init(); neutering setInterval keeps the real clock
// out of it so we can step time ourselves.
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = () => 0;
for (const f of ["data/charm.js", "data/skills.js", "data/ores.js", "roll.js", "farm.js"]) {
  (0, eval)(readFileSync(join(docs, f), "utf8"));
}
globalThis.setInterval = realSetInterval;
const ROLL = win.ROLL, FARM = win.FARM;

// Deterministic RNG so two runs of the same profile are comparable.
function seedRandom(seed) {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const BOX_CAP = 2000;   // matches BOX_SIZE in docs/box.js — the in-game hunter box
const HOURS = Number(process.argv[2]) || 8;
const SECONDS = Math.round(HOURS * 3600);

// The player. Everything here is an assumption, not something the game dictates.
// A player who never clicks at all can never start — there's no income without a
// first kill — so the lightest profile still taps occasionally.
const PROFILES = [
  { name: "Light (0.5 clicks/s)", cps: 0.5 },
  { name: "Casual (2 clicks/s)", cps: 2 },
  { name: "Active (6 clicks/s)", cps: 6 },
];

// Milestones worth timing.
const WATCH = [
  { key: "rank:1", label: "High Rank" },
  { key: "rank:2", label: "G Rank" },
  { key: "kills:100", label: "100 hunts" },
  { key: "kills:1000", label: "1,000 hunts" },
];

function runProfile(profile, seed) {
  seedRandom(seed);

  let box = [];                 // charms held, as {c, v}
  let sold = 0, soldZenny = 0, lostToFullBox = 0;
  const variantKills = {};      // variant id -> kills
  const oreGained = {};         // ore id -> total mined
  const buyTimes = [];          // second of every purchase, for pacing
  let charmsRolled = 0, gods = 0, firstGod = null, clock = 0;
  const times = {};             // milestone -> second reached
  const firstBuy = {};          // upgrade id -> second of first purchase
  const levelAt = {};           // upgrade id -> {5: sec, 10: sec, 25: sec}
  let oreStarvedSeconds = 0;    // seconds blocked only by ore
  let zennyBlocked = 0;         // seconds blocked only by zenny
  let bothBlocked = 0;          // seconds where neither resource was enough
  let bankRatioSum = 0, bankRatioN = 0;   // banked zenny ÷ cheapest thing you can't buy

  const mark = (key, t) => { if (times[key] === undefined) times[key] = t; };

  FARM.init(null, {
    onTick: () => {},
    onChange: () => {},
    onAutoClick: () => {},
    onKill: res => {
      variantKills[res.variant.id] = (variantKills[res.variant.id] || 0) + 1;
      for (const id in res.ores) oreGained[id] = (oreGained[id] || 0) + res.ores[id];
      for (const c of res.charms) {
        charmsRolled++;
        if (ROLL.isGod(c)) { gods++; if (firstGod === null) firstGod = clock; }
        if (box.length >= BOX_CAP) { lostToFullBox++; continue; }
        box.push({ c, v: ROLL.charmValue(c) });
      }
    },
  });

  // Average damage of one attack, accounting for crit chance and multiplier.
  const avgHit = () => FARM.clickDamage() * (1 + FARM.critChance() * (FARM.critMult() - 1));

  for (let t = 1; t <= SECONDS; t++) {
    clock = t;
    // ── Damage for this second ────────────────────────────────────────────────
    // Clicks and hired hunters both use click damage; Palicoes add flat DPS.
    let budget = (profile.cps + FARM.autoClicks()) * avgHit() + FARM.dps();
    // Spend it across as many monsters as it actually kills. Overkill on the final
    // blow is wasted, exactly as it is in the app (spawn resets HP).
    let guard = 0;
    while (budget > 0 && guard++ < 10000) {
      const take = Math.min(budget, FARM.state.hp);
      FARM.hit(take, false, true);
      budget -= take;
      if (budget <= 1e-9) break;
    }

    // ── Sell ──────────────────────────────────────────────────────────────────
    // The player cashes out anything at rarity 4 or below, and if the box is still
    // filling up, sells the least valuable charm to make room. God charms are kept.
    const keep = [];
    for (const e of box) {
      if (e.c.r <= 4 && !ROLL.isGod(e.c)) { FARM.state.zenny += e.v; sold++; soldZenny += e.v; }
      else keep.push(e);
    }
    box = keep;
    if (box.length > BOX_CAP * 0.9) {
      box.sort((a, b) => a.v - b.v);
      while (box.length > BOX_CAP * 0.7) {
        const e = box.shift();
        if (ROLL.isGod(e.c)) { box.push(e); break; }
        FARM.state.zenny += e.v; sold++; soldZenny += e.v;
      }
    }

    // ── Buy ───────────────────────────────────────────────────────────────────
    // Uses FARM.nextPurchase — the same policy Kokoto Gal follows in the app, so this
    // measures the real buyer rather than a second implementation of one. It clears a
    // rung of the ore ladder before climbing, taking the cheapest option within a rung,
    // so cheap upgrades keep flowing without starving the expensive ones.
    let bought = true, blockedByOreOnly = false;
    while (bought) {
      bought = false;
      const options = FARM.UPGRADES
        .map(u => ({ u, lv: FARM.lvl(u.id), why: FARM.canBuy(u.id) }))
        .filter(o => o.lv < o.u.max);
      let pick = FARM.nextPurchase();
      // Ore can be bought now, so a player sitting on money doesn't simply wait for a
      // drop. Mirrors what Kokoto Gal does in the app: if nothing is affordable
      // outright, top up the ore for the cheapest thing still wanted and take it.
      if (!pick) {
        for (const u of FARM.UPGRADES) {
          if (FARM.lvl(u.id) >= FARM.maxLevel(u)) continue;
          if (FARM.stockUpFor(u) && !FARM.canBuy(u.id)) { pick = FARM.nextPurchase(); break; }
        }
      }
      if (pick) {
        FARM.buy(pick.up.id);
        bought = true;
        buyTimes.push(t);
        const lv = FARM.lvl(pick.up.id);
        if (firstBuy[pick.up.id] === undefined) firstBuy[pick.up.id] = t;
        levelAt[pick.up.id] = levelAt[pick.up.id] || {};
        for (const m of [5, 10, 25]) if (lv === m) levelAt[pick.up.id][m] = t;
      } else if (options.length) {
        // Classify what's actually holding you back. `canBuy` returns "Need 400z and
        // 1x Earth Crystal", so the two halves of the sentence say which resource is
        // short. A healthy economy blocks on both at different times; blocking on one
        // forever means the other has stopped mattering.
        const reasons = options.map(o => o.why || "");
        const zennyOnly = reasons.some(w => /\dz/.test(w) && !/x /.test(w));
        const oreOnly = reasons.some(w => /x /.test(w) && !/\dz/.test(w));
        if (zennyOnly && !oreOnly) zennyBlocked++;
        else if (oreOnly && !zennyOnly) blockedByOreOnly = true;
        else if (zennyOnly && oreOnly) bothBlocked++;
        // Cheapest thing you can't afford, against what you're holding.
        const cheapest = Math.min(...options.map(o => FARM.zennyCost(o.u, o.lv)));
        if (cheapest > 0) bankRatioSum += FARM.state.zenny / cheapest, bankRatioN++;
      }
    }
    if (blockedByOreOnly) oreStarvedSeconds++;

    // ── Milestones ────────────────────────────────────────────────────────────
    mark("rank:" + FARM.rankIndex(), t);
    if (FARM.state.kills >= 100) mark("kills:100", t);
    if (FARM.state.kills >= 1000) mark("kills:1000", t);
  }

  return {
    profile: profile.name,
    kills: FARM.state.kills,
    rank: FARM.rankName(),
    zenny: Math.floor(FARM.state.zenny),
    ores: Object.fromEntries(Object.entries(FARM.state.ores).filter(([, n]) => n > 0)),
    levels: Object.fromEntries(FARM.UPGRADES.map(u => [u.id, FARM.lvl(u.id)])),
    clickDamage: FARM.clickDamage(),
    dps: FARM.dps(),
    autoClicks: FARM.autoClicks(),
    hpMax: FARM.hpMax(),
    boxHeld: box.length,
    sold, soldZenny, lostToFullBox,
    oreStarvedPct: Math.round((oreStarvedSeconds / SECONDS) * 100),
    zennyBlockedPct: Math.round((zennyBlocked / SECONDS) * 100),
    bothBlockedPct: Math.round((bothBlocked / SECONDS) * 100),
    // >>1 means you're sitting on far more money than the next purchase needs.
    bankRatio: bankRatioN ? Math.round(bankRatioSum / bankRatioN) : 0,
    times, firstBuy, levelAt, variantKills, oreGained,
    charmsRolled, gods, firstGod,
    // Pacing: how often a purchase actually lands, and the worst dry spell.
    buys: buyTimes.length,
    gaps: (() => {
      const g = [];
      for (let i = 1; i < buyTimes.length; i++) g.push(buyTimes[i] - buyTimes[i - 1]);
      if (!g.length) return { median: null, worst: null, lastHourBuys: 0 };
      const sorted = [...g].sort((a, b) => a - b);
      return {
        median: sorted[Math.floor(sorted.length / 2)],
        worst: sorted[sorted.length - 1],
        lastHourBuys: buyTimes.filter(x => x > SECONDS - 3600).length,
      };
    })(),
  };
}

const fmt = s => {
  if (s === undefined) return "never";
  if (s < 90) return `${s}s`;
  if (s < 5400) return `${(s / 60).toFixed(1)}m`;
  return `${(s / 3600).toFixed(1)}h`;
};

console.log(`\nMHGU Charm Farm — ${HOURS}h simulation, real farm.js economics\n`);

for (const p of PROFILES) {
  const r = runProfile(p, 12345);
  console.log(`── ${r.profile} ${"─".repeat(Math.max(0, 46 - r.profile.length))}`);
  console.log(`   ${r.kills.toLocaleString()} hunts · ${r.rank} · ${r.zenny.toLocaleString()}z banked · monster HP now ${r.hpMax.toLocaleString()}`);
  console.log(`   click ${r.clickDamage} · palico ${r.dps}/s · hunters ${r.autoClicks}/s`);
  console.log(`   sold ${r.sold.toLocaleString()} charms for ${r.soldZenny.toLocaleString()}z` +
    (r.lostToFullBox ? ` · lost ${r.lostToFullBox} to a full box` : ""));
  console.log(`   blocked by: ore ${r.oreStarvedPct}% · zenny ${r.zennyBlockedPct}% · both ${r.bothBlockedPct}%` +
    `  ·  bank is ${r.bankRatio}x the next thing you can't afford`);
  console.log(`   milestones: ` + WATCH.map(w => `${w.label} ${fmt(r.times[w.key])}`).join(" · "));
  console.log(`   upgrades:`);
  for (const u of FARM.UPGRADES) {
    const lv = r.levels[u.id];
    const la = r.levelAt[u.id] || {};
    console.log(`     ${u.name.padEnd(19)} Lv ${String(lv).padStart(3)}  ` +
      `first ${fmt(r.firstBuy[u.id]).padStart(6)}  ` +
      `Lv5 ${fmt(la[5]).padStart(6)}  Lv10 ${fmt(la[10]).padStart(6)}  Lv25 ${fmt(la[25]).padStart(6)}`);
  }
  console.log(`   god charms: ${r.gods} in ${r.charmsRolled.toLocaleString()} drops` +
    (r.gods ? ` · first at ${fmt(r.firstGod)}` : ` · none yet`) +
    ` · 1 in ${r.gods ? Math.round(r.charmsRolled / r.gods).toLocaleString() : '—'}`);
  console.log(`   pacing: ${r.buys} purchases · median gap ${fmt(r.gaps.median)} · worst dry spell ${fmt(r.gaps.worst)} · ${r.gaps.lastHourBuys} in the final hour`);
  console.log(`   ore mined (by unlock rank):`);
  for (const rank of [0, 1, 2]) {
    const line = FARM.ORES.filter(o => o.rank === rank)
      .map(o => `${o.name} ${(r.oreGained[o.id] || 0).toLocaleString()}`).join(" · ");
    console.log(`     ${["Low", "High", "G"][rank]}: ${line}`);
  }
  const totalKills = Object.values(r.variantKills).reduce((a, b) => a + b, 0) || 1;
  console.log(`   variant share: ` + FARM.VARIANTS
    .map(v => `${v.name.replace(" Brachydios", "")} ${((r.variantKills[v.id] || 0) / totalKills * 100).toFixed(1)}%`)
    .join(" · "));
  console.log("");
}
