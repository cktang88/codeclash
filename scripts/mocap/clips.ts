// The clips converted from CMU motion capture: trial, trimmed range and why. Ranges are BVH frame
// numbers at 120 fps (frame 0 is cgspeed's added T-pose and is never used).

export interface ClipSpec {
  /** Output name (motion/<name>.json). */
  name: string;
  /** The Anim it is for (contract.ts name). */
  anim: 'Idle' | 'Walk' | 'Run' | 'Attack' | 'Shoot' | 'Hit' | 'Die' | 'Brace';
  /** CMU trial, e.g. "35_01". */
  trial: string;
  /** CMU's description of the trial. */
  description: string;
  /** Painted frames (frames.ts). */
  frames: number;
  loop: boolean;
  /** Source frames [from, to]. A loop's `to` is one cycle after `from` (the same pose again). */
  range: [number, number];
  /** Piecewise-linear time map [[outFrame, srcFrame], ...] instead of an even spread (holds, accents). */
  timing?: [number, number][];
  /** How the forward direction is found: travel (locomotion), hips averaged, or hips at the start. */
  heading: 'travel' | 'hips' | 'start' | 'aim';
  /** For heading 'aim': the source frame whose right-hand → left-hand line is the aim. */
  aimFrame?: number;
  /** Extra turn of the heading (deg, + = turn the camera toward the subject's right). */
  yaw?: number;
  /** The subject acts with the left hand: mirror so the weapon side is near. */
  mirror?: boolean;
  /** Add a smear event over the fast frames of this hand, and a strike at the fastest. */
  smear?: 'N' | 'F';
  strikeName?: string;
  events?: { f: number; name: string; len?: number; bone?: string }[];
  /** Frames that must be keys. */
  keys?: number[];
  /** Key reduction tolerance (deg). */
  tolerance?: number;
  contactHeight?: number;
  contactSpeed?: number;
  why: string;
}

