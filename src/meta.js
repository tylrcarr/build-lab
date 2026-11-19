import { attributes } from './engine.js';
// "Meta" badge worth for NBA 2K27 (0 = not worth points … 3 = top of the meta), used to steer leftover Overall and
// Cap Breakers once your musts, minimums and picks are covered, and for the meta score on results.
// Sources (Nov 2026): Operation Sports "best badges in NBA 2K27, no matter your build" and MMOexp's 2K27 badge tier
// list, where they agree; plus calls made in this project (Set and Fire core, Quick Trigger minor, Off-Ball Pest
// worthless, Immovable Enforcer bronze, Break Starter gold, Brick Wall silver). Where the two sources disagree (Dimer,
// Flash, Float Game, Unpluckable) the badge sits in the middle. Edit freely: it's a judgement call, not game data.
export const META = {
  // Shooting
  set_and_fire: 3, arc_cadence: 2.25, deadeye: 2, limitless_range: 2, smooth_operator: 1, mini_marksman: 1,
  quick_trigger: 0.2, static_middy: 1, post_fade_phenom: 1,
  // Finishing
  posterizer: 3, layup_mixmaster: 1, rise_up: 0.25, paint_prodigy: 0.25, float_game: 0.25, physical_finisher: 1,
  // Post play isn't meta. Post Control feeds six badges at once (these plus Unpluckable), so even small worths add up to a
  // top badge on one cheap attribute: the optimizer would pour leftover Overall into Post Control on a 6'6" guard.
  aerial_wizard: 0.25, ghost_stepper: 0.05, hook_specialist: 0.05, post_powerhouse: 0.05, post_spin_catalyst: 0.05,
  // Playmaking
  handles_for_days: 3, lightning_launch: 3, pace: 2, ankle_assassin: 2, versatile_visionary: 2, break_starter: 1,
  bail_out: 0.5, dimer: 0.5, strong_handle: 0.5, unpluckable: 0.5,
  // Defense
  interceptor: 3, challenger: 3, paint_patroller: 1, immovable_enforcer: 2, pick_dodger: 2, post_lockdown: 0.25,
  seatbelt: 1, high_flying_denier: 1.5, glove: 1, ankle_braces: 1, wall_up: 0.5, off_ball_pest: 0,
  // Rebounding
  // Box Out Boss: worms aren't a big problem in the game, so it's low meta everywhere.
  sync_snatcher: 1.25, possession_closer: 1, boxout_boss: 0.4, crasher: 1, breaker: 0.25,
  // Physicals
  bruiser: 0.75, pogostick: 1, flash: 1, brick_wall: 0.5, work_horse: 0.25, slippery_offball: 0.5,
  // Takeovers: a very small nudge each (0.5 ≈ a third of a Normal badge's bronze), never worth as much as a good badge: the
  // 91 three for Zip Code is a bonus, not a target. The ones that come with ratings you'd have anyway (Cook's 90 handle,
  // Blur, Hawk, Muscle) count half that.
  ...Object.fromEntries(['inside_touch', 'navigator', 'airspace', 'detonator', 'paint_surgeon', 'shot_artist', 'calibrated', 'zip_code',
    'dishmaster', 'glue', 'ball_heist', 'rim_guardian', 'demolition', 'second_chance', 'see_the_future'].map(k => ['takeover_' + k, 0.33])),
  ...Object.fromEntries(['cook', 'blur', 'hawk', 'muscle'].map(k => ['takeover_' + k, 0.17])),
  // Contact dunk animations (one "tier" each): dunking is meta. Off two is the common target (87 driving dunk).
  // Alley-oop animations count for nothing: oops are too rare in a game to build for.
  // Elite Contact Off Two (96) is barely worth chasing: 93 already has gold Posterizer, and 94–98 change nothing else.
  // 87 is the mark: Pro Contact Off One (89 dunk / 78 vertical) adds little on top of it.
  pro_contact_off_two: 2, pro_contact_off_one: 0.25, elite_contact_off_two: 0.25, small_contact_off_two: 1,
};
// Badges whose tiers aren't worth the same: per-tier worth (index = tier rank) instead of 1 per tier. Gold Posterizer
// (93 driving dunk) is the one people build for: a cliff at 93, and HoF (99) barely more, so 94–98 isn't worth paying
// for. Possession Closer works the same way for bigs: gold (95 defensive rebound) is the board that matters, far above
// 90 (a 90-board center isn't close to a 95 one).
// Post Fade Phenom only starts to matter at silver, and even then it's low-normal: worth it when it costs next to nothing.
// Set and Fire: silver (78) is the floor everyone has; gold (89) is the shooting breakpoint that matters — an 86 three is a
// stop on the way, not the goal (86 and 89 are the two marks). Lightning Launch: gold (86 speed with ball) is what you
// aim for, silver (75) is still real value; bronze is nothing. Paint Patroller ("rim protection"): silver (~84 block,
// 71+ interior) is the big one, gold (93 block) the goal if it fits. Crasher: silver (80) is fine, gold (93) is what a
// real inside big has. Arc Cadence: the three-point marks that matter are 83 (Limitless bronze), 89 (Set and Fire gold)
// and 91 (Arc Cadence gold); silver (86) is a stop on the way, there if you pick it yourself.
export const META_TIER = { posterizer: [0, 0.5, 1.25, 3.5, 3.75], possession_closer: [0, 0.5, 1, 4, 4.25],
  post_fade_phenom: [0, 0, 0.6, 0.9, 1.1], set_and_fire: [0, 0.25, 1.75, 3.75, 4.25], lightning_launch: [0, 0.25, 2, 3.75, 4],
  paint_patroller: [0, 0.75, 2.5, 3.5, 3.75], crasher: [0, 0.5, 1.75, 3.75, 4],
  arc_cadence: [0, 0.25, 0.5, 3, 3.25],
  // Deadeye: gold (92 mid range or three) is the one that matters, a cliff like gold Set and Fire.
  deadeye: [0, 0.5, 1.25, 3.75, 4] };
