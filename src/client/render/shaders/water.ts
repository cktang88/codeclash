import { Mesh, MeshGeometry, Shader, type Texture } from 'pixi.js';

// Glints and slow ripple bands over the painted water, in world coordinates so
// they stay put on the map while the camera moves. The mask's alpha says where
// water is; its red channel says how deep (1 = open sea), which calms the
// ripples near shore and lets the swell build offshore.
const vertex = /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
out vec2 vWorld;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vWorld = aPosition;
}
`;

const fragment = /* glsl */ `
in vec2 vUV;
in vec2 vWorld;
out vec4 finalColor;
uniform sampler2D uMask;
uniform float uTime;
uniform float uDay;
uniform float uZoom;
uniform vec3 uTint;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main() {
  vec4 m = texture(uMask, vUV);
  if (m.a < 0.01) { finalColor = vec4(0.0); return; }
  float depth = m.r;
  vec2 p = vWorld;
  float t = uTime;
  // Sun glints: two drifting noise fields multiplied leave small, scattered
  // sparkles that twinkle as the fields slide past each other.
  // Stretched along x, so each sparkle is a short flat fleck on a wave crest.
  float a1 = vnoise(p * vec2(0.3, 0.9) + vec2(t * 0.9, t * 0.3));
  float a2 = vnoise(p * vec2(0.25, 0.7) + vec2(-t * 0.6, t * 0.8) + 17.0);
  float swell = vnoise(p * 0.03 + vec2(t * 0.05, -t * 0.03));
  // Too small to see from afar, where they would only alias: fade them with zoom.
  float fade = smoothstep(0.45, 1.1, uZoom);
  float glint = smoothstep(0.86, 0.96, a1 * a2 * 1.2) * smoothstep(0.45, 0.7, swell) * (0.4 + 0.6 * depth) * fade;
  // Inked ripple lines: long, slow bands, broken into dashes like an engraver's water hatching.
  float band = sin(p.y * 0.16 + sin(p.x * 0.021 + t * 0.3) * 2.4 + t * 0.4);
  float dash = smoothstep(0.45, 0.6, vnoise(p * vec2(0.045, 0.12) + vec2(t * 0.05, 0.0)));
  float hatch = smoothstep(0.94, 0.99, band) * dash * (0.3 + 0.5 * depth);
  float light = glint * mix(0.35, 0.9, uDay);
  vec3 col = uTint * light;
  float alpha = clamp(light + hatch * 0.3, 0.0, 1.0) * m.a;
  vec3 ink = vec3(0.10, 0.14, 0.22) * hatch * 0.3;
  finalColor = vec4((col + ink) * m.a, alpha);
}
`;

/** A world-space quad that animates water glints over the painted terrain. */
export class WaterGlints {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly shader: Shader;

  /** Takes ownership of `mask`: it is destroyed with the glints. */
  constructor(mask: Texture, extent: number) {
    const e = extent;
    const geometry = new MeshGeometry({
      positions: new Float32Array([-e, -e, e, -e, e, e, -e, e]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.shader = Shader.from({
      gl: { vertex, fragment, name: 'pushfront-water' },
      resources: {
        uMask: mask.source,
        waterUniforms: {
          uTime: { value: 0, type: 'f32' },
          uDay: { value: 1, type: 'f32' },
          uZoom: { value: 1, type: 'f32' },
          uTint: { value: new Float32Array([1, 0.97, 0.88]), type: 'vec3<f32>' },
        },
      },
    });
    this.mesh = new Mesh({ geometry, shader: this.shader });
  }

  update(seconds: number, day: number, zoom: number): void {
    const u = this.shader.resources.waterUniforms.uniforms as { uTime: number; uDay: number; uZoom: number };
    u.uTime = seconds;
    u.uDay = day;
    u.uZoom = zoom;
  }

  destroy(): void {
    // The mask is this map's own (baked with its terrain), and Mesh.destroy frees neither the
    // geometry, the shader nor its textures: release them all, or every new day leaks a map's worth.
    const geometry = this.mesh.geometry;
    const mask = this.shader.resources.uMask as { destroy(): void } | undefined;
    this.mesh.destroy({ children: true });
    geometry.destroy(true);
    this.shader.destroy();
    mask?.destroy();
  }
}
