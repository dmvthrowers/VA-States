// Reference competition setups from yoyo-registration-template. Not used at runtime: tests
// (lib/team-entries.test.mjs) use them as fixtures, and they are examples for VSYC-27 divisions.
/**
 * Ready-made `competition` blocks. Copy one over the `competition` value in contest.config.ts,
 * adjust names, prices and tricks, then run `npm run divisions`.
 *
 * The formats here are typical starting points, not any organization's official rules.
 * Check your sanctioning body's current rulebook before you publish.
 *
 * Formats (see contest.config.ts): freestyle, panel, manual, ladder, bracket, showcase.
 * Entries: solo, or team (doubles / groups / acts). Rounds: e.g. prelims → finals.
 */
import type { DivisionDef, PanelScoring, competition as Competition } from '../contest.config';

type CompetitionConfig = typeof Competition;

const pricing = { earlyBirdDiscountCents: 500, walkUpSurchargeCents: 1000, pricesTbd: false };

/** NYYL-style yo-yo freestyle sheet */
const nyyl = (techCap = 60, evalCap = 10) =>
  ({ format: 'freestyle', techCap, evalCap, negativeClicks: true, deductions: { stop: 1, discard: 3, detach: 5 } }) as const;

/** A panel sheet from [key, label, max] triples */
const panel = (...criteria: [string, string, number][]): PanelScoring =>
  ({ format: 'panel', criteria: criteria.map(([key, label, max]) => ({ key, label, max })) });

/** Artistic Performance: any toy, props and costumes welcome, solo or group, judged on artistry. */
const artisticPerformance = (toy: string): DivisionDef => ({
  code: 'AP',
  name: 'Artistic Performance',
  description: `A performance piece built around ${toy} play: choreography, story, props and costumes welcome. Solo or a group of up to 6.`,
  priceCents: 2000,
  music: true,
  entry: { type: 'team', label: 'Act', min: 1, max: 6, pricing: 'person' },
  scoring: panel(
    ['choreography', 'Choreography & composition', 25],
    ['performance', 'Performance & stage presence', 25],
    ['music', 'Use of music', 20],
    ['originality', 'Originality & concept', 15],
    ['technique', 'Technical skill', 15],
  ),
});

/** Doubles / pairs freestyle: two players, one routine, judged on how they work together. */
const doubles = (toy: string): DivisionDef => ({
  code: 'DBL',
  name: 'Doubles',
  description: `Two players, one routine. Judged on synchronization and the tricks you can only do together. One entry fee per pair.`,
  priceCents: 3000,
  music: true,
  entry: { type: 'team', label: 'Pair', min: 2, max: 2, pricing: 'team' },
  scoring: panel(
    ['sync', 'Synchronization', 25],
    ['interaction', `Interaction (${toy} passes, shared tricks)`, 25],
    ['technique', 'Technical difficulty', 30],
    ['performance', 'Performance', 20],
  ),
});

/** Showcase: on stage, not judged. Free by default. */
const showcase = (toy: string): DivisionDef => ({
  code: 'SHOW',
  name: 'Showcase',
  description: `Perform a routine on stage without being judged: first-timers, demos and ${toy} acts of any kind.`,
  priceCents: 0,
  music: true,
  entry: { type: 'team', label: 'Act', min: 1, max: 8, pricing: 'team' },
  scoring: { format: 'showcase' },
});

/**
 * A "Dueling Stars"-style battle (modelled on Stella Duellum at VSYC-26): one-minute routines
 * to random music, no repeated routines, winner of each match decided by a live stream poll,
 * third place ranked by total votes.
 */
const audienceBattle = (toy: string): DivisionDef => ({
  code: 'DUEL',
  name: 'Dueling Stars Battle',
  description: `Head-to-head ${toy} battles: one-minute routines, random music, the stream chat picks each winner.`,
  priceCents: 0,
  music: false,
  scoring: {
    format: 'bracket', seeding: 'random', thirdPlaceMatch: false, thirdPlaceByVotes: true, decidedBy: 'audience',
    matchFormat: 'one-minute routines, random music',
    rules: [
      'Music is random: you hear it when the crowd does',
      'Wait off stage until your battle is called',
      'No repeating a routine: a repeat is an instant disqualification',
      'Each winner is decided by a live poll on the stream',
    ],
  },
});

