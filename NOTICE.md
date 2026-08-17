# Notices and Attributions

This project bundles game data and icons derived from third-party sources.
The original source code of this project is MIT-licensed (see
[LICENSE](LICENSE)). The following third-party materials retain their own
licenses and require attribution.

---

## Game IP

**Monster Hunter Generations Ultimate** and all related characters, item
names, monster names, and other in-game assets are trademarks and © Capcom
Co., Ltd. This project is an **unofficial fan-made charm farming toy**. It is
not affiliated with, endorsed by, or sponsored by Capcom.

---

## Game Data

### Charm roll tables

The four charm tables in [docs/data/charm.js](docs/data/charm.js) — Mystery,
Shining, Timeworn and Enduring, each mapping a skill tree to its legal point
ranges per slot — are copied from the sibling
[MHGU Set Builder](https://github.com/ArmoredRaven17/mhgu-set-builder)
project, which generates them from the save editor's
`talisman_charm_table.json`. They were cross-checked against Kiranico's
published *Charm Skill Tables* page. Only the numeric ranges are re-emitted,
in this project's own schema; no game files, extracted archives, or
decryption keys are redistributed here.

The slot-legality rule the roller enforces (two slots never roll from the
Mystery tier, three never from Mystery or Shining) matches the statement in
Athena's Armor Set Search `CharmDatabase::CharmIsLegal`.

### Ore names, rarities, sell prices and mining ranks

The ore data in [docs/data/ores.js](docs/data/ores.js) is transcribed from the
community MHGU database (`mhgu.db`) — item names, rarity, sell price and the
`icon_color` value that gives each ore its colour, plus the `gathering` table's
per-rank mining nodes, which determine at which rank each ore's Brachydios
variant can appear.

### Kiranico (https://mhgu.kiranico.com/)

Charm tables and item data originate from Kiranico's MHGU database. Kiranico
does not publish a formal data license; this attribution is offered as
courtesy acknowledgment of their fan-database work. If the maintainers of
Kiranico object to this use, please open an issue and the affected data will
be reviewed or removed.

### English naming — gatheringhallstudios / JoeLago

The **English item and skill names used throughout this project** derive from
the MHGU database (`mhgu.db`) bundled in
[JoeLago/MHGUDB-iOS](https://github.com/JoeLago/MHGUDB-iOS) (MIT-licensed),
which in turn is built on the community database from
[gatheringhallstudios/MHGenDatabase](https://github.com/gatheringhallstudios/MHGenDatabase).

The game's own data tables store names in Japanese only, so every English
name shown here rests on that community work.

Only the factual naming data is re-emitted in this project's own schema; no
source code, schema, or image assets from those projects are redistributed.

---

## Icons

### Monster Hunter Wiki (monsterhunterwiki.org) — talisman icons

The talisman icons under [docs/assets/icons/](docs/assets/icons/)
(`icon_talisman.png` plus the `_r1`–`_r10` and `_rX` rarity-coloured variants)
are sourced from
[Category:MHGU Equipment Icons](https://monsterhunterwiki.org/wiki/Category:MHGU_Equipment_Icons)
on the independent Monster Hunter Wiki, by way of the sibling MHGU Equipment
Box project, then put through an AI-upscale/tint pipeline.

**monsterhunterwiki.org content is licensed under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).** By the
share-alike clause, the upscaled and tint-derived variants bundled here are
shared under the same licence.

### Monster Hunter Wiki (Fandom) — monster and ore icons

The monster icons under [docs/assets/MonsterIcons/](docs/assets/MonsterIcons/)
(the theme colour picker, plus the Brachydios and Raging Brachydios portraits)
and the ore icons under [docs/assets/OreIcons/](docs/assets/OreIcons/) come
from the Fandom community wiki, https://monsterhunter.fandom.com/, by way of
the sibling MHGU Collection Tracker and save editor projects.

**Fandom community content is licensed under
[CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/);** any
adaptations are shared under the same licence.

**The ore-coloured Brachydios variants are adaptations.** Each is the base
Brachydios icon under a CSS `filter` that rotates its colours toward the
matching ore's own icon colour — no separate artwork exists for them. As
adaptations of CC BY-SA 3.0 material they are shared under the same licence.
Underlying Capcom game sprites remain Capcom property regardless of which
community wiki redistributes them.

Note that the ore icon files carry a `.png` extension but are actually WebP
data, exactly as they were received from the upstream icon set. They are
bundled unchanged rather than re-encoded.

---

## Fonts and textures

The MHFU display font under [docs/fonts/](docs/fonts/) is a fan-made
recreation of the Monster Hunter interface typeface, carried over from the
MHGU Quest Randomizer project by way of the MHGU Collection Tracker.

The menu background textures in [docs/assets/](docs/assets/) are edited from
the developer's own in-game screenshots, also carried over from the
Collection Tracker.

---

## Development — AI assistance

A large share of this project's source code and its documentation was written
with **[Claude Code](https://claude.com/claude-code)** (Anthropic), directed
and reviewed by the author. Commits made that way carry a
`Co-Authored-By: Claude` trailer.

This is disclosed for transparency rather than to satisfy a licence term. The
project's code remains MIT-licensed (see [LICENSE](LICENSE)).

A separate and unrelated use of AI applies to the **talisman icons**: the
Real-ESRGAN upscale described under *Icons*, inherited from that upstream icon
pipeline rather than performed here.

---

## Reporting Misattribution

If a person, project, or organization is misattributed or omitted from this
notice, please open an issue on the project repository and the file will be
updated.