// A first tier is worth a bit more than later steps: a bronze can be Synergy-boosted (+1) to silver.
export const BRONZE_BONUS = 0.5;
export const metaTierWorth = (goal, rank) => META_TIER[goal.name]?.[rank] ?? (rank ? rank + BRONZE_BONUS : 0);
// Passing badges, close-shot finishing and standing dunks (Rise Up) are lightly weighted on purpose: they're cheap
// to unlock, so with high weights the leftover budget pours into close shot / pass accuracy / standing dunk.
// Role differences: guards (PG/SG) and bigs (PF/C) value different things; SF uses the base table. E.g. Ankle Braces
// and Pick Dodger matter on the perimeter and barely at all for a big; boards and rim badges are the reverse.
export const META_BY_GROUP = {
  guard: { ankle_braces: 2, pick_dodger: 3, mini_marksman: 2, seatbelt: 1.5, slippery_offball: 1, flash: 1.5,
    rise_up: 0.5, paint_prodigy: 0.5, boxout_boss: 0, possession_closer: 0.1, crasher: 0.25, sync_snatcher: 0.1, brick_wall: 0.5,
    immovable_enforcer: 0.75, static_middy: 1.25, deadeye: 2.5, break_starter: 0.5, pogostick: 1, post_lockdown: 0, paint_patroller: 0.75, wall_up: 0,
    versatile_visionary: 2, dimer: 0.75, bail_out: 0.5, small_contact_off_two: 1.5 },
  // Arc Cadence is moving threes: a big's threes are spot-up catch-and-shoots, so it barely counts (Set and Fire does).
  big: { arc_cadence: 0.25, ankle_braces: 0.5, pick_dodger: 0.5, seatbelt: 0, mini_marksman: 0, slippery_offball: 0, flash: 0.5,
    handles_for_days: 1, lightning_launch: 1.5, ankle_assassin: 0.5, posterizer: 2, strong_handle: 0.25, unpluckable: 0.1, layup_mixmaster: 0.5, physical_finisher: 0.5, static_middy: 0.75, immovable_enforcer: 2, pace: 0.5, interceptor: 2,
    // Challenger bronze (71 perimeter D) is a real target for bigs too, centers included: you switch onto shooters. It only
    // exists up to 6'11", and a taller big is scored as missing it (see OUT_OF_HEIGHT_COUNTS).
    challenger: 3,
    // Breaker: the offensive-board worms take too long to be worth building for.
    breaker: 0,
    boxout_boss: 0.5, possession_closer: 3, sync_snatcher: 1.25, crasher: 2, rise_up: 0.25, high_flying_denier: 2.25, post_lockdown: 0.25, break_starter: 3, paint_prodigy: 0.75,
    // The post game (7'0"+ only, see POST_GOALS): gold Hook Specialist (87 close shot, 80 post control) is the mark.
    hook_specialist: 1.5, post_powerhouse: 0.75, post_spin_catalyst: 0.5, ghost_stepper: 0.5,
    // Brick Wall: bronze (75) is the floor (brickGate); silver (83) is worth a couple of pounds and a Cap Breaker.
    paint_patroller: 2.75, wall_up: 0.75, float_game: 0, bruiser: 1, brick_wall: 2, work_horse: 0.25, pro_contact_off_two: 1.5,
    // Standing dunks are weak in this game: Rise Up and the big-man contact dunks are worth little (the offensive board is
    // worth far more to a center).
    pro_bigman_contact: 0.25, elite_bigman_contact: 0 },
};
// Strength on the perimeter: guards and wings don't buy strength for its own badges. Immovable Enforcer bronze (71) is
// enough (higher tiers only for a real dunker, see STRENGTH_FREE), Brick Wall stops at bronze, and Bruiser / Physical
// Finisher aren't worth strength. Wings sit around 71-76 strength; smaller players need even less (see dunkFactor).
// Strength is a breakpoint, not a slope: 71 (Immovable Enforcer and Bruiser bronze) or as low as it goes (a high-steal
// gambler doesn't need it). Those bronzes are worth enough to make 71 a real stop; nothing pays for 72-82.
META_BY_GROUP.guard = { ...META_BY_GROUP.guard, immovable_enforcer: 1.5, brick_wall: 0, bruiser: 0.75, physical_finisher: 0.5, strong_handle: 0.5, breaker: 0 };
META_BY_GROUP.wing = { immovable_enforcer: 2.25, brick_wall: 0.25, bruiser: 0.75, physical_finisher: 0.5, strong_handle: 0.5, breaker: 0.25 };
// Highest meta tier per group, on top of META_CAPS.
export const META_CAPS_BY_GROUP = {
  // Guards: Paint Patroller bronze at most (a PG chasing silver is paying big-man prices for it).
  // Interceptor stays at silver (77): counting gold made 90 steal the default on 7 of 12 top builds. The 90s-steal build's
  // room comes from the Hawk (85) and Ball Heist (90) takeovers and the 75 perimeter D floor.
  // High-Flying Denier stops at silver (78 block) on the perimeter: gold's 88 block is a big's price.
  guard: { immovable_enforcer: 3, brick_wall: 1, bruiser: 1, physical_finisher: 2, strong_handle: 2, paint_patroller: 1, break_starter: 2, high_flying_denier: 2 },
  // Bigs: Crasher up to gold (93 offensive board: a center without it is missing half the job).
  // Static Middy bronze (55 mid) is all a big needs to hit a middy; Bruiser past silver (84) isn't worth the strength.
  // Post Fade Phenom stops at silver. (Deadeye on a big counts through the three only: see THREE_ONLY in breakpoints.js.)
  big: { crasher: 3, static_middy: 1, bruiser: 2, post_fade_phenom: 2 },
  wing: { immovable_enforcer: 3, brick_wall: 1, bruiser: 1, physical_finisher: 2, strong_handle: 2, break_starter: 2, high_flying_denier: 2 },
};
// Strength tiers above these ranks only count for a driving dunker (93+ full, nothing at 87 or less): Strong Handle means
// nothing if you don't dunk, and 82–85 strength for Immovable Enforcer is a 50/50 against speed even for one who does.
export const STRENGTH_FREE = { guard: { immovable_enforcer: 1, strong_handle: 0 }, wing: { immovable_enforcer: 1, strong_handle: 0 } };
export const dunkGate = dunk => Math.max(0, Math.min(1, (dunk - 87) / 6));
export const strengthFree = (goal, position) => STRENGTH_FREE[metaGroup(position)]?.[goal.name];
// Single positions on top of their group: PGs run the offense, so passing counts more than for an SG.
// PF: the 95 board (gold Possession Closer) is a real target, worth more than 87, but a four can make up the difference
// by shooting: gold Set and Fire (89 three) is worth about as much at PF as the step from silver to gold boards (7.5 each).
// A center's boards are worth more (3) and its shooting less (Set and Fire stays at 3), so 95 stays the center's job.
// A four who shoots doesn't need the offensive board: Crasher counts little at PF (pfGate still takes 93 as the boards way).
export const META_BY_POS = { PG: { bail_out: 1, dimer: 1, versatile_visionary: 1 }, PF: { possession_closer: 2.5, set_and_fire: 3.75, crasher: 0.5 } };
// Badges that count in the meta maximum even where the height can't have them, so missing them costs: Challenger stops at
// 6'11", and a 7-footer gives up its contests on the perimeter for the height.
export const OUT_OF_HEIGHT_COUNTS = { big: new Set(['challenger']) };
export function metaGroup(position) { return position === 'PG' || position === 'SG' ? 'guard' : position === 'PF' || position === 'C' ? 'big' : 'wing'; }

