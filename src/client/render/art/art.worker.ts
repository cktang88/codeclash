// Bakes unit art (bake.ts) on an OffscreenCanvas, off the main thread, and hands the pages back
// as ImageBitmaps (transferred, not copied).
import { bakeKindPages, offscreenCanvas } from './bake.ts';

const scope = self as unknown as { onmessage: ((e: MessageEvent<{ kind: number; res: number }>) => void) | null; postMessage(msg: unknown, transfer: Transferable[]): void };

scope.onmessage = (e) => {
  const { kind, res } = e.data;
  try {
    const b = bakeKindPages(kind, res, offscreenCanvas);
    const pages = b.pages.map((c) => (c as OffscreenCanvas).transferToImageBitmap());
    scope.postMessage({ ...b, pages }, pages);
  } catch (err) {
    scope.postMessage({ kind, error: err instanceof Error ? err.message : String(err) }, []);
  }
};
