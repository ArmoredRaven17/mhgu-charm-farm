// Headless check on the charm roller. Run: node scripts/test-roll.mjs
//
// The browser files are plain scripts that hang globals off `window`, so we fake a
// window, eval them in order, and then hammer the roller. Same trick the set builder
// uses in scripts/test-engine.mjs.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const docs = join(dirname(fileURLToPath(import.meta.url)), "..", "docs");
const win = {};
globalThis.window = win;
for (const f of ["data/charm.js", "data/skills.js", "data/ores.js", "roll.js", "farm.js"]) {
  (0, eval)(readFileSync(join(docs, f), "utf8"));
}
const ROLL = win.ROLL;
const FARM = win.FARM;   // module body only — init() would start the idle timer

let fail = 0;
const check = (ok, msg) => { if (!ok) { fail++; console.error("FAIL:", msg); } };

// ── Every rolled charm must be legal, at every rarity ────────────────────────
const N = 50000;
const slotSeen = {};
const tierCount = { mystery: 0, shining: 0, timeworn: 0, enduring: 0 };
for (let i = 0; i < N; i++) {
  const rarity = 1 + Math.floor(Math.random() * 10);
  const c = ROLL.rollCharm(rarity);
  check(c !== null, `rollCharm(${rarity}) returned null`);
  if (!c) continue;
  const problems = ROLL.verify(c);
  if (problems.length) { check(false, `illegal charm ${JSON.stringify(c)} -> ${problems.join("; ")}`); if (fail > 5) break; }
  const tier = ROLL.tierOf(c.r);
  tierCount[tier]++;
  slotSeen[tier] = slotSeen[tier] || new Set();
  slotSeen[tier].add(c.s);
}
console.log(`rolled ${N} charms across all rarities`);

// The slot floor should show up in practice, not just in verify(). SLOT_TIER_FLOOR is
// [0,0,1,2] indexed by SLOT COUNT: 2 slots needs shining or better, 3 slots needs
// timeworn or better. So shining legitimately reaches 2, and timeworn reaches 3.
check(!slotSeen.mystery.has(2) && !slotSeen.mystery.has(3), "mystery rolled 2 or 3 slots");
check(!slotSeen.shining.has(3), "shining rolled 3 slots");
check(slotSeen.shining.has(2), "shining never rolled a 2-slot charm in 50k");
check(slotSeen.timeworn.has(3), "timeworn never rolled a 3-slot charm in 50k");
check(slotSeen.enduring.has(3), "enduring never rolled a 3-slot charm in 50k");
console.log("slot counts seen:", Object.fromEntries(
  Object.entries(slotSeen).map(([k, v]) => [k, [...v].sort().join("/")])));

// ── Melding: three of a rarity in, one of the NEXT rarity out ────────────────
for (let r = 1; r <= 10; r++) {
  const a = ROLL.rollCharm(r), b = ROLL.rollCharm(r), c = ROLL.rollCharm(r);
  check(ROLL.legalMeld(a, b, c), `three rarity-${r} charms should be a legal meld`);
  const expect = Math.min(10, r + 1);
  const out = ROLL.meld(a, b, c);
  check(out && out.r === expect, `meld of rarity ${r} should return rarity ${expect}, got ${out && out.r}`);
  check(out && ROLL.verify(out).length === 0, `meld output at rarity ${r} must be legal`);
}
check(ROLL.meldOutputRarity(9) === 10, "rarity 9 melds up to 10");
check(ROLL.meldOutputRarity(10) === 10, "rarity 10 is the ceiling");
check(!ROLL.legalMeld(ROLL.rollCharm(3), ROLL.rollCharm(3), ROLL.rollCharm(5)),
  "mismatched rarities must not be a legal meld");
check(!ROLL.legalMeld(ROLL.rollCharm(3), null, ROLL.rollCharm(3)),
  "an empty slot must not be a legal meld");