// The game meta for the average player (rec, park, MyCareer): balanced builds you don't need a whole team around — a
// no-defense "cone" isn't meta. Not the min-max meta of organized competitive play.
// Highest tier the meta says is worth buying (1 bronze … 4 HoF); unlisted = HoF.
// Defense on guards/wings: about 83 steal and 85 perimeter D is enough unless it's a lockdown (pick that in the Lab).
// Immovable Enforcer silver (72 perimeter D / 82 strength) is cheap on a big. Paint Patroller gold (93 block) counts:
// a 95 board / 93 block center should beat a 92 / 92 one. Sync Snatcher stops at gold: HoF boards
// aren't worth giving up Lightning Launch, speed or perimeter D.
// Box Out Boss stops at silver (gold's 88 strength + 90 board is what made bigs carry 89–90 strength); Crasher at silver
// (80 offensive rebound is the board that matters).
// Static Middy: bronze (55 mid) is all anyone needs; past that it's not worth chasing (Deadeye gold is the mid-range
// badge that matters).
// Passing: 80–85 pass accuracy does the job (Versatile Visionary silver 80, Bail Out bronze 85); nothing past 85 counts, so
// Dimer stops at silver (70) and, off a big's outlet pass, Break Starter at silver (77).
export const META_CAPS = { static_middy: 1, strong_handle: 2, boxout_boss: 2, crasher: 2, break_starter: 3, limitless_range: 3, bail_out: 1, brick_wall: 2, immovable_enforcer: 2, sync_snatcher: 3,
  high_flying_denier: 3, interceptor: 2, glove: 2, challenger: 2, pick_dodger: 2, ankle_braces: 2, dimer: 2,
  versatile_visionary: 2, ankle_assassin: 2, handles_for_days: 3, paint_patroller: 3, wall_up: 1, post_lockdown: 1,
  aerial_wizard: 3, paint_prodigy: 2, float_game: 2, ghost_stepper: 2, pogostick: 2,
  // Work Horse: bronze at most, nobody runs it higher.
  work_horse: 1 };
