// Thin WebGL2 plumbing for the battle renderer: shader programs, textures, render targets and
// an instanced sprite batch. Every sprite, shadow, particle and decal is one instanced quad.
//
// Offscreen targets (the scene buffer, the ground) keep row 0 at the top: map pixel y grows
// downward and maps to NDC y = -1 at the top row. Only the final post pass writes the canvas.

/** Floats per sprite instance. */
export const INST = 16;

export interface Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture;
  rb: WebGLRenderbuffer | null;
  w: number;
  h: number;
}

export function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const mk = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`shader: ${gl.getShaderInfoLog(s)}\n${src}`);
    return s;
  };
  const p = gl.createProgram()!;
  const v = mk(gl.VERTEX_SHADER, vs);
  const f = mk(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  // The linked program keeps what it needs: free the shader objects, or each scene leaks two.
  gl.detachShader(p, v);
  gl.detachShader(p, f);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`link: ${gl.getProgramInfoLog(p)}`);
  return p;
}

export function texture(gl: WebGL2RenderingContext, src: TexImageSource | null, w = 0, h = 0): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (src) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/** A texture from raw RGBA pixels (an HD sprite sheet). */
export function texturePixels(gl: WebGL2RenderingContext, w: number, h: number, pixels: Uint8ClampedArray): WebGLTexture {
  const t = texture(gl, null, w, h);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength));
  return t;
}

/** A colour texture to render into, with a depth+stencil buffer when asked. */
export function target(gl: WebGL2RenderingContext, w: number, h: number, depth: boolean, tex?: WebGLTexture): Target {
  const t = tex ?? texture(gl, null, w, h);
  const fbo = gl.createFramebuffer()!;
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
  let rb: WebGLRenderbuffer | null = null;
  if (depth) {
    rb = gl.createRenderbuffer()!;
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, rb);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fbo, tex: t, rb, w, h };
}

export function dropTarget(gl: WebGL2RenderingContext, t: Target): void {
  gl.deleteFramebuffer(t.fbo);
  gl.deleteTexture(t.tex);
  if (t.rb) gl.deleteRenderbuffer(t.rb);
}

// ------------------------------------------------------------------ sprite shaders

/**
 * Textures one sprite draw call can sample (WebGL2 guarantees 16 fragment units). The fragment
 * shader picks one by branching, and a SIMD rasteriser (SwiftShader) pays for every branch: on
 * software GL 8 cost ~10% more GPU time a frame than 2, 4 about 3%, for half the draw calls of 2.
 */
export const PARTS = 4;
/** u_end of a part that never ends (every later instance is still in it). */
const NO_END = 0x7fffffff;