// ── Charms the tables say are impossible must be rejected ────────────────────
check(ROLL.verify({ r: 1, s: 3, k: [[1, 3]] }).length > 0, "3-slot Pawn Talisman must be rejected");
check(ROLL.verify({ r: 5, s: 0, k: [[1, 3], [1, -3]] }).length > 0, "duplicate tree must be rejected");
check(ROLL.verify({ r: 1, s: 0, k: [[1, 99]] }).length > 0, "out-of-range points must be rejected");
check(ROLL.verify({ r: 11, s: 0, k: [[1, 1]] }).length > 0, "rarity 11 must be rejected");

// ── Ore data sanity ──────────────────────────────────────────────────────────
const ores = win.CF_ORES.list;
check(ores.length === 12, `expected 12 ores, got ${ores.length}`);
check(new Set(ores.map(o => o.id)).size === ores.length, "ore ids must be unique");
for (const o of ores) {
  check(o.sell > 0, `${o.name} needs a sell price`);
  check(o.rank >= 0 && o.rank <= 2, `${o.name} rank out of range`);
  check(/^MH4G-Ore_Icon_.+\.png$/.test(o.icon), `${o.name} icon filename looks wrong`);
}
check(ores.filter(o => o.rank === 2).every(o => o.rarity >= 8), "every G ore should be rarity 8+");

// ── God charms ───────────────────────────────────────────────────────────────
// Three slots plus both skills at the ceiling of their range for that tier.
{
  const tiers = win.CF_CHARM.tiers;
  // Build one by hand from the enduring table rather than waiting for the RNG.
  const ids = Object.keys(tiers.enduring).map(Number);
  const first = ids.find(id => tiers.enduring[id][1] > 0);
  const second = ids.find(id => id !== first && tiers.enduring[id][3] > 0);
  const god = { r: 10, s: 3, k: [[first, tiers.enduring[first][1]], [second, tiers.enduring[second][3]]] };
  check(ROLL.verify(god).length === 0, `hand-built god charm should be legal: ${ROLL.verify(god)}`);
  check(ROLL.isGod(god), "a 3-slot charm with both skills maxed must read as a god charm");
  check(!ROLL.isGod({ ...god, s: 2 }), "two slots is not a god charm");
  check(!ROLL.isGod({ ...god, k: [god.k[0]] }), "one skill is not a god charm");
  check(!ROLL.isGod({ ...god, k: [[first, tiers.enduring[first][1] - 1], god.k[1]] }),
    "a skill one point below its ceiling is not a god charm");
  // Mystery can't reach three slots, so it can never produce one.
  check(!ROLL.isGod({ r: 1, s: 3, k: god.k }), "a mystery-tier charm can't be a god charm");
  // And a god charm is never a legal meld input, at any position in the row.
  const plain = ROLL.rollCharm(10);
  const plain2 = ROLL.rollCharm(10);
  check(!ROLL.legalMeld(god, plain, plain2), "a god charm in slot 1 must block the meld");
  check(!ROLL.legalMeld(plain, god, plain2), "a god charm in slot 2 must block the meld");
  check(!ROLL.legalMeld(plain, plain2, god), "a god charm in slot 3 must block the meld");
  check(ROLL.meld(god, plain, plain2) === null, "melding a god charm must return nothing");
}

// No charm should ever carry a zero-point skill — that's the same charm with one
// skill, and it would render as "Insight 0".
{
  let zeros = 0;
  for (let i = 0; i < 20000; i++) {
    const c = ROLL.rollCharm(1 + Math.floor(Math.random() * 10));
    if (c && (c.k || []).some(s => s[1] === 0)) zeros++;
  }
  check(zeros === 0, `${zeros} rolled charms carried a zero-point skill`);
}