// How much meta counts next to your own picks while optimizing (your Normal = 1 per tier; top meta = 3 × 0.25).
export const META_RATE = 0.25;
const ix = name => attributes.findIndex(a => a.name === name);
const DUNK_I = ix('driving_dunk'), THREE_I = ix('three_point'), BH_I = ix('ball_handle'), SPEED_I = ix('speed');
const DREB_I = ix('defensive_rebound'), OREB_I = ix('offensive_rebound'), VERT_I = ix('vertical'), STR_I = ix('strength'), STEAL_I = ix('steal');
export const metaOf = (goal, position, mode = '5v5') => {
  const base = META_BY_POS[position]?.[goal.name] ?? META_BY_GROUP[metaGroup(position)]?.[goal.name] ?? META[goal.name] ?? 0;
  const k = mode === '3v3' ? 1 : mode === 'both' ? 0.5 : 0;
  return base * (1 + ((META_3V3[goal.name] ?? 1) - 1) * k);
};

// 3v3 (half court, smaller floor): outlets and transition passing matter less, perimeter quickness more.
export const META_3V3 = { break_starter: 0.3, dimer: 0.8, boxout_boss: 0.8, pick_dodger: 1.3, ankle_braces: 1.3, flash: 1.2 };

// The meta is a badge meta: you go precisely to the ratings badges need. Ratings only count on their own for mobility
// (speed, agility) and, in the casual meta, a perimeter-defense floor of 75 for guards and wings (lower is a cone).
// [weight, target, floor, ceiling, hit]: 3× weight below the floor, full to the target, a quarter to the ceiling, nothing
// past; hit = a one-off bonus (in rating points) for reaching the target (a big's 90 board: 89 isn't 90).
// Free throw: 64 is enough (you have to know your release, but it goes in); 65–70 is a small extra, nothing past 70.
// Everyone: 78+ three (a non-shooter isn't meta, bigs included) and 65+ pass accuracy (lower is unplayable), aiming for
// 80 (silver Versatile Visionary). Agility counts for everyone, bigs included (a slow, stiff big is a liability).
// Guards and wings are fast: under 82 / 80 speed is slow for the role (a 6'8" SF at 78 speed isn't meta, whatever badges
// it bought). Wings and bigs need a way to finish: driving dunk counts (see also finishGate).
// Bigs: 87+ defensive rebound and 95 is the target (Possession Closer gold); 90 isn't a stopping point. Bigs: block before interior (Paint Patroller silver 71/84, High-Flying Denier), and
// speed matters for them too. Strength isn't a target: it comes from the badges that use it.
const ATTR = {
  guard: { speed: [2, 88, 82, 90], agility: [1.75, 86, 76], free_throw: [1, 64, 55, 70], perimeter_defense: [1, 75, 75, 75], three_point: [2, 89, 78, 95, 4],
    // Under 81 ball handle (Handles for Days silver) a guard's handle is a liability: 3× weight below it.
    mid_range: [0.5, 80], ball_handle: [0.75, 90, 81],
    pass_accuracy: [1.25, 80, 65, 80] },
  wing: { speed: [2.5, 86, 80, 88], agility: [1.75, 84, 74], driving_dunk: [0.25, 87, 78, 87, 6], free_throw: [1, 64, 55, 70], mid_range: [0.5, 80], perimeter_defense: [1, 75, 75, 75], three_point: [2, 78, 78, 78],
    pass_accuracy: [1.25, 80, 65, 80] },
  // Boards are breakpoints, not points: 87 (Possession Closer silver) is the floor and 95 (gold) the goal; 88-94 is
  // mostly wasted (a 93 board is a 87 board that cost more). Same for the offensive board: 80 (Crasher silver) is the
  // floor, 93 (gold) the goal, and 92 is a miss. Hence small per-point weights and big one-off hits.
  big: { speed: [2.5, 82, 74], agility: [1, 75, 65], defensive_rebound: [1.25, 95, 87, 95, 24], driving_dunk: [0.25, 87, 78, 87, 8], free_throw: [1, 64, 55, 70], three_point: [2, 78, 78, 78], pass_accuracy: [1.25, 80, 65, 80],
    // Interior D is a big's contest at the rim: 72 is too low; 80 (Wall Up bronze) is the mark, a little more to 85.
    block: [0.85, 84, 75, 84], interior_defense: [1, 80, 75, 85], offensive_rebound: [0.75, 93, 80, 93, 14],
    // Brick Wall bronze: a big under 75 strength gets moved off every spot (see brickGate). Past that, strength is its
    // badges' breakpoints (Brick Wall silver 83, Bruiser silver 84), not points.
    strength: [1, 75, 75, 75],
    // Perimeter D affects contests even without Challenger: up to 71 (bronze), a little more to 80.
    perimeter_defense: [0.75, 71, 60, 80] },
};
// Below 78 three a build isn't meta at all: the meta score is scaled down 5% per point under it (to 40% at most).
export const shootingGate = three => Math.max(0.4, 1 - 0.05 * Math.max(0, 78 - three));
// No finishing is a liability: the meta score drops 2.5% per point that the better of driving dunk and driving layup is
// under 80 (to 60% at most). Close shot and standing dunks don't count: they don't get you to the rim.
export const FINISH_FLOOR = 80;
export const finishGate = (dunk, layup) => Math.max(0.6, 1 - 0.025 * Math.max(0, FINISH_FLOOR - Math.max(dunk, layup)));
// A big's finishing is the dunk: under 87 driving dunk (Posterizer silver, the contact dunks off two) a PF or C loses
// 1.5% of their meta score per point (to 85% at most). What makes a big meta is having it all at once: the 87 dunk,
// good passing, good-enough boards, speed and agility. Missing any one of them is the gap (see the other gates).
export const BIG_DUNK = 87;
// A cliff, not a slope: an 83 or 85 dunk opens nothing a 78 doesn't, so it scores the same (87% under 87).
export const bigDunkGate = (dunk, position) => metaGroup(position) === 'big' && dunk < BIG_DUNK ? 0.87 : 1;
// A big who can't rebound isn't meta, however well they block. PF: silver Possession Closer (87 defensive rebound) is an
// implicit floor: under it they lose 30% of their meta score at 86 and 3% more per point (to 40% at most: 79 → 49%), so a
// 79-board "PF" ranks as the SF it is. Centers, and wings 6'9"+ who don't handle (speed with ball under 65), lose 3% per
// point under 85 (to 55% at most).
export const REBOUND_FLOOR = 87;
export const reboundGate = (dreb, position, height, swb) => position === 'PF'
  ? (dreb >= REBOUND_FLOOR ? 1 : Math.max(0.4, 0.7 - 0.03 * (REBOUND_FLOOR - 1 - dreb)))
  : (metaGroup(position) === 'big' || (height >= 81 && swb < 65)) ? Math.max(0.55, 1 - 0.03 * Math.max(0, 85 - dreb)) : 1;