/** Full yo-yo contest: every format in one place. */
export const yoyoFull: CompetitionConfig = {
  toy: { singular: 'yo-yo', plural: 'yo-yos' },
  gear: { yoyo: 'Yo-yo', string: 'String', counterweight: 'Counterweight' },
  divisions: [
    {
      code: '1A', name: '1A — Single String', description: 'One yo-yo on one string. Prelims, then the top 10 return for finals.',
      priceCents: 3000, music: true, scoring: nyyl(),
      rounds: [{ name: 'Prelims', advance: 10 }, { name: 'Finals' }],
    },
    {
      code: 'X', name: 'X Division', description: '2A, 3A, 4A and 5A compete together with a per-style multiplier.', priceCents: 2500, music: true,
      styles: {
        min: 1, max: 2,
        options: [
          { code: '2A', label: '2A — Looping', multiplier: 1.4 },
          { code: '3A', label: '3A — Two-Handed String', multiplier: 1.5 },
          { code: '4A', label: '4A — Offstring', multiplier: 1.3 },
          { code: '5A', label: '5A — Freehand', multiplier: 1.6 },
        ],
      },
      scoring: nyyl(),
    },
    {
      code: 'SBJ', name: 'Sport / Beginner / Junior', description: 'Shorter routines for newer players. No deductions.', priceCents: 2000, music: true,
      cannotCombineWith: ['1A', 'X'],
      scoring: { format: 'freestyle', techCap: 20, evalCap: 20, negativeClicks: false, deductions: null },
    },
    artisticPerformance('yo-yo'),
    doubles('yo-yo'),
    {
      code: 'BATTLE', name: 'Trick Battle', description: 'Head-to-head, single elimination. Judges vote each battle.', priceCents: 1000, music: false,
      scoring: { format: 'bracket', seeding: 'random', thirdPlaceMatch: true, matchFormat: 'two 30-second rounds each, house music' },
    },
    {
      code: 'LADDER', name: 'Trick Ladder', description: 'Climb a fixed list of tricks. Three tries at each; miss all three and you’re out.', priceCents: 1000, music: false,
      scoring: {
        format: 'ladder', attemptsPerTrick: 3,
        tricks: ['Gravity Pull', 'Forward Pass', 'Breakaway', 'Trapeze', 'Man on the Flying Trapeze', 'Double or Nothing', 'Kamikaze', 'Brain Twister', 'Boingy Boing', 'Kwyjibo'].map((name) => ({ name })),
      },
    },
    {
      code: 'SPEED', name: 'Speed: 50 Loops', description: '50 inside loops, fastest time wins. Best of 3 attempts.', priceCents: 500, music: false,
      scoring: { format: 'manual', max: 600, better: 'lower', unit: 'seconds', attempts: 3 },
    },
    showcase('yo-yo'),
    audienceBattle('yo-yo'),
  ],
  combos: [{ divisions: ['1A', 'X'], priceCents: 5000 }],
  pricing,
};

/**
 * Combo event: a yo-yo contest and a kendama contest on one day, sharing one sign-up,
 * with a yo-yo trick ladder, duos, and an audience-voted battle open to any toy.
 */
export const combo: CompetitionConfig = {
  toy: { singular: 'yo-yo and kendama', plural: 'yo-yos and kendamas' },
  gear: { yoyo: 'Yo-yo', string: 'Kendama', counterweight: 'String' },
  divisions: [
    {
      code: '1A', name: '1A — Yo-Yo Single String', description: 'The classic yo-yo freestyle to your own music.',
      priceCents: 2500, music: true, scoring: nyyl(),
    },
    {
      code: 'YLAD', name: 'Yo-Yo Trick Ladder', description: 'Climb the trick list. Three tries per trick; miss all three and you’re out.', priceCents: 1000, music: false,
      scoring: {
        format: 'ladder', attemptsPerTrick: 3,
        tricks: ['Gravity Pull', 'Forward Pass', 'Breakaway', 'Trapeze', 'Double or Nothing', 'Kamikaze', 'Brain Twister', 'Kwyjibo', 'Black Hops', 'Boingy Boing'].map((name) => ({ name })),
      },
    },
    {
      code: 'KFREE', name: 'Kendama Freestyle', description: 'A timed kendama freestyle to music.', priceCents: 2000, music: true,
      scoring: panel(['difficulty', 'Trick difficulty', 40], ['execution', 'Execution & control', 30], ['flow', 'Flow & variety', 20], ['music', 'Use of music', 10]),
    },
    {
      code: 'KLAD', name: 'Kendama Trick Ladder', description: 'Land each kendama trick in order, three tries each.', priceCents: 1000, music: false,
      scoring: {
        format: 'ladder', attemptsPerTrick: 3,
        tricks: ['Big Cup', 'Spike', 'Around the World', 'Lighthouse', 'Earth Turn', 'Airplane', 'Lunar', 'Juggle', 'Lighthouse Flip', 'Spacewalk'].map((name) => ({ name })),
      },
    },
    {
      ...doubles('yo-yo or kendama'),
      code: 'DUO', name: 'Duo',
      description: 'Two players, one routine. Yo-yo, kendama, or one of each.',
    },
    audienceBattle('yo-yo and kendama'),
  ],
  combos: [
    { divisions: ['1A', 'YLAD'], priceCents: 3000 },
    { divisions: ['KFREE', 'KLAD'], priceCents: 2500 },
  ],
  pricing,
};

