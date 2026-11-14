/** Shared GLSL building blocks. */

/** Cheap 3D value noise + fBm, used for regolith albedo and detail normals. */
export const NOISE_GLSL = /* glsl */ `
float jhash(vec2 p){
  p = fract(p * vec2(443.8975, 397.2973));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}
float jnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = jhash(i);
  float b = jhash(i + vec2(1.0, 0.0));
  float c = jhash(i + vec2(0.0, 1.0));
  float d = jhash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float jfbm(vec2 p, int oct){
  float s = 0.0, a = 0.5, n = 0.0;
  for (int i = 0; i < 7; i++){
    if (i >= oct) break;
    s += a * jnoise(p);
    n += a;
    a *= 0.5;
    p *= 2.03;
  }
  return s / max(n, 1e-4);
}
`

/**
 * Mars sky.
 *
 * Mars has a butterscotch sky with a BLUE aureole around the Sun, the opposite of
 * Earth. Suspended dust grains are comparable in size to visible wavelengths, so
 * they forward-scatter blue light strongly while the diffuse sky is reddened by
 * the iron-oxide dust. Perseverance and Curiosity images of Martian sunsets show
 * exactly this. Rendering it the other way round is the single most common mistake
 * in Mars art.
 * Reference: NASA Mars sunset imagery and dust-scattering explainers,
 * https://science.nasa.gov/mars/
 */
export const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform float uTau;        // dust optical depth
uniform float uDayness;    // 0 night, 1 full day
uniform float uTransmission;
varying vec3 vDir;

${NOISE_GLSL}

void main(){
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.2, 1.0);          // 0 at horizon, 1 at zenith
  float cosT = clamp(dot(d, normalize(uSunDir)), -1.0, 1.0);

  // Dust loading drives how orange and how flat the sky is.
  float dusty = clamp(uTau / 3.2, 0.0, 1.0);

  // Base colours: a clear-ish low-dust Mars sky is a dim salmon, a storm sky is
  // a featureless orange-brown that loses the zenith gradient entirely.
  vec3 zenithClear = vec3(0.30, 0.22, 0.20);
  vec3 horizClear  = vec3(0.74, 0.52, 0.36);
  vec3 zenithDust  = vec3(0.60, 0.38, 0.24);
  vec3 horizDust   = vec3(0.86, 0.58, 0.33);

  vec3 zen = mix(zenithClear, zenithDust, dusty);
  vec3 hor = mix(horizClear, horizDust, dusty);

  float grad = pow(1.0 - clamp(h, 0.0, 1.0), mix(2.3, 1.05, dusty));
  vec3 col = mix(zen, hor, grad);

  // The blue forward-scattering aureole. Tight, bright, centred on the Sun, and
  // it survives even in heavy dust because that is what dust does to blue light.
  float aureole = pow(max(cosT, 0.0), mix(14.0, 5.0, dusty));
  vec3 blueScatter = vec3(0.42, 0.60, 0.95);
  col += blueScatter * aureole * (0.42 + 0.5 * dusty) * uDayness;

  // Broad warm glow around the Sun from multiple scattering.
  float glow = pow(max(cosT, 0.0), 2.2);
  col += vec3(0.42, 0.24, 0.12) * glow * 0.55 * uDayness;

  // The solar disc. Mars sees the Sun about 0.35 deg across against 0.53 at Earth,
  // so it is noticeably smaller, and dust dims it hard.
  float disc = smoothstep(0.99996, 0.99999, cosT);
  col += vec3(1.0, 0.86, 0.68) * disc * 7.0 * uTransmission * uDayness;

  // Night: a dark, faintly dust-lit sky with stars.
  float night = 1.0 - uDayness;
  if (night > 0.001){
    vec3 nightCol = mix(vec3(0.016, 0.014, 0.020), vec3(0.055, 0.035, 0.030), grad);
    float st = jnoise(d.xz * 420.0 + d.y * 180.0);
    float stars = smoothstep(0.9955, 1.0, st) * clamp(h * 3.0, 0.0, 1.0);
    nightCol += vec3(0.85, 0.9, 1.0) * stars * 0.9 * (1.0 - dusty * 0.85);
    col = mix(col * 0.14, nightCol, night);
  }

  // Ground-side of the dome: just fade to the fog colour so there is no seam.
  col = mix(col, mix(hor, vec3(0.30, 0.18, 0.12), 0.45), smoothstep(0.0, -0.14, d.y));

  gl_FragColor = vec4(col, 1.0);
}
`

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
}
`