const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 i_dst;  // anchor x, y (map px), quad w, h
layout(location=2) in vec4 i_src;  // texel u, v of the cell, anchor offset inside the cell
layout(location=3) in vec4 i_col;  // tint rgba
layout(location=4) in vec4 i_ext;  // depth y (map px), flash, mode (0 tex, 1 solid, 2 aged blood), flags (1 = no shadow)
uniform vec2 u_cam;    // map px at the target's top-left
uniform vec2 u_view;   // target size in px
uniform vec2 u_z;      // depth range in map px (far, near)
uniform vec2 u_shear;  // shadow pass: ground offset per pixel of height; (0,0) = normal pass
uniform float u_shadow;
uniform float u_scale; // target px per map px (HD zoom draws the map larger than one px per map px)
uniform float u_now;   // battle seconds, for mode 2 (a blood decal whose 'flash' is the second it fell)
// One draw can take its instances from up to PARTS textures: part k is instances
// [u_end[k-1], u_end[k]) and samples unit k; per part, the texture's size and (texels per map px,
// scale of the instances' texel coords: an upscaled copy of a sheet has its factor).
uniform vec2 u_texs[${PARTS}];
uniform vec2 u_tsc[${PARTS}];
uniform int u_end[${PARTS - 1}];
out vec2 v_uv;
out vec4 v_col;
out vec2 v_ext;
flat out int v_slot;
void main() {
  int slot = 0;
  for (int k = 0; k < ${PARTS - 1}; k++) slot += gl_InstanceID >= u_end[k] ? 1 : 0;
  v_slot = slot;
  vec2 local = a_corner * i_dst.zw;
  vec2 rel = local - i_src.zw;
  vec2 p;
  if (u_shadow > 0.5) {
    if (i_ext.w > 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float h = -rel.y;
    p = i_dst.xy + vec2(rel.x + h * u_shear.x, h * u_shear.y);
  } else {
    p = i_dst.xy + rel;
  }
  vec2 n = (p - u_cam) * u_scale / u_view * 2.0 - 1.0;
  float z = 1.0 - 2.0 * clamp((i_ext.x - u_z.x) / (u_z.y - u_z.x), 0.0, 1.0);
  gl_Position = vec4(n, z * 0.999, 1.0);
  v_uv = (i_src.xy * u_tsc[slot].y + local * u_tsc[slot].x) / u_texs[slot];
  v_col = i_col;
  v_ext = i_ext.yz;
  if (i_ext.z > 1.5) {
    // Blood darkens from red to maroon-brown over about a minute.
    float age = clamp((u_now - i_ext.y) / 50.0, 0.0, 1.0);
    float k = 1.0 - age * 0.45;
    v_col = vec4(k, k * (1.0 - age * 0.25), k * (1.0 - age * 0.15), i_col.a);
    v_ext = vec2(0.0);
  }
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_img[${PARTS}];
uniform float u_shadow;
uniform vec4 u_shadowCol;
in vec2 v_uv;
in vec4 v_col;
in vec2 v_ext;
flat in int v_slot;
out vec4 o;
void main() {
  if (v_ext.y > 0.5) {
    if (u_shadow > 0.5) discard;
    o = v_col;
    return;
  }
  vec4 c;
  // Nearest sampling without mipmaps: no derivatives needed, so the branch is safe.
  ${Array.from({ length: PARTS }, (_, k) => `${k ? 'else ' : ''}${k < PARTS - 1 ? `if (v_slot == ${k}) ` : ''}c = texture(u_img[${k}], v_uv);`).join('\n  ')}
  if (c.a < 0.5) discard;
  if (u_shadow > 0.5) { o = u_shadowCol; return; }
  vec3 rgb = mix(c.rgb * v_col.rgb, vec3(1.0, 0.96, 0.9), v_ext.x);
  o = vec4(rgb, v_col.a);
}`;

/** Points instance attributes 1-4 of the bound VAO at `buf`, starting at instance `first`. */
function instanceAttribs(gl: WebGL2RenderingContext, buf: WebGLBuffer, first: number): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  for (let k = 0; k < 4; k++) gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, INST * 4, first * INST * 4 + k * 16);
}

function instanceVao(gl: WebGL2RenderingContext, corners: WebGLBuffer, buf: WebGLBuffer): WebGLVertexArrayObject {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, corners);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  for (let k = 0; k < 4; k++) {
    gl.enableVertexAttribArray(1 + k);
    gl.vertexAttribDivisor(1 + k, 1);
  }
  instanceAttribs(gl, buf, 0);
  gl.bindVertexArray(null);
  return vao;
}

/**
 * One growable list of sprite instances, drawn with one texture in one call, or handed to a
 * `SpriteStream` with others. Its GPU buffer is made on first upload (a batch that only ever goes
 * through a stream has none).
 */
export class Batch {
  data: Float32Array;
  n = 0;
  private vao: WebGLVertexArrayObject | null = null;
  private buf: WebGLBuffer | null = null;
  private gpuCap = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly corners: WebGLBuffer,
    cap = 1024,
  ) {
    this.data = new Float32Array(cap * INST);
  }

  clear(): void {
    this.n = 0;
  }

  /** Room for one more instance; returns its float offset. */
  alloc(): number {
    if ((this.n + 1) * INST > this.data.length) {
      const next = new Float32Array(this.data.length * 2);
      next.set(this.data);
      this.data = next;
    }
    return this.n++ * INST;
  }

  /** A textured sprite: cell at (u, v) of size w×h whose point (ax, ay) lands on map (x, y). */
  sprite(x: number, y: number, u: number, v: number, w: number, h: number, ax: number, ay: number, depth: number, r = 1, g = 1, b = 1, a = 1, flash = 0, noShadow = 0): void {
    const o = this.alloc();
    const d = this.data;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = w;
    d[o + 3] = h;
    d[o + 4] = u;
    d[o + 5] = v;
    d[o + 6] = ax;
    d[o + 7] = ay;
    d[o + 8] = r;
    d[o + 9] = g;
    d[o + 10] = b;
    d[o + 11] = a;
    d[o + 12] = depth;
    d[o + 13] = flash;
    d[o + 14] = 0;
    d[o + 15] = noShadow;
  }

  /** A solid rectangle with its top-left at map (x, y). */
  rect(x: number, y: number, w: number, h: number, depth: number, r: number, g: number, b: number, a: number): void {
    const o = this.alloc();
    const d = this.data;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = w;
    d[o + 3] = h;
    d[o + 4] = 0;
    d[o + 5] = 0;
    d[o + 6] = 0;
    d[o + 7] = 0;
    d[o + 8] = r;
    d[o + 9] = g;
    d[o + 10] = b;
    d[o + 11] = a;
    d[o + 12] = depth;
    d[o + 13] = 0;
    d[o + 14] = 1;
    d[o + 15] = 1;
  }

  private ensureGl(): WebGLBuffer {
    if (!this.buf) {
      this.buf = this.gl.createBuffer()!;
      this.vao = instanceVao(this.gl, this.corners, this.buf);
    }
    return this.buf;
  }

  /** Sends the instances to the GPU: all of them, or only those from instance `from` on. */
  upload(from = 0): void {
    // Nothing to draw, nothing to send (draw() skips an empty batch).
    if (this.n === 0) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ensureGl());
    if (this.data.byteLength > this.gpuCap) {
      // Grown: the GPU copy is reallocated (and so emptied): all of it goes up again.
      gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.STREAM_DRAW);
      this.gpuCap = this.data.byteLength;
      from = 0;
    }
    if (from < this.n) gl.bufferSubData(gl.ARRAY_BUFFER, from * INST * 4, this.data, from * INST, (this.n - from) * INST);
  }

  /** Sends instances [lo, hi) to the GPU (everything if its copy has to grow first). */
  uploadRange(lo: number, hi: number): void {
    if (!this.buf || this.data.byteLength > this.gpuCap) return this.upload();
    hi = Math.min(hi, this.n);
    if (hi <= lo) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, lo * INST * 4, this.data, lo * INST, (hi - lo) * INST);
  }

  draw(): void {
    if (this.n === 0 || !this.vao) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
  }

  dispose(): void {
    if (this.buf) this.gl.deleteBuffer(this.buf);
    if (this.vao) this.gl.deleteVertexArray(this.vao);
    this.buf = this.vao = null;
    this.gpuCap = 0;
  }
}

/** One batch of a stream draw, and the texture its instances sample. */
export interface Part {
  batch: Batch;
  tex: WebGLTexture;
  w: number;
  h: number;
  /** Texels per map px of the texture (an HD sheet's level, else 1). */
  texel: number;
  /** Factor the instances' texel coords are scaled by (an upscaled copy of a sheet). */
  src: number;
}

/**
 * Several batches, each with its own texture, sent to one GPU buffer and drawn in as few calls as
 * the texture units allow (PARTS per call). The instances keep their order, batch after batch, so
 * depth ties and blending come out exactly as drawing the batches one after another did.
 */
export class SpriteStream {
  private readonly buf: WebGLBuffer;
  private readonly vao: WebGLVertexArrayObject;
  private cap = 0;
  private first = 0;
  /** The parts set this frame (empty batches left out), and the instance each starts at. */
  private readonly parts: Part[] = [];
  private readonly starts: number[] = [];
  private total = 0;
  private staging = new Float32Array(0);

  constructor(
    private readonly gl: WebGL2RenderingContext,
    corners: WebGLBuffer,
  ) {
    this.buf = gl.createBuffer()!;
    this.vao = instanceVao(gl, corners, this.buf);
  }

  /** Uploads the parts' instances: once a frame, then draw() for as many passes as need them. */
  set(parts: readonly Part[], count = parts.length): void {
    const gl = this.gl;
    this.parts.length = 0;
    this.starts.length = 0;
    let n = 0;
    for (let i = 0; i < count; i++) {
      const p = parts[i]!;
      if (p.batch.n === 0) continue;
      this.parts.push(p);
      this.starts.push(n);
      n += p.batch.n;
    }
    this.total = n;
    if (n === 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const bytes = n * INST * 4;
    if (bytes > this.cap) {
      // Head room, so a battle filling up doesn't reallocate every frame.
      this.cap = Math.max(bytes, Math.ceil(this.cap * 1.5), 1024 * INST * 4);
      gl.bufferData(gl.ARRAY_BUFFER, this.cap, gl.STREAM_DRAW);
    }
    if (this.parts.length === 1) {
      const b = this.parts[0]!.batch;
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, b.data, 0, b.n * INST);
      return;
    }
    // Several: gathered into one array and sent in one call (a call per batch costs more than the copy).
    if (this.staging.length < n * INST) this.staging = new Float32Array(Math.max(n * INST, Math.ceil(this.staging.length * 1.5)));
    for (let i = 0; i < this.parts.length; i++) {
      const b = this.parts[i]!.batch;
      this.staging.set(b.data.subarray(0, b.n * INST), this.starts[i]! * INST);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.staging, 0, n * INST);
  }

  /** Instances set this frame. */
  get count(): number {
    return this.total;
  }

  /** Draws everything set, with `P` in use. */
  draw(P: SpriteProgram): void {
    if (this.total === 0) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    for (let c = 0; c < this.parts.length; c += PARTS) {
      const k = Math.min(PARTS, this.parts.length - c);
      const first = this.starts[c]!;
      const end = c + k < this.parts.length ? this.starts[c + k]! : this.total;
      if (first !== this.first) {
        instanceAttribs(gl, this.buf, first);
        this.first = first;
      }
      P.parts(this.parts, this.starts, c, k);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, end - first);
    }
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buf);
    this.gl.deleteVertexArray(this.vao);
  }
}

export class SpriteProgram {
  readonly prog: WebGLProgram;
  private readonly u: Record<string, WebGLUniformLocation | null> = {};
  private readonly texs = new Float32Array(PARTS * 2);
  private readonly tsc = new Float32Array(PARTS * 2);
  private readonly ends = new Int32Array(PARTS - 1);
  /** Whether u_end is all NO_END (everything samples unit 0, as Batch.draw() wants). */
  private single = true;

  constructor(readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, SPRITE_VS, SPRITE_FS);
    for (const k of ['u_cam', 'u_view', 'u_texs', 'u_tsc', 'u_end', 'u_z', 'u_shear', 'u_shadow', 'u_shadowCol', 'u_img', 'u_scale', 'u_now']) this.u[k] = gl.getUniformLocation(this.prog, k);
    gl.useProgram(this.prog);
    gl.uniform1iv(this.u.u_img!, Int32Array.from({ length: PARTS }, (_, k) => k));
    this.ends.fill(NO_END);
    gl.uniform1iv(this.u.u_end!, this.ends);
  }

  /** `scale`: target px per map px (1 except for the HD art's zoomed-in views). */
  use(camX: number, camY: number, w: number, h: number, zFar: number, zNear: number, scale = 1): void {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform1f(this.u.u_scale!, scale);
    gl.uniform2f(this.u.u_cam!, camX, camY);
    gl.uniform2f(this.u.u_view!, w, h);
    gl.uniform2f(this.u.u_z!, zFar, zNear);
    gl.uniform1f(this.u.u_shadow!, 0);
  }

  /**
   * Binds a w×h texture for Batch.draw(); `texel` is its texels per map px (an HD sheet's level,
   * else 1), `src` the factor the instances' texel coords are scaled by (an upscaled copy of a sheet).
   */
  tex(t: WebGLTexture, w: number, h: number, texel = 1, src = 1): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform2f(this.u.u_texs!, w, h);
    gl.uniform2f(this.u.u_tsc!, texel, src);
    if (!this.single) {
      this.ends.fill(NO_END);
      gl.uniform1iv(this.u.u_end!, this.ends);
      this.single = true;
    }
  }

  /** Binds stream parts c..c+k-1 to units 0..k-1 (instances counted from part c's start). */
  parts(parts: readonly Part[], starts: readonly number[], c: number, k: number): void {
    const gl = this.gl;
    const s0 = starts[c]!;
    for (let i = 0; i < k; i++) {
      const p = parts[c + i]!;
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, p.tex);
      this.texs[i * 2] = p.w;
      this.texs[i * 2 + 1] = p.h;
      this.tsc[i * 2] = p.texel;
      this.tsc[i * 2 + 1] = p.src;
    }
    if (k > 1) gl.activeTexture(gl.TEXTURE0);
    gl.uniform2fv(this.u.u_texs!, this.texs, 0, k * 2);
    gl.uniform2fv(this.u.u_tsc!, this.tsc, 0, k * 2);
    if (k > 1 || !this.single) {
      for (let i = 0; i < PARTS - 1; i++) this.ends[i] = i + 1 < k ? starts[c + i + 1]! - s0 : NO_END;
      gl.uniform1iv(this.u.u_end!, this.ends);
      this.single = k <= 1;
    }
  }

  /** The battle second blood decals (mode 2) are drawn at. */
  now(t: number): void {
    this.gl.uniform1f(this.u.u_now!, t);
  }

  shadow(on: boolean, shx = 0, shy = 0, col: [number, number, number, number] = [0, 0, 0, 0]): void {
    const gl = this.gl;
    gl.uniform1f(this.u.u_shadow!, on ? 1 : 0);
    gl.uniform2f(this.u.u_shear!, shx, shy);
    gl.uniform4f(this.u.u_shadowCol!, col[0], col[1], col[2], col[3]);
  }
}

export function cornerBuffer(gl: WebGL2RenderingContext): WebGLBuffer {
  const b = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  return b;
}
