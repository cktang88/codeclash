import { Container, NineSliceSprite, Text, type TextStyleOptions } from 'pixi.js';
import { siteArt } from './siteart.ts';
import { DISPLAY_FONT } from './terrain.ts';

// Map labels are lettered on little vellum scrolls in ink. They are drawn at a
// constant screen size (counter-scaled against the camera zoom), never below
// 15px, and give way to each other politely: when two would overlap, the
// lower-priority label drops its second line first, then hides.

const TITLE: TextStyleOptions = {
  fontFamily: DISPLAY_FONT,
  fontSize: 18,
  fill: 0x22180f,
  letterSpacing: 0.4,
};
const SUB: TextStyleOptions = {
  fontFamily: 'Alegreya, Georgia, serif',
  fontStyle: 'italic',
  fontSize: 15,
  fill: 0x4a3a28,
};
const PAD_X = 16;
const PAD_Y = 5;

export class MapLabel {
  readonly root = new Container();
  private readonly bg: NineSliceSprite;
  private readonly title: Text;
  private readonly sub: Text;
  private titleText = '';
  private subText = '';
  private showSub = false;
  private w = 0;
  private h = 0;
  /** World anchor: the bottom centre of the scroll. */
  x = 0;
  y = 0;
  priority = 0;
  wanted = true;
  /** Ink colour of the title: plain ink, or vermilion for rubricated names (the leader). */
  private rubric = false;
  readonly titleSize: number;

  constructor(titleSize = 18) {
    this.titleSize = titleSize;
    const art = siteArt();
    this.bg = new NineSliceSprite({ texture: art.cartouche, leftWidth: art.cartoucheSlice.left, rightWidth: art.cartoucheSlice.right, topHeight: art.cartoucheSlice.top, bottomHeight: art.cartoucheSlice.bottom });
    this.title = new Text({ text: '', style: { ...TITLE, fontSize: titleSize }, resolution: 2 });
    this.sub = new Text({ text: '', style: SUB, resolution: 2 });
    this.title.anchor.set(0.5, 0);
    this.sub.anchor.set(0.5, 0);
    this.root.addChild(this.bg, this.title, this.sub);
  }

  set(title: string, sub: string, rubric = false): void {
    let dirty = false;
    if (title !== this.titleText) {
      this.titleText = title;
      this.title.text = title;
      dirty = true;
    }
    if (sub !== this.subText) {
      this.subText = sub;
      this.sub.text = sub;
      dirty = true;
    }
    if (rubric !== this.rubric) {
      this.rubric = rubric;
      this.title.style.fill = rubric ? 0xb8321f : 0x22180f;
    }
    if (dirty) this.layout();
  }

  private layout(): void {
    const sub = this.showSub && this.subText !== '';
    const tw = this.title.width;
    const sw = sub ? this.sub.width : 0;
    this.w = Math.max(tw, sw) + PAD_X * 2;
    this.h = this.title.height + (sub ? this.sub.height - 2 : 0) + PAD_Y * 2;
    this.bg.width = this.w;
    this.bg.height = this.h;
    this.bg.position.set(-this.w / 2, -this.h);
    this.title.position.set(0, -this.h + PAD_Y);
    this.sub.position.set(0, -this.h + PAD_Y + this.title.height - 3);
    this.sub.visible = sub;
  }

  setSub(on: boolean): void {
    if (on === this.showSub) return;
    this.showSub = on;
    this.layout();
  }

  get width(): number {
    return this.w;
  }

  get height(): number {
    return this.h;
  }

  get hasSub(): boolean {
    return this.subText !== '';
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Lays out every map label each frame: counter-scaled, then decluttered by priority in screen space. */
export class LabelLayer {
  readonly root = new Container();
  private labels: MapLabel[] = [];
  private order: MapLabel[] = [];
  private boxes: Box[] = [];
  private used = 0;

  add(label: MapLabel): MapLabel {
    this.labels.push(label);
    this.root.addChild(label.root);
    return label;
  }

  remove(label: MapLabel): void {
    const i = this.labels.indexOf(label);
    if (i >= 0) this.labels.splice(i, 1);
    label.destroy();
  }

  /**
   * @param compact on a phone-sized screen labels letter a size smaller, but never below the
   * 15px floor for world labels.
   */
  layout(zoom: number, wantSub: (l: MapLabel) => boolean, compact = false): void {
    this.order.length = 0;
    for (const l of this.labels) {
      const k = (compact ? Math.min(1, Math.max(0.82, 15 / l.titleSize)) : 1) / zoom;
      l.root.scale.set(k);
      l.root.position.set(l.x, l.y);
      l.root.visible = false;
      if (l.wanted) this.order.push(l);
    }
    this.order.sort((a, b) => b.priority - a.priority);
    this.used = 0;
    for (const l of this.order) {
      l.setSub(wantSub(l));
      const cx = l.x * zoom;
      const cy = l.y * zoom;
      const u = l.root.scale.x * zoom;
      let box = this.box(cx - (l.width * u) / 2, cy - l.height * u, cx + (l.width * u) / 2, cy);
      if (this.hits(box)) {
        if (!l.hasSub) continue;
        l.setSub(false);
        box = this.box(cx - (l.width * u) / 2, cy - l.height * u, cx + (l.width * u) / 2, cy);
        if (this.hits(box)) continue;
      }
      this.used++;
      l.root.visible = true;
    }
  }

  private box(x0: number, y0: number, x1: number, y1: number): Box {
    let b = this.boxes[this.used];
    if (!b) {
      b = { x0, y0, x1, y1 };
      this.boxes.push(b);
    } else {
      b.x0 = x0;
      b.y0 = y0;
      b.x1 = x1;
      b.y1 = y1;
    }
    return b;
  }

  private hits(b: Box): boolean {
    for (let i = 0; i < this.used; i++) {
      const p = this.boxes[i]!;
      if (b.x0 < p.x1 + 3 && b.x1 > p.x0 - 3 && b.y0 < p.y1 + 2 && b.y1 > p.y0 - 2) return true;
    }
    return false;
  }

  destroy(): void {
    for (const l of this.labels) l.destroy();
    this.labels = [];
    this.root.destroy({ children: true });
  }
}
