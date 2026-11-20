# The Build Lab

An NBA 2K27 MyPLAYER build planner: hand-tune builds, or let the badge-first optimizer find builds for the badges
and playstyle you want. Everything runs in your browser; your builds and searches are saved in
the browser's local storage and never leave your machine.

Not affiliated with, endorsed by or sponsored by 2K, Take-Two Interactive or the NBA.

## Run

Node 22.12+ (26 recommended) and pnpm.

    pnpm install
    pnpm dev          # http://localhost:5173
    pnpm test         # rules, optimizer and regression tests
    pnpm build        # production bundle in dist/

In IntelliJ IDEA, open the folder and run the `dev` / `test` scripts from package.json. IDE settings (`.idea/`)
are machine-specific and not committed.

## How the optimizer thinks

Most of a good build's Overall budget should sit exactly on badge breakpoints: a rating one point above the last
tier it unlocks buys nothing. The Lab optimizes **badge-first**:

1. **Musts** — badge tiers every result must reach (bodies that can't are skipped).
2. **Badge value** — every other badge has an importance (Don't care → Core) and an optional "up to" tier cap;
   badges left on Auto are weighted by a meta tier list (`src/meta.js`, a documented judgement call).
3. **Feel attributes** — ratings worth raising for their own sake (ball handle, speed, agility by default) get
   whatever budget is left.

Cap Breakers are planned per archetype: breaker gains depend on the build's player type, so the solver can push a
build into a different archetype when that makes breakers elsewhere go further. If the plan from the build's natural
archetype doesn't fit under 99, every archetype is tried, with each breaker chosen by what it takes off the real
Overall (so it can lower a rating the leading archetype weighs heavily and let a better one take over). Every result is
filled to 99 Overall, as the game requires.

The greedy search climbs one breakpoint at a time, so it can stop at a worse arrangement than the best for the tiers it
reached. The Lab therefore **polishes its leaders** (iterated local search): each is re-planned with every worthwhile
tier it holds kept, as its own and the likeliest other archetypes (what the Builder's Re-optimize does), and solved
**exactly** within a few points of itself. The exact planner (`src/mip.js`) treats a build as a multiple-choice knapsack:
each attribute picks a base rating plus a breaker count. Overall ≤ 99 is one linear limit per archetype (a weighted
average: Σ w·s(r)·(r − T) ≤ 0). Badge tiers are AND/OR rules on final ratings and linked minimums are linear rules. It's
solved with [HiGHS](https://highs.dev) (MIT, WebAssembly) in the Lab's workers; if it can't load, the Lab runs without it.
Whichever version scores best on picks + meta is kept.

Speed: the breaker planner learns, per body, which archetypes actually win and only re-tries those (with a full sweep
every few calls), Overall is updated incrementally, and linked minimums re-propagate only from the rating that changed.
A body's first optimization takes about 1–2 s.

## Features

- **Lab** (badge-first optimizer), two tabs:
  - **Build Search**: role presets for a quick start, or every rule by hand (below).
  - **Breaker Search**: pick the ratings Cap Breakers should carry and find the archetype where each breaker adds the most.
  - Role presets (inside big, stretch big, lockdown, generalist wing, slasher, scorer, playmaker, point guard).
  - Mode (5v5 / 3v3 / both) and meta strength.
  - Positions, a height range and Cap Breakers (how many you have now, and "Optimize for future potential": plan for 4 more than you have, playable now, with what the extra adds) plus a specialization.
  - Per-badge musts, importance and tier caps; contact dunk and alley-oop unlocks as goals.
  - Per-attribute feel, minimums and maximums, with what each must-have badge locks shown on its ratings.
  - Results show badges, meta score and breakers. Variations (faster, more playmaking, better defense, no
    dunking…) keep results from all being the same build.
  - Nothing fits with your Cap Breakers? It shows the builds with the fewest extra that make it work, with a button
    to use that many.
  - "What's blocking it" explains searches with no results. Searches can be saved.
  - Click a rating on a result card to open its Cap Breaker chart; click a step to try it.
- **My Meta** — teach the Lab your own meta by answering questions about trades. Each question shows a few legal
  versions of one build that differ only in the trade: "more Pass Accuracy — which area pays for it?" (each version pays
  from one area; every other rating is pinned) or "how would you split the points between Close Shot and Pass Accuracy?"
  (every other rating locked; versions are points on the best trade-off curve). Questions are planned exactly in a
  worker from the positions and heights you use (`src/questions.js`, about 10–20 s each, built ahead while you answer).
  Answers fit a Bradley-Terry model, starting from the house meta, with weights per badge tier, per badge family (all
  badges needing an attribute) and per kind of build (guard / wing / big × dunks or not), so a lesson learned on dunking
  bigs carries to other dunking bigs and only splits off post bigs when your answers there disagree. Two-build matchups
  are still there and still count. The Lab's "Rank by → My Meta" searches with it; when the kinds of build differ, the
  search runs once for dunkers and once for non-dunkers (about twice as long).
- **Builder**
  - Body controls, attribute sliders with linked minimums, body caps and the 99 Overall budget, and Cap Breaker
    ladders.
  - Locks, auto-fill, undo/redo (Ctrl+Z / Ctrl+Y).
  - **Breakpoints** panel with **Trim dead points**: lowers ratings to their last breakpoint and reinvests the
    budget in feel attributes.
  - **Within reach** badges with one-click unlock, **Maximize** badges, trade-offs and nearby bodies.
  - **Badge chart** by discipline: each unlocked badge's tier and the token cost of every tier.
  - **Takeovers**: which attribute-gated abilities this build unlocks, per slot, and how far the rest are.
  - **Animations**: every gated animation for this height's size family, with unlocked counts and search.
  - Live build name, share links, text export, full-build screenshot, save.
- **Reference**
  - **Badges**: all 53 with tier requirements, height ranges, token costs and the cheapest share of the Overall
    budget each tier needs on your body.
  - **Animations**: every animation that needs ratings, by category like the game's animation menu, with what it
    needs and where your build stands. Search, size filter, easiest or closest first.
  - **Archetypes**: every archetype at your height and how much it weighs each rating.
- **Compare** — up to four builds side by side, best-in-row highlights, badge tier matrix.
- **Saved** — library with rename, share links, JSON export/import.

## Accuracy

The rules are 2K27's builder tuning as of the August 2026 patch, checked against the in-game builder. 2K changes
tuning server-side, so values can drift after a patch.

- **Caps**: `25 + 74 × height × weight × wingspan` multipliers, rounded and clamped to 25–99.
- **Overall**: the per-archetype weighted formula; the highest-scoring archetype is the build's player type
  (`test/engine.test.js`: 256 mixed and 75 uniform rating sets).
- **Linked minimums**: per-height rules that raise a rating when a linked one goes up (`test/links.test.js`).
- **Cap Breakers** raise a rating toward its body cap but never past it; the step sizes reproduce 13,280 measured
  gains (`test/breaker-gains.test.js`). A specialization grants two specialized breakers once its base-rating
  requirements are met.
- **Badges** use the official tier requirements, height ranges and token costs.
- **Animations** use 2K27's animation glossary. Size families: smalls 5′9″–6′4″, swings 6′5″–6′9″, bigs 6′10″–7′4″.
- **Takeovers** use the public 2K27 requirements. Ball Heist's slot (defense) is inferred.
- Build names use BASELINE's public naming catalog and are labelled as predictions; names after Cap Breakers can
  differ from the game's.

Open question: whether a linked minimum that would exceed a cap is clamped before or after it cascades.

## Layout

- `src/engine.js` — caps, links, Overall, breaker ladders, badge tiers (game rules only).
- `src/derive.js` — everything the UI shows about one build, computed in one place.
- `src/solver.js`, `src/mip.js`, `src/breakpoints.js`, `src/tune.js` — optimizer, exact planner, breakpoint logic,
  local tuning.
- `src/meta.js`, `src/roles.js`, `src/variants.js`, `src/animations.js` — Lab presets and opinionated weights.
- `src/storage-migrate.js` — moves data saved under the old `court-builder.` storage prefix to `build-lab.`.
- `src/ui/` — React views.
- `tools/ui-check.mjs` — exercises the UI in headless Chrome and saves screenshots.
