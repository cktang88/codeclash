// The one bit of the DOM the city painters use, for the build worker: `document.createElement('canvas')`
// gives an OffscreenCanvas (the same 300×150 default as a canvas element). Imported first.

const g = globalThis as unknown as { document?: unknown };
if (typeof g.document === 'undefined')
  g.document = {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`worker-dom: no <${tag}> in a worker`);
      return new OffscreenCanvas(300, 150);
    },
  };

export {};