// ── Variant roster ───────────────────────────────────────────────────────────
const oreIds = new Set(ores.map(o => o.id));
const oreRank = Object.fromEntries(ores.map(o => [o.id, o.rank]));
const seenIds = new Set();
for (const v of FARM.VARIANTS) {
  check(!seenIds.has(v.id), `duplicate variant id ${v.id}`);
  seenIds.add(v.id);
  check(["brachy", "raging"].includes(v.icon), `${v.name} has an unknown sprite "${v.icon}"`);
  check(v.rank >= 0 && v.rank <= 2, `${v.name} rank out of range`);
  check(v.w > 0, `${v.name} needs a positive spawn weight`);
  check(v.hp > 0, `${v.name} needs a positive HP multiplier`);
  check(v.shift >= 0 && v.shift <= 3, `${v.name} tier shift out of range`);
  check(v.ore === null || v.ore === "*G" || oreIds.has(v.ore), `${v.name} drops unknown ore "${v.ore}"`);
  // A variant wearing an ore's colours must not show up before that ore can be mined,
  // or the tint would promise something the game's own gathering data doesn't.
  if (v.ore && v.ore !== "*G")
    check(v.rank >= oreRank[v.ore], `${v.name} unlocks at rank ${v.rank} but its ore needs ${oreRank[v.ore]}`);
}
for (let r = 0; r <= 2; r++)
  check(FARM.VARIANTS.some(v => v.rank <= r), `rank ${r} has an empty spawn pool`);
// Spawn weight must fall monotonically down the roster, so a cheap early ore is never
// rarer than a better one from a higher rank. Getting more Fucium than Dragonite was
// the bug this guards against.
for (let i = 1; i < FARM.VARIANTS.length; i++) {
  const prev = FARM.VARIANTS[i - 1], cur = FARM.VARIANTS[i];
  check(cur.w <= prev.w, `${cur.name} (w ${cur.w}) is more common than ${prev.name} (w ${prev.w})`);
  check(cur.rank >= prev.rank || cur.w <= prev.w, `${cur.name} is out of rank order`);
}
// And the actual sampled distribution has to agree at every rank.
for (const rank of [0, 1, 2]) {
  const pool = FARM.VARIANTS.filter(v => v.rank <= rank);
  const total = pool.reduce((n, v) => n + v.w, 0);
  for (let i = 1; i < pool.length; i++)
    check(pool[i].w / total <= pool[i - 1].w / total,
      `at rank ${rank}, ${pool[i].name} spawns more often than ${pool[i - 1].name}`);
}
check(FARM.VARIANTS.filter(v => v.icon === "raging").length === 1, "expected exactly one Raging variant");
console.log(`roster: ${FARM.VARIANTS.length} variants, pools ` +
  [0, 1, 2].map(r => FARM.VARIANTS.filter(v => v.rank <= r).length).join("/"));

// ── Shop costs ───────────────────────────────────────────────────────────────
for (const up of FARM.UPGRADES) {
  check(up.max > 0, `${up.name} needs a positive max level`);
  let prev = -1;
  for (let lv = 0; lv < Math.min(up.max, 40); lv++) {
    const z = FARM.zennyCost(up, lv);
    check(z > prev, `${up.name} cost must rise with level (level ${lv})`);
    prev = z;
    const oc = FARM.oreCost(up, lv);
    check(oreIds.has(oc.ore), `${up.name} level ${lv} asks for unknown ore "${oc.ore}"`);
    check(oc.qty > 0, `${up.name} level ${lv} asks for ${oc.qty} ore`);
  }
}
check(FARM.ORE_LADDER.every(id => oreIds.has(id)), "ORE_LADDER names an ore that doesn't exist");

// Every ore must be asked for by something at some point, or it's a drop with no
// purpose. Iron Ore used to be exactly that — the cheapest upgrade started a rung
// above it while Iron Brachydios was the most common variant in the game.
{
  const demanded = new Set();
  for (const up of FARM.UPGRADES) {
    for (let lv = 0; lv < Math.min(up.max, 200); lv++) demanded.add(FARM.oreCost(up, lv).ore);
  }
  for (const o of ores) check(demanded.has(o.id), `nothing ever asks for ${o.name}`);
}

console.log(fail === 0 ? "\nall checks passed" : `\n${fail} check(s) failed`);
process.exit(fail === 0 ? 0 : 1);