export const CLIPS: ClipSpec[] = [
  // ---------------------------------------------------------------- locomotion
  {
    name: 'walk',
    anim: 'Walk',
    trial: '08_01',
    description: 'walk',
    frames: 12,
    loop: true,
    range: [124, 248],
    heading: 'travel',
    why: 'One full stride (1.03 s) from right heel strike to the next, mid-trial. Subject 8 walks briskly (about 1.9 m/s) with a clear arm swing, which suits troops on the march; subject 35 (the cleanest set) barely swings the arms. Frame 0 is near-foot (right) contact.',
  },
  {
    name: 'march',
    anim: 'Walk',
    trial: '138_01',
    description: 'Marching',
    frames: 12,
    loop: true,
    range: [284, 432],
    heading: 'travel',
    why: 'One stride (1.23 s) of a parade march: high knee, straight swing arm. An alternative Walk for drilled infantry. Frame 0 is right heel strike.',
  },
  {
    name: 'run',
    anim: 'Run',
    trial: '09_02',
    description: 'run',
    frames: 12,
    loop: true,
    range: [35, 123],
    heading: 'travel',
    why: 'One stride (0.73 s) of a steady fast run with a clear flight phase and a 15° trunk lean; the trial is a single straight pass. Frame 0 is right foot strike.',
  },
  // ---------------------------------------------------------------- standing loops
  {
    name: 'idle',
    anim: 'Idle',
    trial: '137_28',
    description: 'Normal Wait',
    frames: 8,
    loop: true,
    range: [2233, 2425],
    heading: 'hips',
    tolerance: 3,
    why: '1.6 s (one Idle loop at 2 ticks a frame) of standing idle (the near hand rests on the hip: take the legs, pelvis and spine, not the arms): breathing and a slow weight shift with the feet still. Chosen by search as the window where the feet move least and the end pose matches the start. 141_20 (waiting) steps about too much for an idle loop, and the 140_06 subject stands hunched with bent knees (head at 12.4 of 14 units), which reads as a crouch.',
  },
  {
    name: 'brace',
    anim: 'Brace',
    trial: '77_03',
    description: 'ready stance',
    frames: 8,
    loop: true,
    range: [469, 565],
    heading: 'hips',
    tolerance: 3,
    why: '0.8 s (one Brace loop; the stillest window of the trial) of a crouched, careful ready stance: hips low (7.5 of 14 units), knees bent, weight central. The base for a pike or shield brace.',
  },
  // ---------------------------------------------------------------- melee
  {
    name: 'cut-overhead',
    anim: 'Attack',
    trial: '02_07',
    description: 'swordplay',
    frames: 12,
    loop: false,
    range: [1, 271],
    timing: [[0, 1], [3, 91], [7, 211], [8, 223], [11, 271]],
    heading: 'hips',
    events: [{ f: 7, name: 'strike' }],
    smear: 'N',
    why: 'A two-handed vertical cut: guard (frame 1), the hands rise above the head (91, anticipation), the cut falls with the hips turning 30° (121-211), the blade ends low (211, impact, held one frame), then recovers. The slow kata timing is compressed into the anticipation-strike-hold layout of a game attack.',
  },
  {
    name: 'cut-diagonal',
    anim: 'Attack',
    trial: '02_07',
    description: 'swordplay',
    frames: 12,
    loop: false,
    range: [1036, 1246],
    timing: [[0, 1036], [3, 1066], [7, 1156], [8, 1171], [11, 1246]],
    heading: 'hips',
    events: [{ f: 7, name: 'strike' }],
    smear: 'N',
    why: 'A diagonal descending cut with a big hip turn (yaw from -13° to -70°), read best in three-quarter view (a Zornhau-like line). Same layout: ready, wind-up, strike, impact hold, recover.',
  },
  {
    name: 'chop',
    anim: 'Attack',
    trial: '79_01',
    description: 'chopping wood',
    frames: 12,
    loop: false,
    range: [261, 401],
    timing: [[0, 261], [4, 327], [7, 351], [8, 361], [11, 401]],
    heading: 'hips',
    events: [{ f: 7, name: 'strike' }],
    smear: 'N',
    why: 'An overhead two-handed axe chop: the axe rises past vertical (to 331), the body drops into the blow (331-351, the fastest frames of the whole set at 56 units/s), the head stops at the block and the body settles. For axes, maces and war hammers.',
  },
  {
    name: 'thrust',
    anim: 'Attack',
    trial: '143_23',
    description: 'Punching',
    frames: 12,
    loop: false,
    range: [277, 361],
    timing: [[0, 277], [3, 301], [5, 313], [6, 319], [11, 361]],
    heading: 'hips',
    events: [{ f: 5, name: 'strike' }],
    smear: 'N',
    why: 'A right cross: the rear foot and hip drive (yaw -100° to -81°), the hand goes straight out (313), holds, and comes back slower. The closest captured motion to a spear or sword thrust; the point must travel in a straight line.',
  },
  // ---------------------------------------------------------------- missile
  {
    name: 'bow',
    anim: 'Shoot',
    trial: '79_86',
    description: 'shooting bow and arrow',
    frames: 12,
    loop: false,
    range: [265, 589],
    timing: [[0, 265], [2, 301], [4, 337], [6, 445], [7, 457], [8, 469], [11, 589]],
    heading: 'aim',
    aimFrame: 400,
    events: [{ f: 7, name: 'release' }],
    why: 'A mimed bow shot: nocked (265), the bow comes up and the draw opens (301-337), full draw is held (337-445, compressed), the loose (457) and the follow-through, then the bow lowers. Projected along the arrow line (right hand to left hand at full draw), so the archer stands side-on as real archers do.',
  },
  {
    name: 'gun',
    anim: 'Shoot',
    trial: '79_96',
    description: 'shooting a gun',
    frames: 12,
    loop: false,
    range: [181, 493],
    timing: [[0, 181], [3, 241], [5, 361], [6, 381], [7, 389], [8, 397], [9, 409], [11, 493]],
    heading: 'aim',
    aimFrame: 300,
    events: [{ f: 6, name: 'release' }],
    why: 'A mimed long gun: raised to the shoulder (193-253), aimed (265-373, compressed), fired (about 383: the support hand jumps at 17 units/s, the recoil), then lowered. For the teppō and crossbows.',
  },
  {
    name: 'javelin',
    anim: 'Shoot',
    trial: '124_01',
    description: 'Baseball Pitch',
    frames: 12,
    loop: false,
    range: [373, 541],
    timing: [[0, 373], [2, 409], [4, 433], [5, 445], [7, 469], [11, 541]],
    heading: 'travel',
    events: [{ f: 5, name: 'release' }],
    smear: 'N',
    strikeName: 'release',
    why: 'An overhand throw from the withdrawn arm: the stride leg lands as a block (433), the release over it (445, the hand at 76 units/s), the follow-through with the rear leg swinging through. The pitch wind-up (leg kick) is trimmed off; javelins are thrown from a step.',
  },
  // ---------------------------------------------------------------- hit and death
  {
    name: 'hit',
    anim: 'Hit',
    trial: '77_09',
    description: 'duck to avoid flying object',
    frames: 5,
    loop: false,
    range: [217, 241],
    timing: [[0, 217], [1, 225], [2, 229], [4, 219]],
    heading: 'hips',
    why: 'The first 0.1 s of a sudden flinch (peak at 229, before it becomes a full duck): hips drop, head ducks, arms come in, then back. CMU has no trials of being struck, so this is the closest real reaction. Add the snap-back of the struck shoulder from the brief (Muybridge plate "one hits the other").',
  },
  {
    name: 'die-back',
    anim: 'Die',
    trial: '90_18',
    description: 'RugPullFall',
    frames: 12,
    loop: false,
    range: [61, 241],
    timing: [[0, 61], [2, 81], [5, 111], [7, 131], [8, 141], [10, 171], [11, 241]],
    heading: 'hips',
    why: 'A real backward fall: the feet go out forward, the hips drop (111-131) and hit (131), the back lands with a small bounce (141), the legs drop, the body settles flat. The fastest part runs at game speed; the settle is compressed.',
  },
  {
    name: 'die-forward',
    anim: 'Die',
    trial: '140_01',
    description: 'Get Up Face Down (reversed)',
    frames: 12,
    loop: false,
    range: [121, 556],
    timing: [[0, 556], [2, 496], [4, 436], [6, 376], [8, 286], [10, 196], [11, 121]],
    heading: 'start',
    why: 'CMU has no forward collapse, so this is a get-up from face down played backwards: the knees give (496-436), the hands go down (376), the body lies prone (121). Reversed, the weight still reads right because a controlled get-up and a slumping fall pass through the same poses; add a faster first half when hand-keying.',
  },
  {
    name: 'die-crumple',
    anim: 'Die',
    trial: '85_15',
    description: '90TwistsFall',
    frames: 12,
    loop: false,
    range: [261, 431],
    timing: [[0, 261], [3, 301], [6, 341], [9, 381], [11, 431]],
    heading: 'hips',
    why: 'Knees fold and the body sinks onto one hand (hips from 7.3 to 3.0 units): the slump of a man losing his legs rather than being thrown.',
  },
];
