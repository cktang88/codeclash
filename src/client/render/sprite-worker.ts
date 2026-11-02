// Paints HD sprite sheets off the main thread (see sprites128.ts): one kind at one level per message.

import { paintSheet } from './sprites128.ts';

interface Req {
  faction: string;
  hue: number;
  kind: number;
  level: number;
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { faction, hue, kind, level } = e.data;
  const sheet = paintSheet(faction, hue, kind, level);
  (self as unknown as { postMessage(m: unknown, t: Transferable[]): void }).postMessage(sheet, [sheet.pixels.buffer, sheet.rects.buffer]);
};