export const kendama: CompetitionConfig = {
  toy: { singular: 'kendama', plural: 'kendamas' },
  gear: { yoyo: 'Kendama', string: 'String', counterweight: '' },
  divisions: [
    {
      code: 'KFREE', name: 'Kendama Freestyle', description: 'A timed freestyle to music, judged as a whole routine.', priceCents: 2500, music: true,
      scoring: panel(['difficulty', 'Trick difficulty', 40], ['execution', 'Execution & control', 30], ['flow', 'Flow & variety', 20], ['music', 'Use of music', 10]),
      rounds: [{ name: 'Prelims', advance: 8 }, { name: 'Finals' }],
    },
    {
      code: 'KLAD', name: 'Trick Ladder', description: 'Land each trick in order. Three tries per trick.', priceCents: 1500, music: false,
      styles: { min: 1, max: 1, options: [{ code: 'AM', label: 'Amateur' }, { code: 'PRO', label: 'Pro' }] },
      scoring: {
        format: 'ladder', attemptsPerTrick: 3,
        tricks: ['Big Cup', 'Spike', 'Around the World', 'Lighthouse', 'Earth Turn', 'Bird', 'Airplane', 'Lunar', 'Juggle', 'Lighthouse Flip'].map((name) => ({ name })),
      },
    },
    {
      code: 'KBATTLE', name: 'Kendama Battle', description: 'Head-to-head trick battles, judge vote, single elimination.', priceCents: 1000, music: false,
      scoring: { format: 'bracket', seeding: 'random', thirdPlaceMatch: false, matchFormat: 'trade tricks, best of three' },
    },
    { ...doubles('kendama'), description: 'Two players trade and share tricks in one routine.' },
    {
      code: 'KJR', name: 'Junior Ladder (under 13)', description: 'A shorter trick ladder for younger players.', priceCents: 1000, music: false,
      cannotCombineWith: ['KLAD'],
      scoring: { format: 'ladder', attemptsPerTrick: 3, tricks: ['Big Cup', 'Small Cup', 'Base Cup', 'Spike', 'Around Japan', 'Around the World'].map((name) => ({ name })) },
    },
  ],
  combos: [{ divisions: ['KFREE', 'KLAD'], priceCents: 3500 }],
  pricing,
};

export const juggling: CompetitionConfig = {
  toy: { singular: 'juggling prop', plural: 'juggling props' },
  gear: { yoyo: 'Props (balls, clubs, rings)', string: '', counterweight: '' },
  divisions: [
    {
      code: 'JFREE', name: 'Individual Freestyle', description: 'A routine to music with any props.', priceCents: 2000, music: true,
      scoring: panel(['technique', 'Technique', 30], ['difficulty', 'Difficulty', 30], ['presentation', 'Presentation', 20], ['choreography', 'Choreography', 20]),
    },
    {
      code: 'JTEAM', name: 'Team Routine', description: 'Two to six jugglers: passing patterns and group choreography.', priceCents: 1500, music: true,
      entry: { type: 'team', label: 'Team', min: 2, max: 6, pricing: 'person' },
      scoring: panel(['technique', 'Technique', 30], ['difficulty', 'Difficulty', 25], ['teamwork', 'Teamwork & passing', 25], ['presentation', 'Presentation', 20]),
    },
    {
      code: 'JNUM', name: 'Numbers Endurance', description: 'Most catches in a single run. Best of 3 attempts.', priceCents: 500, music: false,
      styles: { min: 1, max: 3, options: [{ code: 'B5', label: '5 balls' }, { code: 'B7', label: '7 balls' }, { code: 'C3', label: '3 clubs' }] },
      scoring: { format: 'manual', max: 99999, better: 'higher', unit: 'catches', attempts: 3 },
    },
    {
      code: 'JDROP', name: 'Juggling Battle', description: 'Drop and you’re out: last juggler standing in each match moves on.', priceCents: 500, music: false,
      scoring: { format: 'bracket', seeding: 'random', thirdPlaceMatch: true, matchFormat: 'last one juggling wins' },
    },
    showcase('juggling'),
  ],
  combos: [],
  pricing,
};

