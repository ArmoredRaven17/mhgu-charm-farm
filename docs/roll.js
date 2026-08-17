// Charm rolling — pure, no DOM, no globals beyond window.ROLL.
//
// A charm is { r: rarity 1-10, s: slots 0-3, k: [[treeId, pts], [treeId, pts]?] }.
// That is the same entry shape the Set Builder and the Equipment Box already use, so
// a charm rolled here would drop straight into either of them if we ever add export.
window.ROLL = (function () {
  "use strict";

  const CHARM = window.CF_CHARM;
  const SKILLS = window.CF_SKILLS;

  // Lifted verbatim from mhgu-set-builder/docs/engine.js — do not re-derive these.
  // A talisman's equip id IS its rarity (1-10); each maps to one of four roll tiers
  // whose table bounds the legal skills and points.
  const TAL_TIER = [null, "mystery", "mystery", "shining", "shining",
    "timeworn", "timeworn", "timeworn", "enduring", "enduring", "enduring"];
  const TIER_ORDER = ["mystery", "shining", "timeworn", "enduring"];
  // How many slots a talisman has restricts which tier can have rolled it: two slots
  // never come from a mystery roll, three never from mystery or shining. Athena's
  // CharmDatabase::CharmIsLegal states it as start[4] = {0,0,1,2} over the same four
  // tiers. The roll tables carry point ranges only, so without this a 3-slot Pawn
  // Talisman would look perfectly legal.
  const SLOT_TIER_FLOOR = [0, 0, 1, 2];

  // Rarities that belong to each tier, so a tier roll can pick a concrete talisman.
  const TIER_RARITIES = { mystery: [1, 2], shining: [3, 4], timeworn: [5, 6, 7], enduring: [8, 9, 10] };

  // Slot-count weights. Three slots stay genuinely rare even on enduring rolls —
  // a 3-slot charm should feel like a find, not a Tuesday.
  //
  // This is the dominant lever on god-charm rarity, and it is invented: nothing in
  // the game data says how often each slot count appears, only which tiers may reach
  // them. Measured over 2.5M rolls at G-rank drop weights, the last figure moves the
  // god-charm rate roughly like this — call it +/-10%, since a run only turns up
  // 70-170 of them:
  //     3 -> 1 in ~32,000 (~13h active)      6 -> 1 in ~20,000 (~8.5h active)
  //     5 -> 1 in ~28,000 (~12h active)      8 -> 1 in ~14,000 (~6h active)
  const SLOT_WEIGHTS = [55, 30, 12, 6];

  const ri = n => Math.floor(Math.random() * n);
  const between = (lo, hi) => lo + ri(hi - lo + 1);

  function pickWeighted(pairs) {
    let total = 0;
    for (const p of pairs) total += p[1];
    if (total <= 0) return null;
    let n = Math.random() * total;
    for (const p of pairs) { n -= p[1]; if (n < 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  }

  const tierOf = rarity => TAL_TIER[rarity] || null;
  const tierIndex = rarity => TIER_ORDER.indexOf(tierOf(rarity));

  // Trees this tier can roll in a given slot, as [treeId, [min,max]] pairs. A row is
  // [s1min, s1max, s2min, s2max]; an all-zero half means "can't appear in that slot".
  //
  // Memoised: the tables never change, and this used to walk ~200 entries and build a
  // fresh array on every single charm roll. That's twice per drop, and a late-game
  // hunter kills several monsters a second.
  const treeCache = {};
  function legalTrees(tier, slot) {
    const key = tier + ":" + slot;
    if (treeCache[key]) return treeCache[key];
    const table = CHARM.tiers[tier];
    const out = [];
    if (table) {
      for (const id in table) {
        const row = table[id];
        const lo = slot === 1 ? row[0] : row[2];
        const hi = slot === 1 ? row[1] : row[3];
        if (lo === 0 && hi === 0) continue;
        out.push([Number(id), [lo, hi]]);
      }
    }
    treeCache[key] = out;
    return out;
  }

  // Slot count legal for this rarity's tier, honouring SLOT_TIER_FLOOR.
  function rollSlots(rarity) {
    const ti = tierIndex(rarity);
    const pairs = [];
    for (let s = 0; s <= 3; s++) if (ti >= SLOT_TIER_FLOOR[s]) pairs.push([s, SLOT_WEIGHTS[s]]);
    const s = pickWeighted(pairs);
    return s === null ? 0 : s;
  }

  // Roll one charm of a given rarity. Always produces a legal charm — verify() below
  // is the assertion that says so, and the headless test hammers it.
  function rollCharm(rarity) {
    const tier = tierOf(rarity);
    if (!tier) return null;

    const first = legalTrees(tier, 1);
    if (!first.length) return null;
    const [t1, r1] = first[ri(first.length)];
    const k = [[t1, between(r1[0], r1[1])]];

    // Roughly half of charms carry a second skill. It must be a different tree — the
    // game never rolls the same tree twice on one charm. Negative points are kept:
    // a big first skill paired with a painful second is the shape of a real charm.
    if (Math.random() < 0.5) {
      const second = legalTrees(tier, 2).filter(e => e[0] !== t1);
      if (second.length) {
        const [t2, r2] = second[ri(second.length)];
        const pts = between(r2[0], r2[1]);
        // Most second-skill ranges straddle zero, so a roll of exactly 0 is common.
        // A charm with a 0-point skill is the same charm as one with no second skill
        // at all — the game would just show one skill — so drop it rather than print
        // "Insight 0". Still legal: verify() only requires a first skill.
        if (pts !== 0) k.push([t2, pts]);
      }
    }

    return { r: rarity, s: rollSlots(rarity), k };
  }

  function rollRarity(tier) {
    const rs = TIER_RARITIES[tier];
    return rs ? rs[ri(rs.length)] : 1;
  }

  // Legality check, mirroring SBEngine.validateTalisman. Returns problem strings;
  // empty means legal. Used as a self-check and by the headless test.
  function verify(c) {
    const problems = [];
    if (!c || !Number.isInteger(c.r) || c.r < 1 || c.r > 10) return ["rarity must be 1-10"];
    const tier = tierOf(c.r);
    const table = CHARM.tiers[tier];
    if (!table) return ["no roll table for rarity " + c.r];
    if (!Number.isInteger(c.s) || c.s < 0 || c.s > 3) problems.push("slots must be 0-3");
    else if (tierIndex(c.r) < SLOT_TIER_FLOOR[c.s])
      problems.push(`${c.s}-slot charm can't roll from the ${tier} tier`);

    const k = c.k || [];
    if (k.length < 1) problems.push("a charm always has a first skill");
    if (k.length > 2) problems.push("a charm has at most two skills");
    if (k[0]) {
      const row = table[k[0][0]];
      if (!row || (row[0] === 0 && row[1] === 0)) problems.push("skill 1 tree illegal on this tier");
      else if (k[0][1] < row[0] || k[0][1] > row[1]) problems.push("skill 1 points out of range");
    }
    if (k[1]) {
      if (k[0] && k[1][0] === k[0][0]) problems.push("the two skills must differ");
      const row = table[k[1][0]];
      if (!row || (row[2] === 0 && row[3] === 0)) problems.push("skill 2 tree illegal on this tier");
      else if (k[1][1] < row[2] || k[1][1] > row[3]) problems.push("skill 2 points out of range");
    }
    return problems;
  }

  // A god charm: a Creator Talisman with three slots and both skills rolled at the
  // very top of their range. As good as the tables allow a charm to be — the thing
  // you farm for and never see.
  //
  // Rarity 10 specifically, not merely "any rarity that can reach three slots".
  // Rarities 8, 9 and 10 all roll off the same enduring table, so a maxed 3-slot
  // rarity 9 has identical stats to a rarity 10 and still won't count — the title is
  // reserved for the endgame talisman, because that's the only one anyone keeps.
  const GOD_RARITY = 10;
  function isGod(c) {
    if (!c || c.r !== GOD_RARITY || c.s !== 3) return false;
    const k = c.k || [];
    if (k.length !== 2) return false;
    const table = CHARM.tiers[tierOf(c.r)];
    if (!table) return false;
    const r1 = table[k[0][0]], r2 = table[k[1][0]];
    if (!r1 || !r2) return false;
    // Slot 1's ceiling is row[1]; slot 2's is row[3].
    return k[0][1] === r1[1] && k[1][1] === r2[3];
  }

  // ── Presentation and worth ───────────────────────────────────────────────────
  const treeName = id => (SKILLS.trees && SKILLS.trees[id]) || `tree ${id}`;
  const charmName = rarity => (CHARM.names && CHARM.names[rarity]) || `Talisman ${rarity}`;

  // Zenny appraisal. Rarity dominates, slots are worth real money, and only the net
  // positive skill points count — a charm whose second skill is -10 is worth less.
  //
  // These coefficients were quartered after simulation: at the old rate a two-hour
  // run sold ~11,500 charms for ~21 million zenny, which drowned every price in the
  // shop and left money meaningless while ore did all the gating. A charm should be
  // worth picking up, not fund the whole farm.
  function charmValue(c) {
    if (!c) return 0;
    let net = 0;
    for (const s of c.k || []) net += s[1];
    return Math.max(1, Math.round(c.r * c.r * 8 + c.s * 120 + Math.max(0, net) * 20));
  }

  // The pot takes three charms of the SAME rarity and returns one a rarity HIGHER.
  // That makes it a ladder rather than a reroll: three rarity 1s become a rarity 2,
  // and so on up. Rarity 10 is the ceiling, so three 10s return a 10 — still worth
  // doing, since it's a fresh roll on the best table.
  const meldOutputRarity = r => Math.min(10, r + 1);

  // A god charm is never a valid input. It's the best thing the tables can produce,
  // and feeding one to the pot could only ever be a mistake.
  function legalMeld(a, b, c) {
    if (!a || !b || !c) return false;
    if (isGod(a) || isGod(b) || isGod(c)) return false;
    return a.r === b.r && b.r === c.r;
  }
  function meld(a, b, c) {
    return legalMeld(a, b, c) ? rollCharm(meldOutputRarity(a.r)) : null;
  }
  // What a row costs to meld — scaled off what you're feeding it.
  const meldFee = rarity => 200 + rarity * rarity * 40;

  return {
    TAL_TIER, TIER_ORDER, SLOT_TIER_FLOOR, TIER_RARITIES,
    tierOf, tierIndex, rollCharm, rollRarity, rollSlots, legalTrees, verify, isGod,
    treeName, charmName, charmValue, legalMeld, meld, meldFee, meldOutputRarity,
    pickWeighted,
  };
})();
