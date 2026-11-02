// The finish over every scene: a cold-shadow, warm-light grade, a heavy vignette, film grain
// and faint scanlines. `Post` does it with canvas compositing (the city view); `GlPost` does it
// in one shader while blowing the battle's low-resolution buffer up to the page.

import { compile } from './gl.ts';

export class Post {
  private grain: HTMLCanvasElement[] = [];
  private vignette: { w: number; h: number; canvas: HTMLCanvasElement } | null = null;
  private frame = 0;

  constructor() {
    for (let k = 0; k < 4; k++) {
      const c = document.createElement('canvas');
      c.width = c.height = 192;
      const ctx = c.getContext('2d')!;
      const img = ctx.createImageData(c.width, c.height);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = Math.random() * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      this.grain.push(c);
    }
  }

  private vignetteFor(w: number, h: number): HTMLCanvasElement {
    if (this.vignette && this.vignette.w === w && this.vignette.h === h) return this.vignette.canvas;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.7, 'rgba(6,4,2,0.38)');
    g.addColorStop(1, 'rgba(4,2,1,0.82)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    this.vignette = { w, h, canvas: c };
    return c;
  }

  apply(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, px: number, scanlines: boolean): void {
    ctx.save();
    // Grade: lift the light toward amber, push the shadows toward teal.
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(214,150,80,0.38)';
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(150,170,175,0.22)';
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.vignetteFor(w, h), x, y);
    // Grain, a fresh tile each frame.
    this.frame = (this.frame + 1) % 4;
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = 0.09;
    const tile = this.grain[this.frame]!;
    const ox = Math.floor(Math.random() * tile.width);
    const oy = Math.floor(Math.random() * tile.height);
    for (let ty = y - oy; ty < y + h; ty += tile.height) for (let tx = x - ox; tx < x + w; tx += tile.width) ctx.drawImage(tile, tx, ty);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (scanlines && px >= 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.13)';
      for (let sy = y; sy < y + h; sy += px) ctx.fillRect(x, sy + px - 1, w, 1);
    }
    ctx.restore();
  }
}

const POST_VS = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID & 1) << 2) - 1.0, float((gl_VertexID & 2) << 1) - 1.0);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

const POST_FS = `#version 300 es
precision highp float;
uniform sampler2D u_scene;
uniform vec2 u_out;     // canvas size, device px
uniform vec2 u_off;     // device px of the buffer's top-left on the canvas
uniform float u_px;     // device px per buffer px
uniform float u_time;
uniform float u_scan;
out vec4 o;

float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

vec3 fetch(vec2 dev) {
  ivec2 size = textureSize(u_scene, 0);
  ivec2 t = ivec2(floor((dev - u_off) / u_px));
  t = clamp(t, ivec2(0), size - 1);
  return texelFetch(u_scene, t, 0).rgb;
}

void main() {
  vec2 dev = vec2(gl_FragCoord.x, u_out.y - gl_FragCoord.y);
  vec2 uv = dev / u_out;
  vec2 fromC = uv - 0.5;
  float edge = dot(fromC, fromC);
  // A faint chromatic split toward the corners, a whole device pixel at most.
  float ca = floor(edge * 4.0 + 0.3);
  vec2 cdir = sign(fromC) * ca;
  vec3 c = vec3(fetch(dev + cdir).r, fetch(dev).g, fetch(dev - cdir).b);

  float l = dot(c, vec3(0.299, 0.587, 0.114));
  // Slight desaturation and contrast.
  c = mix(vec3(l), c, 0.86);
  c = (c - 0.5) * 1.08 + 0.5;
  // Split tone: teal shadows, amber highlights.
  vec3 cool = vec3(0.80, 0.94, 1.10);
  vec3 warm = vec3(1.12, 1.00, 0.80);
  c *= mix(cool, warm, smoothstep(0.08, 0.6, l));
  c *= 1.12;
  // Haze toward the far edge of the field.
  c = mix(c, vec3(0.42, 0.44, 0.44), (1.0 - uv.y) * 0.10);
  // Vignette.
  float v = smoothstep(0.9, 0.25, length(fromC * vec2(1.0, 0.85)) * 1.1);
  c *= mix(0.35, 1.0, v);
  // Grain.
  float g = hash(dev + fract(u_time) * 97.0) - 0.5;
  c += g * 0.055;
  // Scanlines: darken the last device row of each buffer row.
  if (u_scan > 0.5 && u_px >= 3.0) {
    float row = mod(dev.y - u_off.y, u_px);
    if (row >= u_px - 1.0) c *= 0.84;
  }
  o = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export class GlPost {
  private readonly prog: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly u: Record<string, WebGLUniformLocation | null> = {};

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, POST_VS, POST_FS);
    this.vao = gl.createVertexArray()!;
    for (const k of ['u_scene', 'u_out', 'u_off', 'u_px', 'u_time', 'u_scan']) this.u[k] = gl.getUniformLocation(this.prog, k);
  }

  /** Draws `scene` (a w×h buffer) onto the canvas at `px` device pixels per buffer pixel. */
  apply(scene: WebGLTexture, outW: number, outH: number, offX: number, offY: number, px: number, time: number, scanlines: boolean): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, outW, outH);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, scene);
    gl.uniform1i(this.u.u_scene!, 0);
    gl.uniform2f(this.u.u_out!, outW, outH);
    gl.uniform2f(this.u.u_off!, offX, offY);
    gl.uniform1f(this.u.u_px!, px);
    gl.uniform1f(this.u.u_time!, time);
    gl.uniform1f(this.u.u_scan!, scanlines ? 1 : 0);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  dispose(): void {
    this.gl.deleteProgram(this.prog);
    this.gl.deleteVertexArray(this.vao);
  }
}