export const diabolo: CompetitionConfig = {
  toy: { singular: 'diabolo', plural: 'diabolos' },
  gear: { yoyo: 'Diabolo', string: 'Sticks & string', counterweight: '' },
  divisions: [
    {
      code: 'DFREE', name: 'Diabolo Freestyle', description: 'Freestyle to music: one or more diabolos.', priceCents: 2500, music: true,
      styles: { min: 1, max: 1, options: [{ code: '1D', label: 'Single diabolo' }, { code: 'MD', label: 'Multi-diabolo', multiplier: 1.2 }, { code: 'VT', label: 'Vertax / vertical axis', multiplier: 1.2 }] },
      scoring: { format: 'freestyle', techCap: 60, evalCap: 10, negativeClicks: true, deductions: { stop: 0, discard: 3, detach: 0 } },
    },
    artisticPerformance('diabolo'),
    {
      code: 'DBEG', name: 'Beginner', description: 'Shorter freestyle for newer players.', priceCents: 1500, music: true, cannotCombineWith: ['DFREE'],
      scoring: panel(['difficulty', 'Difficulty', 40], ['control', 'Control', 30], ['performance', 'Performance', 30]),
    },
    {
      code: 'DHIGH', name: 'High Toss', description: 'Highest clean toss and catch. Best of 3, measured in metres.', priceCents: 500, music: false,
      scoring: { format: 'manual', max: 100, better: 'higher', unit: 'metres', attempts: 3 },
    },
  ],
  combos: [],
  pricing,
};

export const spintop: CompetitionConfig = {
  toy: { singular: 'top', plural: 'spinning tops' },
  gear: { yoyo: 'Top', string: 'String', counterweight: '' },
  divisions: [
    { code: 'TFREE', name: 'Top Freestyle', description: 'Freestyle to music on a hard floor or tray.', priceCents: 2500, music: true, scoring: { format: 'freestyle', techCap: 60, evalCap: 10, negativeClicks: true, deductions: null } },
    {
      code: 'TLONG', name: 'Longest Spin', description: 'One throw, longest spin wins. Best of 3, in seconds.', priceCents: 1000, music: false,
      scoring: { format: 'manual', max: 9999, better: 'higher', unit: 'seconds', attempts: 3 },
    },
    {
      code: 'TRING', name: 'Ring Battle', description: 'Knock your opponent’s top out of the ring. Single elimination.', priceCents: 1000, music: false,
      scoring: { format: 'bracket', seeding: 'random', thirdPlaceMatch: true, matchFormat: 'best of three spins' },
    },
    {
      code: 'TJR', name: 'Junior Trick Ladder', description: 'A trick ladder for younger players.', priceCents: 1000, music: false,
      scoring: { format: 'ladder', attemptsPerTrick: 3, tricks: ['Floor spin', 'Pick up to hand', 'Hand to string', 'Around the world', 'Sky toss catch'].map((name) => ({ name })) },
    },
  ],
  combos: [{ divisions: ['TFREE', 'TLONG'], priceCents: 3000 }],
  pricing,
};

/** Mixed skill toy contest: one division per toy, an open battle and an AP division. */
export const mixed: CompetitionConfig = {
  toy: { singular: 'skill toy', plural: 'skill toys' },
  gear: { yoyo: 'Main toy', string: 'Second toy', counterweight: '' },
  divisions: [
    { code: 'YOYO', name: 'Yo-Yo Freestyle', description: 'Any yo-yo style.', priceCents: 2000, music: true, scoring: panel(['technique', 'Technique', 50], ['performance', 'Performance', 30], ['music', 'Use of music', 20]) },
    { code: 'KEN', name: 'Kendama Freestyle', description: 'Kendama freestyle to music.', priceCents: 2000, music: true, scoring: panel(['technique', 'Technique', 50], ['performance', 'Performance', 30], ['music', 'Use of music', 20]) },
    { code: 'DIAB', name: 'Diabolo Freestyle', description: 'Diabolo freestyle to music.', priceCents: 2000, music: true, scoring: panel(['technique', 'Technique', 50], ['performance', 'Performance', 30], ['music', 'Use of music', 20]) },
    { code: 'OPEN', name: 'Open Skill Toy', description: 'Tops, juggling, flow toys, anything else.', priceCents: 2000, music: true, scoring: panel(['technique', 'Technique', 50], ['performance', 'Performance', 30], ['music', 'Use of music', 20]) },
    artisticPerformance('skill toy'),
    {
      code: 'BATTLE', name: 'Open Battle', description: 'Any toy, head-to-head, judge vote.', priceCents: 1000, music: false,
      scoring: { format: 'bracket', seeding: 'random', thirdPlaceMatch: false, matchFormat: 'two 30-second rounds' },
    },
    showcase('skill toy'),
  ],
  combos: [],
  pricing,
};

export const PRESETS = { yoyoFull, combo, kendama, juggling, diabolo, spintop, mixed };