// A PF is either an elite shooter or an elite rebounder: 89 three (Set and Fire gold) or gold boards (95 defensive or 93
// offensive). Halfway is neither: an 86 three with 93/82 boards is a non-shooter who doesn't own the glass. 25% off the
// meta score when both miss, nearly a cliff (full at 86 three or less, 91 defensive or less, 88 offensive or less).
export const PF_SHOOT = 89, PF_DREB = 95, PF_OREB = 93;
export function pfGate(final, position) {
  if (position !== 'PF') return 1;
  const c = x => Math.max(0, Math.min(1, x));
  const shot = c((PF_SHOOT - final[THREE_I]) / 3);
  const boards = Math.min(c((PF_DREB - final[DREB_I]) / 4), c((PF_OREB - final[OREB_I]) / 5));
  return 1 - 0.25 * Math.min(shot, boards);
}
// final (optional): the build's ratings, for terms that depend on the rest of the build. A real dunker (87+ driving dunk)
// doesn't need mid-range: its target falls to 70 and counts half (a low mid with a high dunk is fine).
// Forgoing the dunk on a guard takes an outstanding three, handle and speed (89 / 92 / 87): without them, a guard under
// 87 driving dunk loses up to 15% of their meta score (full at 75 dunk or less, scaled by how far short the three,
// handle and speed are). This keeps 87-dunk guards and elite shooter-handlers on the same footing.
export const DUNKLESS = { three_point: 89, ball_handle: 92, speed: 87 };
export function dunklessGate(final, position) {
  if (metaGroup(position) !== 'guard') return 1;
  const lack = Math.max(0, Math.min(1, (87 - final[DUNK_I]) / 12));
  if (!lack) return 1;
  const short = Math.min(1, Math.max(0, DUNKLESS.three_point - final[THREE_I]) / 6 + Math.max(0, DUNKLESS.ball_handle - final[BH_I]) / 8
    + Math.max(0, DUNKLESS.speed - final[SPEED_I]) / 6);
  return 1 - 0.15 * lack * short;
}
// A dunk needs the bounce to use it: Posterizer silver and the contact dunks off two both need 75 vertical. A build with
// 87+ driving dunk under that paid for a dunk it can't posterize or contact-dunk with: 2% off the meta score per point of
// vertical short of 75 (to 85% at most), scaled by how far the dunk is past 80 (full at 87).
export const DUNK_VERTICAL = 75;
export const verticalGate = final => {
  const invested = Math.max(0, Math.min(1, (final[DUNK_I] - 80) / 7));
  return invested ? Math.max(0.85, 1 - 0.02 * invested * Math.max(0, DUNK_VERTICAL - final[VERT_I])) : 1;
};
// Bigs without Brick Wall (75 strength for bronze) get pushed around on every screen and box-out: a cliff, 15% off the
// meta score at 74 strength and 1.5% more per point under that (to 75% at most: 71 → 80.5%).
export const BRICK_FLOOR = 75;
export const brickGate = (strength, position) => metaGroup(position) !== 'big' || strength >= BRICK_FLOOR ? 1
  : Math.max(0.75, 0.85 - 0.015 * (BRICK_FLOOR - 1 - strength));
