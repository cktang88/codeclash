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
uniform vec3 uTint;

float wave(vec2 p, vec2 d, float f, float s, float t) {
  return sin(dot(p, d) * f + t * s);
}

void main() {
  vec4 m = texture(uMask, vUV);
  if (m.a < 0.01) { finalColor = vec4(0.0); return; }
  float depth = m.r;
  vec2 p = vWorld;
  float t = uTime;
  // Three crossing swells, slightly warped so the crests never line up mechanically.
  vec2 q = p + vec2(sin(p.y * 0.011 + t * 0.21), cos(p.x * 0.013 - t * 0.17)) * 9.0;
  float h = wave(q, vec2(0.80, 0.60), 0.085, 1.3, t)
          + wave(q, vec2(-0.55, 0.83), 0.061, -1.05, t) * 0.8
          + wave(q, vec2(0.21, -0.98), 0.142, 1.9, t) * 0.45 * depth;
  // Sun glints: thin bright crests where the swells add up.
  float glint = smoothstep(1.55, 2.05, h) * (0.35 + 0.65 * depth);
  // Inked ripple lines: long, slow, darker bands like an engraver's water hatching.
  float band = sin(p.y * 0.19 + sin(p.x * 0.027 + t * 0.32) * 2.6 + t * 0.45);
  float hatch = smoothstep(0.93, 0.99, band) * (0.25 + 0.5 * depth);
  float light = glint * mix(0.25, 0.75, uDay);
  vec3 col = uTint * light;
  float a = clamp(light + hatch * 0.32, 0.0, 1.0) * m.a;
  // Hatch lines are ink (dark), glints are light: mix them in premultiplied space.
  vec3 ink = vec3(0.10, 0.14, 0.22) * hatch * 0.32;
  finalColor = vec4((col + ink) * m.a, a);
}
`;

/** A world-space quad that animates water glints over the painted terrain. */
export class WaterGlints {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly shader: Shader;

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
          uTint: { value: new Float32Array([1, 0.97, 0.88]), type: 'vec3<f32>' },
        },
      },
    });
    this.mesh = new Mesh({ geometry, shader: this.shader });
  }

  update(seconds: number, day: number): void {
    const u = this.shader.resources.waterUniforms.uniforms as { uTime: number; uDay: number };
    u.uTime = seconds;
    u.uDay = day;
  }

  destroy(): void {
    this.mesh.destroy({ children: true });
  }
}
