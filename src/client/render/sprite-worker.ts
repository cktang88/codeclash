// Paints HD sprite sheets off the main thread (see sprites128.ts): one kind at one level per message.

import { sheetFor } from './sprites128.ts';
import { halveSheet } from './downscale.ts';
import type { KindSheet } from './contract.ts';

interface Req {
  faction: string;
  hue: number;
  kind: number;
  level: number;
  /** HD 64: paint level 2×level and halve it with the pixel-art reduction (downscale.ts). */
  half?: boolean;
  /** HD 64: the level-2×level sheet, already painted: only halve it. */
  from?: KindSheet;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { faction, hue, kind, level, half, from } = e.data;
  // Level 1 is the classic-size grid strip; the rest are packed hi-res sheets.
  const sheet = from ? halveSheet(from) : sheetFor(faction, hue, kind, level, half);
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(sheet, [sheet.pixels.buffer, sheet.rects.buffer]);
};