// Passing on a big only pays off if they can use it: Break Starter is the outlet after a defensive board (full at 90+
// defensive rebound, 30% at 75 or less), and the playmaking passes (Dimer, Versatile Visionary, Bail Out) need a handle
// that won't get ripped (full at 80+ ball handle, 40% at 65 or less). Otherwise a 94 pass accuracy on a 77-handle,
// 70-board big is Overall that could have gone into finishing. [attribute, gate].
// Blocks need the board: a block that doesn't end in your rebound is half a stop. Paint Patroller and High-Flying Denier
// count fully at 80+ defensive rebound, half at 65 or less.
const BLOCK_BOARD = ['defensive_rebound', v => Math.max(0.5, Math.min(1, 0.5 + 0.5 * (v - 65) / 15))];
export const USE_GATES = { guard: { paint_patroller: BLOCK_BOARD, high_flying_denier: BLOCK_BOARD },
  wing: { paint_patroller: BLOCK_BOARD, high_flying_denier: BLOCK_BOARD }, big: {
  paint_patroller: BLOCK_BOARD, high_flying_denier: BLOCK_BOARD,
  break_starter: ['defensive_rebound', v => Math.max(0.3, Math.min(1, 0.3 + 0.7 * (v - 75) / 15))],
  dimer: ['ball_handle', v => Math.max(0.4, Math.min(1, 0.4 + 0.6 * (v - 65) / 15))],
  versatile_visionary: ['ball_handle', v => Math.max(0.4, Math.min(1, 0.4 + 0.6 * (v - 65) / 15))],
  bail_out: ['ball_handle', v => Math.max(0.4, Math.min(1, 0.4 + 0.6 * (v - 65) / 15))],
  // A 7-footer's post game only makes them meta with a decent three next to it: nothing at 78 or less, full at 83+.
  ...Object.fromEntries(['hook_specialist', 'post_powerhouse', 'post_spin_catalyst', 'ghost_stepper']
    .map(k => [k, ['three_point', v => Math.max(0, Math.min(1, (v - 78) / 5))]])),
} };
export const useGate = (goal, position) => USE_GATES[metaGroup(position)]?.[goal.name] ?? null;
// Guards and wings are fast or they aren't meta: whatever badges a slow wing bought, it can't stay in front of anyone or
// get by them. Under 82 speed (guards) or 80 (wings) the meta score drops 5% per point (to 45% at most: a 73-speed SF
// keeps 65%, a 73-speed SG 55%). Bigs have their own, softer speed term (attrMetaFor).
export const SPEED_FLOOR = { guard: 82, wing: 80 };
export const speedGate = (speed, position) => {
  const floor = SPEED_FLOOR[metaGroup(position)];
  return floor ? Math.max(0.45, 1 - 0.05 * Math.max(0, floor - speed)) : 1;
};
// Centers need the offensive board too: a C under 80 loses 1.5% per point (to 75% at most). PFs are spared (stretch fours).
export const oboardGate = (orb, position) => position === 'C' ? Math.max(0.75, 1 - 0.015 * Math.max(0, 80 - orb)) : 1;
// Breakpoints only: every rating above counts at the last breakpoint it reaches (a badge, animation or takeover
// threshold, or the term's own floor, target and ceiling), so 80 → 83 block buys nothing until 84 opens something.
// Speed and agility are the exceptions: they help point by point in the game, not at thresholds.
export const SMOOTH_META = new Set(['speed', 'agility']);
export const attrMetaFor = (position, height = 80, final = null) => {
  const out = { ...ATTR[metaGroup(position)] };
  if (final && out.mid_range && final[DUNK_I] >= 87) out.mid_range = [out.mid_range[0] * 0.5, 70];
  if (position === 'PF') {
    // Closer to a center than a wing: 87 defensive is the floor (see reboundGate), 95 the target (gold Possession Closer,
    // through the badge: see META_BY_POS), unless the four shoots instead (89 three, see pfGate). 80 offensive (Crasher
    // silver) is the floor there, 93 a bonus.
    out.defensive_rebound = [1.5, 87, 87, 95, 8];
    out.offensive_rebound = [0.5, 80, 75, 80];
    // A four moves like one and guards the perimeter: faster and more agile than a center, with real perimeter D.
    out.speed = [3, 84, 76];
    out.agility = [2.25, 76, 70];
    out.perimeter_defense = [1.25, 75, 65, 82];
    // A four who can put it on the floor shoots off the dribble: mid range counts a little, more with the handle (none at
    // 65 ball handle or less, full at 80+). The big mid-range mark is Deadeye gold (92), through the badge.
    const handle = final ? Math.max(0, Math.min(1, (final[BH_I] - 65) / 15)) : 1;
    if (handle > 0) out.mid_range = [0.3 * handle, 80];
  }
  // Under 6'10" you guard the perimeter whatever the position says: a 6'7" "center" with 45 perimeter D is a cone.
  if (height < 82 && !out.perimeter_defense) out.perimeter_defense = [1, 75, 75, 75];
  // A gambler: with 85+ steal (Hawk) a guard or wing can live with low perimeter D, the floor drops to 60.
  if (final && metaGroup(position) !== 'big' && final[STEAL_I] >= 85 && out.perimeter_defense) {
    const [w, target] = out.perimeter_defense; out.perimeter_defense = [w * 0.5, target, 60, target];
  }
  // A small forward protects the rim on switches and help: an SF without block is an SG playing out of position. Marks:
  // High-Flying Denier bronze 68 / silver 78 (nothing opens at 79-83 on a wing; Paint Patroller silver is 84).
  if (position === 'SF') out.block = [1.5, 78, 68, 78];
  return out;
};

