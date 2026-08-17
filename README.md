# MHGU Charm Farm

An unofficial fan toy for **Monster Hunter Generations Ultimate**: beat charms out of a
Brachydios, then feed three of a rarity into the Melding Pot for one fresh roll of that
rarity.

**Live:** https://armoredraven17.github.io/mhgu-charm-farm/

The charms are real. Every skill and point value is rolled against the game's own four charm
tables (Mystery / Shining / Timeworn / Enduring), including the rule that two-slot charms never
come from a Mystery roll and three-slot charms never from Mystery or Shining. Nothing it
produces is something MHGU couldn't hand you.

## The loop

- **Hunt.** Click the Brachydios. It drops charms, ore and zenny, then respawns tougher.
- **Variants.** Every Brachydios below the Raging one is the same sprite wearing an ore's
  colours — Machalite Brachydios, Fucium Brachydios, and so on. Which ones can appear depends
  on your rank, matching the ranks that ore can actually be mined at in the game. A rarer coat
  means more HP, a bigger payout, and better charm tiers.
- **Smithy.** Upgrades cost zenny *and* ore, so the tint you're hunting is the tint you need.
- **Meld.** Three charms of the **same rarity** in, one new charm of that rarity out.

## Development

Static site, no build step, no dependencies. Serve `docs/` with anything:

```bash
python -m http.server 8132 --directory docs
```

Check the roller and the tuning tables:

```bash
node scripts/test-roll.mjs
```

`docs/data/` is generated data, not hand-maintained by this repo:

| File | Contents | Source |
|---|---|---|
| `charm.js` | Four charm roll tables | `mhgu-set-builder`, from `mhgu-editor`'s `talisman_charm_table.json` |
| `skills.js` | Skill tree id → name | `mhgu-set-builder` |
| `ores.js` | Ore names, rarity, sell price, icon colour, mining rank | community MHGU database (`mhgu.db`) |

`docs/roll.js` is the only file that decides what a charm may be; `docs/farm.js` holds the
game design (variant roster, spawn weights, HP curve, shop costs) and is deliberately kept
apart from the transcribed game facts in `docs/data/`.

Changed a file under `docs/`? Bump its `?v=N` in `docs/index.html` — GitHub Pages caches by
full URL, so without it nobody sees the update.

See [NOTICE.md](NOTICE.md) for data and icon attributions.
