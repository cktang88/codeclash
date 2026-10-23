import { CUES } from './catalog.ts';
import { SoundEngine } from './engine.ts';

export type { PlayOptions } from './engine.ts';
export { SoundEngine };

/** Every cue the game can play. */
export const CUE_NAMES = Object.keys(CUES);

/** The game's one sound engine. Silent until the player turns sound on. */
export const sound = new SoundEngine();
export const audio = sound;