// Dunking meta needs the height to dunk: full from 6'4", fading to a quarter at 6'0" and below (a 5'9" PG isn't a
// dunker). Applies to Posterizer, Pogo Stick, Rise Up, Aerial Wizard and the contact dunk / alley-oop animations.
const DUNK_GOALS = new Set(['posterizer', 'pogostick', 'rise_up', 'aerial_wizard']);
// Standing dunks grow with height instead: half worth at 6'10", full at 7'0", 1.5× at 7'4".
const STAND_GOALS = new Set(['rise_up', 'pro_bigman_contact', 'elite_bigman_contact', 'bigman_contact_oop']);
// Strength badges matter less the smaller the player: full from 6'8", half at 6'4", a quarter at 6'2" and below.
const STRENGTH_GOALS = new Set(['immovable_enforcer', 'brick_wall', 'bruiser', 'strong_handle']);
// The post game is what a 7-footer brings (with the 87 dunk and a decent three): post badges count from 7'0" (full there,
// 1.25× at 7'1", 1.5× from 7'2"), nothing below, so a 6'6" guard never buys Post Control for them.
const POST_GOALS = new Set(['hook_specialist', 'post_powerhouse', 'post_spin_catalyst', 'ghost_stepper']);
export const dunkFactor = (goal, height) => POST_GOALS.has(goal.name) ? (height < 84 ? 0 : Math.min(1.5, 1 + (height - 84) * 0.25))
  : STRENGTH_GOALS.has(goal.name) ? Math.max(0.25, Math.min(1, (height - 72) / 8))
  : STAND_GOALS.has(goal.name) ? Math.max(0.5, Math.min(1.5, 0.5 + (height - 82) / 4))
  : !(DUNK_GOALS.has(goal.name) || goal.discipline === 'animation') ? 1
  : Math.max(0.25, Math.min(1, 0.25 + (height - 72) / 4 * 0.75));

