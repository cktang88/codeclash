import { BlurFilter, Container, type Rectangle, Filter, GlProgram, Matrix, RenderTexture, Sprite, UniformGroup, defaultFilterVert, type Renderer } from 'pixi.js';

// The field's final pass, after docs/art-direction.md §2 and §5 ("the HDR look"):
//
// - Bloom on emissives only. The emissive layers (torches, window and shrine lights, fire,
//   fireballs, breath, sparks, gold motes) are rendered a second time into a half-resolution
//   target, blurred and added back over the field. Ordinary terrain, units and vellum never
//   bloom, because they are never drawn into that target: no bright-pass threshold to tune.
// - A filmic tone curve and vibrance over the whole composite: a gentle S-curve that deepens the
//   ink floor and rolls highlights off rather than clipping, then vibrance (saturation added most
//   where colour is weakest, and least to warm skin-like hues) instead of a flat saturation boost.
//
// Off under prefers-reduced-motion, with ?lowfx, on software renderers, and whenever frames
// run slow; ?hdr forces it on (for captures on a software renderer).

const FRAGMENT = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float uCurve;
uniform float uVibrance;
uniform float uFloor;

void main(void) {
  vec4 c = texture(uTexture, vTextureCoord);
  vec3 col = c.a > 0.0 ? c.rgb / c.a : c.rgb;
  // Vibrance: lift saturation most where it is weakest; spare warm, skin-like hues.
  float mx = max(col.r, max(col.g, col.b));
  float mn = min(col.r, min(col.g, col.b));
  float sat = mx - mn;
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float warm = clamp((col.r - col.b) * 2.0, 0.0, 1.0) * clamp(1.0 - abs(col.g - (col.r + col.b) * 0.5) * 4.0, 0.0, 1.0);
  float vib = uVibrance * (1.0 - sat) * (1.0 - 0.6 * warm);
  col = mix(vec3(luma), col, 1.0 + vib);
  // Filmic: a soft S-curve around the mid-tones with a shoulder that rolls highlights off and a
  // toe that keeps the ink floor deep (never lifted).
  vec3 s = col * col * (3.0 - 2.0 * col);
  col = mix(col, s, uCurve);
  col = max(col - uFloor, 0.0) / (1.0 - uFloor);
  col = clamp(col, 0.0, 1.0);
  finalColor = vec4(col * c.a, c.a);
}
`;

/** A strength for each part of the pass; 0 turns a part off. */
export interface PostLook {
  /** Mix toward the filmic S-curve. */
  curve: number;
  vibrance: number;
  /** Ink floor: values below are pressed to black. */
  floor: number;
  /** Additive strength of the emissive bloom. */
  bloom: number;
}

export const POST_LOOK: PostLook = { curve: 0.28, vibrance: 0.22, floor: 0.012, bloom: 0.95 };

/** Frames slower than this (ms, smoothed) for a while turn the pass off. */
const SLOW_MS = 30;
const SLOW_FOR_MS = 2500;

export class PostFx {
  private readonly filter: Filter;
  private readonly uniforms: UniformGroup;
  private rt: RenderTexture | null = null;
  readonly bloom = new Sprite();
  private readonly blur = new BlurFilter({ strength: 7, quality: 3 });
  private readonly m = new Matrix();
  private slowFor = 0;
  private on = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly stage: Container,
    private readonly emissive: readonly Container[],
    /** Whether the pass may run at all; false pins it off. */
    private allowed: boolean,
    /** Pinned on, regardless of frame time: ?hdr. */
    private readonly forced = false,
    private readonly look: PostLook = POST_LOOK,
  ) {
    this.uniforms = new UniformGroup({
      uCurve: { value: look.curve, type: 'f32' },
      uVibrance: { value: look.vibrance, type: 'f32' },
      uFloor: { value: look.floor, type: 'f32' },
    });
    this.filter = new Filter({
      glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment: FRAGMENT, name: 'field-grade' }),
      resources: { postUniforms: this.uniforms },
    });
    this.blur.resolution = 0.5;
    this.bloom.blendMode = 'add';
    this.bloom.filters = [this.blur];
    this.bloom.visible = false;
    stage.addChild(this.bloom);
    this.setEnabled(allowed);
  }

  get enabled(): boolean {
    return this.on;
  }

  /** Reduced motion or a settings change: off (or back on, if the machine allows it). */
  setAllowed(allowed: boolean): void {
    this.allowed = allowed;
    this.setEnabled(allowed);
  }

  private setEnabled(on: boolean): void {
    this.on = on;
    this.stage.filters = on ? [this.filter] : [];
    // The pass covers the screen: never let Pixi measure the whole stage's bounds each frame.
    this.stage.filterArea = on ? this.renderer.screen : (undefined as unknown as Rectangle);
    this.bloom.visible = on && this.look.bloom > 0;
  }

  /**
   * Call once per frame, after every layer is updated: watches frame time and renders the
   * emissive layers into the bloom target with the camera's transform at half resolution.
   */
  update(dtMs: number, width: number, height: number, zoom: number, x: number, y: number): void {
    if (this.on && !this.forced) {
      this.slowFor = dtMs > SLOW_MS ? this.slowFor + dtMs : Math.max(0, this.slowFor - dtMs * 0.5);
      if (this.slowFor > SLOW_FOR_MS) this.setEnabled(false);
    }
    if (!this.on || this.look.bloom <= 0) return;
    const w = Math.max(1, Math.ceil(width / 2));
    const h = Math.max(1, Math.ceil(height / 2));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.destroy(true);
      this.rt = RenderTexture.create({ width: w, height: h, resolution: 1 });
      this.bloom.texture = this.rt;
    }
    this.m.set(zoom * 0.5, 0, 0, zoom * 0.5, x * 0.5, y * 0.5);
    let first = true;
    for (const c of this.emissive) {
      if (!c.visible || c.children.length === 0) continue;
      this.renderer.render({ container: c, target: this.rt, clear: first, transform: this.m });
      first = false;
    }
    if (first) this.renderer.render({ container: new Container(), target: this.rt, clear: true });
    this.bloom.scale.set(2);
    this.bloom.alpha = this.look.bloom;
  }

  destroy(): void {
    this.stage.filters = [];
    this.bloom.destroy();
    this.rt?.destroy(true);
    this.rt = null;
  }
}

/** Whether this machine and page should run the pass: not on ?lowfx, software GL or reduced motion. */
export function postAllowed(renderer: Renderer, reducedMotion: boolean): { allowed: boolean; forced: boolean } {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
  if (q.has('lowfx')) return { allowed: false, forced: false };
  if (q.has('hdr')) return { allowed: true, forced: true };
  if (reducedMotion) return { allowed: false, forced: false };
  let software = false;
  try {
    const gl = (renderer as unknown as { gl?: WebGLRenderingContext }).gl;
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    const name = info && gl ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
    software = /swiftshader|llvmpipe|software|basic render/i.test(name);
  } catch {
    software = false;
  }
  return { allowed: !software, forced: false };
}
