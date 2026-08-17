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
  const SLOT_WEIGHTS = [55, 30, 12, 3];

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
  function legalTrees(tier, slot) {
    const table = CHARM.tiers[tier];
    const out = [];
    if (!table) return out;
    for (const id in table) {
      const row = table[id];
      const lo = slot === 1 ? row[0] : row[2];
      const hi = slot === 1 ? row[1] : row[3];
      if (lo === 0 && hi === 0) continue;
      out.push([Number(id), [lo, hi]]);
    }
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
        k.push([t2, between(r2[0], r2[1])]);
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

  // ── Presentation and worth ───────────────────────────────────────────────────
  const treeName = id => (SKILLS.trees && SKILLS.trees[id]) || `tree ${id}`;
  const charmName = rarity => (CHARM.names && CHARM.names[rarity]) || `Talisman ${rarity}`;

  // Zenny appraisal. Rarity dominates, slots are worth real money, and only the net
  // positive skill points count — a charm whose second skill is -10 is worth less.
  function charmValue(c) {
    if (!c) return 0;
    let net = 0;
    for (const s of c.k || []) net += s[1];
    return Math.max(1, Math.round(c.r * c.r * 30 + c.s * 400 + Math.max(0, net) * 60));
  }

  // The pot takes three charms of the SAME rarity and returns one of that rarity.
  function legalMeld(a, b, c) {
    if (!a || !b || !c) return false;
    return a.r === b.r && b.r === c.r;
  }
  function meld(a, b, c) {
    return legalMeld(a, b, c) ? rollCharm(a.r) : null;
  }
  // What a row costs to meld — scaled off what you're feeding it.
  const meldFee = rarity => 200 + rarity * rarity * 40;

  return {
    TAL_TIER, TIER_ORDER, SLOT_TIER_FLOOR, TIER_RARITIES,
    tierOf, tierIndex, rollCharm, rollRarity, rollSlots, legalTrees, verify,
    treeName, charmName, charmValue, legalMeld, meld, meldFee, pickWeighted,
  };
})();