// Height meta for ranking results and picking bodies: height decides contests (community 2K26 testing: height still
// dominates contest effectiveness; wingspan adds ~6%), so the meta peaks at 6'8" and falls off hard below it.
// Below: σ 4.5" (6'6" 0.91, 6'4" 0.67, 6'2" 0.41, 6'0" 0.21, 5'10" 0.08, 5'9" 0.05). Above: σ 7" (7'0" 0.85, 7'4" 0.52).
// peak (optional): a role's own best height, e.g. 7'4" for a post scorer (post play gets better the taller you are).
export const heightMeta = (h, position, peak = null) => {
  // Centers peak at 6'11", PFs at 6'10", everyone else at 6'8".
  const own = peak ?? (position === 'C' ? 83 : position === 'PF' ? 82 : 80);
  // Bigs fall off faster below their peak. Centers hardest (σ 2.25": 6'10" 0.91, 6'9" 0.67, 6'8" 0.41): at 6'8"-6'9"
  // make a PF. PFs σ 3" (6'9" 0.95, 6'8" 0.80, 6'7" 0.61).
  const below = peak != null ? 5 : position === 'C' ? 2.25 : position === 'PF' ? 3 : 4.5;
  peak = own;
  return Math.exp(-(((h - peak) / (h < peak ? below : 7)) ** 2) / 2);
};
// How strongly attribute meta counts relative to feel you set yourself (your Normal = 1).
export const ATTR_META_RATE = 0.4;
// Choosing a frame (weight/wingspan) within a height: caps that matter beyond the attribute meta above, [weight, up to].
// Speed alone would always pick the lightest, shortest frame and cap dunks, defense and boards.
export const FRAME_META = {
  // Small guards: steals before perimeter D (taller players shoot over you in the contest system), little strength.
  guard: { driving_dunk: [1.5, 93], perimeter_defense: [1, 88], steal: [1.25, 90], vertical: [0.5, 80], strength: [0.1, 70] },
  wing: { driving_dunk: [1.5, 93], perimeter_defense: [1.5, 92], steal: [0.75, 90], vertical: [0.75, 85], strength: [0.25, 76] },
  big: { defensive_rebound: [2.5, 95], block: [1.25, 92], interior_defense: [0.5, 88], driving_dunk: [1, 90], strength: [0.75, 83] },
};

// Driving finishes only pay off if you can get downhill: the meta worth of badges that need Driving Dunk or Driving
// Layup scales with Speed With Ball (25% at 55 or less, full at 75+). Derived from each badge's requirements.
export const DRIVE_ATTRS = new Set(['driving_dunk', 'driving_layup']);
export const driveFactor = swb => Math.max(0.25, Math.min(1, (swb - 55) / 20 * 0.75 + 0.25));
// Single positions on top of their group's caps. PF: rim protection stops at silver Paint Patroller (84 block, 71
// interior): gold's 93 block is a center's job.
// Bigs: Challenger bronze is the target (silver's 82 perimeter D is a wing's price), except a PF, who can go to silver.
export const META_CAPS_BY_POS = { PF: { paint_patroller: 2, challenger: 2 }, C: { challenger: 1 } };
export const metaCap = (goal, position) => META_CAPS_BY_POS[position]?.[goal.name] ?? META_CAPS_BY_GROUP[metaGroup(position)]?.[goal.name]
  ?? META_CAPS[goal.name] ?? 4;
// Meta worth of a tier rank with the strength gate applied (dunk = the build's driving dunk).
export function gatedTierWorth(goal, rank, position, dunk) {
  const free = strengthFree(goal, position), w = metaTierWorth(goal, rank);
  if (free == null || rank <= free) return w;
  const base = metaTierWorth(goal, free);
  return base + (w - base) * dunkGate(dunk);
}
