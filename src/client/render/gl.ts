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

const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 i_dst;  // anchor x, y (map px), quad w, h
layout(location=2) in vec4 i_src;  // texel u, v of the cell, anchor offset inside the cell
layout(location=3) in vec4 i_col;  // tint rgba
layout(location=4) in vec4 i_ext;  // depth y (map px), flash, mode (0 tex, 1 solid), flags (1 = no shadow)
uniform vec2 u_cam;    // map px at the target's top-left
uniform vec2 u_view;   // target size in px
uniform vec2 u_tex;    // texture size
uniform vec2 u_z;      // depth range in map px (far, near)
uniform vec2 u_shear;  // shadow pass: ground offset per pixel of height; (0,0) = normal pass
uniform float u_shadow;
uniform float u_scale; // target px per map px (HD zoom draws the map larger than one px per map px)
uniform float u_texel; // texels per map px of the bound texture (HD sprite sheets: their level)
uniform float u_src;   // scale of the instances' texel coords (an upscaled copy of a sheet: its factor)
out vec2 v_uv;
out vec4 v_col;
out vec2 v_ext;
void main() {
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
  v_uv = (i_src.xy * u_src + local * u_texel) / u_tex;
  v_col = i_col;
  v_ext = i_ext.yz;
}`;

const SPRITE_FS = `#version 300 es
precision highp float;
uniform sampler2D u_img;
uniform float u_shadow;
uniform vec4 u_shadowCol;
in vec2 v_uv;
in vec4 v_col;
in vec2 v_ext;
out vec4 o;
void main() {
  if (v_ext.y > 0.5) {
    if (u_shadow > 0.5) discard;
    o = v_col;
    return;
  }
  vec4 c = texture(u_img, v_uv);
  if (c.a < 0.5) discard;
  if (u_shadow > 0.5) { o = u_shadowCol; return; }
  vec3 rgb = mix(c.rgb * v_col.rgb, vec3(1.0, 0.96, 0.9), v_ext.x);
  o = vec4(rgb, v_col.a);
}`;

/** One growable buffer of sprite instances, drawn with one texture in one call. */
export class Batch {
  data: Float32Array;
  n = 0;
  readonly vao: WebGLVertexArrayObject;
  private readonly buf: WebGLBuffer;
  private gpuCap = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    corners: WebGLBuffer,
    cap = 1024,
  ) {
    this.data = new Float32Array(cap * INST);
    this.vao = gl.createVertexArray()!;
    this.buf = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    for (let k = 0; k < 4; k++) {
      gl.enableVertexAttribArray(1 + k);
      gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, INST * 4, k * 16);
      gl.vertexAttribDivisor(1 + k, 1);
    }
    gl.bindVertexArray(null);
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

  upload(): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    const bytes = this.n * INST * 4;
    if (this.data.byteLength > this.gpuCap) {
      gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.STREAM_DRAW);
      this.gpuCap = this.data.byteLength;
    }
    if (bytes > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * INST);
  }

  draw(): void {
    if (this.n === 0) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
  }

  dispose(): void {
    this.gl.deleteBuffer(this.buf);
    this.gl.deleteVertexArray(this.vao);
  }
}

export class SpriteProgram {
  readonly prog: WebGLProgram;
  private readonly u: Record<string, WebGLUniformLocation | null> = {};

  constructor(readonly gl: WebGL2RenderingContext) {
    this.prog = compile(gl, SPRITE_VS, SPRITE_FS);
    for (const k of ['u_cam', 'u_view', 'u_tex', 'u_z', 'u_shear', 'u_shadow', 'u_shadowCol', 'u_img', 'u_scale', 'u_texel', 'u_src']) this.u[k] = gl.getUniformLocation(this.prog, k);
  }

  /** `scale`: target px per map px (1 except for the HD art's zoomed-in views). */
  use(camX: number, camY: number, w: number, h: number, zFar: number, zNear: number, scale = 1): void {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform1f(this.u.u_scale!, scale);
    gl.uniform1f(this.u.u_texel!, 1);
    gl.uniform1f(this.u.u_src!, 1);
    gl.uniform2f(this.u.u_cam!, camX, camY);
    gl.uniform2f(this.u.u_view!, w, h);
    gl.uniform2f(this.u.u_z!, zFar, zNear);
    gl.uniform1i(this.u.u_img!, 0);
    gl.uniform1f(this.u.u_shadow!, 0);
  }

  /**
   * Binds a w×h texture; `texel` is its texels per map px (an HD sheet's level, else 1), `src`
   * the factor the instances' texel coords are scaled by (an upscaled copy of a sheet).
   */
  tex(t: WebGLTexture, w: number, h: number, texel = 1, src = 1): void {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.uniform2f(this.u.u_tex!, w, h);
    gl.uniform1f(this.u.u_texel!, texel);
    gl.uniform1f(this.u.u_src!, src);
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
