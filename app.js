/* Движок «Сна». Здесь ничего менять не нужно — все тексты в story.js */
(() => {
'use strict';
const S = window.STORY || {};
const Q = new URLSearchParams(location.search);
const DEBUG = Q.has('debug'), MARK = Q.has('mark');
const JUMP = Q.has('t') ? parseFloat(Q.get('t')) : null;
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = s => document.querySelector(s);

/* ───────────── math ───────────── */
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const V = (x = 0, y = 0, z = 0) => [x, y, z];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = a => Math.hypot(a[0], a[1], a[2]);
const norm = a => mul(a, 1 / (len(a) || 1));
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rotY = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * v[0] + s * v[2], v[1], -s * v[0] + c * v[2]]; };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const rr = (a, b) => a + (b - a) * rnd();
const rdir = () => { const u = rr(-1, 1), t = rr(0, 6.2832), s = Math.sqrt(1 - u * u); return [s * Math.cos(t), u, s * Math.sin(t)]; };

/* ───────────── timeline ───────────── */
const ORDER = ['dream', 'space', 'her', 'me', 'pull', 'impact', 'born', 'us'];
const RATE = S.speechRate || 13;
const fill = s => (s || '').replace(/\{name\}/g, S.herName || '');
const plain = s => s.replace(/\*/g, '');
let marks = null;
try { marks = JSON.parse(sessionStorage.getItem('dream-marks') || 'null'); } catch (e) {}
const LINES = (S.lines || []).map((l, i) => ({ ...l, text: fill(l.text), i }));
if (marks && marks.length === LINES.length) marks.forEach((t, i) => { if (typeof t === 'number') LINES[i].at = t; });
const est = l => { const n = plain(l.text).length; return n ? n / RATE + 1.3 + (l.wait || 0) : (l.wait || 3); };
{ let t = 0; LINES.forEach(l => { if (typeof l.at === 'number') t = l.at; l.at = t; t += est(l); }); }
LINES.forEach((l, i) => {
  const n = LINES[i + 1], chars = plain(l.text).length;
  const gap = n ? n.at - l.at : est(l);
  l.reveal = l.dur || Math.max(.3, Math.min(chars / RATE, gap * .9));
  l.hideAt = n ? (n.text ? n.at - .3 : Math.min(n.at + 1.5, l.at + l.reveal + 6)) : l.at + l.reveal + 4;
  l.hideAt = Math.min(l.hideAt, l.at + l.reveal + 7);
});
const TOTAL = LINES.length ? LINES[LINES.length - 1].at + est(LINES[LINES.length - 1]) : 60;
const SC = {};
LINES.forEach(l => { if (l.scene && !SC[l.scene]) SC[l.scene] = { start: l.at }; });
ORDER.forEach((k, i) => { if (!SC[k]) SC[k] = { start: i ? SC[ORDER[i - 1]].start : 0 }; });
ORDER.forEach((k, i) => { const n = ORDER[i + 1]; SC[k].end = n ? SC[n].start : TOTAL; SC[k].dur = Math.max(.001, SC[k].end - SC[k].start); });
const sceneAt = T => { for (let i = ORDER.length - 1; i >= 0; i--) if (T >= SC[ORDER[i]].start && i > 0) return ORDER[i]; return 'dream'; };
const POS = { dream: 'center', space: 'bottom', her: 'bottom', me: 'bottom', pull: 'bottom', impact: 'bottom', born: 'bottom', us: 'bottom' };
LINES.forEach(l => { l.pos = l.pos || POS[sceneAt(l.at + .01)]; });

/* ───────────── world constants ───────────── */
const A0 = V(0, 0, 0), RA = 1.0;
const B0 = V(7.5, .8, -3.5), RB = .82;
const MA = RA ** 3, MB = RB ** 3, MT = MA + MB;
const M = mul(add(mul(A0, MA), mul(B0, MB)), 1 / MT);
const RN = Math.cbrt(MT);
const D0 = len(sub(B0, A0)), DC = RA + RB;
const DIR0 = norm(sub(B0, A0));
const SUN = norm(V(-.55, .45, .7));
const FOCAL = 1.6;
const PULL_SPIN = Math.PI, PULL_AX = norm(V(0, 1, .15));
const rotAx = (v, k, a) => { const c = Math.cos(a), s = Math.sin(a); return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c))); };

function pullState(u) {
  const g = Math.pow(clamp(u), 2.3);
  const d = lerp(D0, DC, g);
  const th = PULL_SPIN * Math.pow(clamp(u), 1.5);
  const dir = norm(rotAx(DIR0, PULL_AX, th));
  return { A: sub(M, mul(dir, d * MB / MT)), B: add(M, mul(dir, d * MA / MT)), dir, g };
}
const CONTACT = pullState(1);

/* ───────────── director: everything as a function of time ───────────── */
function direct(T) {
  const k = sceneAt(T), s = SC[k], lt = T - s.start, u = clamp(lt / s.dur);
  const L = key => T - SC[key].start;
  const o = { key: k, lt, u, A: A0, rA: RA, B: B0, rB: RB, K: 0, heat: 0, formed: 0, flash: 0, shock: -1, ring: 0, bloom: 0,
    tunnel: 0, flower: 0, dome: 0, lamp: 0, objects: 1, feathers: 0, constel: 0, constelA: 0 };
  // tunnel
  o.tunnel = T < SC.space.start ? 1 : 1 - sstep(0, 3.8, L('space'));
  o.feathers = sstep(1.5, 5, L('space')) * (1 - sstep(0, 4, L('her')));
  o.constel = clamp((L('space') - 3.5) / Math.max(4, SC.space.dur * .55));
  o.constelA = sstep(3, 5, L('space')) * (1 - sstep(1, 5, L('her')));
  o.flower = sstep(1.2, 9, L('her'));
  o.dome = sstep(0, 2, L('her') + 3);
  o.lamp = sstep(1.5, 2.6, L('me'));
  // planets
  if (T >= SC.pull.start && T < SC.impact.start) {
    const p = pullState(u); o.A = p.A; o.B = p.B; o.K = sstep(.86, 1, u) * .38;
    o.objects = 1 - sstep(.72, .9, u);
    o.flash = sstep(.94, 1, u) * .25;
  } else if (T >= SC.impact.start) {
    const li = L('impact');
    const m = 1 - Math.pow(1 - clamp(li / 4.6), 3);
    o.A = mix3(CONTACT.A, M, m); o.B = mix3(CONTACT.B, M, m);
    o.rA = lerp(RA, RN, m); o.rB = lerp(RB, RN, m);
    o.K = .38 * (1 - m) + RN * .95 * Math.pow(Math.sin(Math.PI * m), .6);
    o.heat = sstep(0, .25, li) * Math.exp(-li * .32);
    o.formed = sstep(2.2, 6.5, li);
    o.flash = li < 6 ? Math.exp(-li * 2.6) * 1.3 : 0;
    o.shock = li < 9 ? li * 3.2 : -1;
    o.objects = 0;
    const lb = T - SC.born.start;
    o.ring = sstep(0, 11, lb + Math.max(0, li - SC.impact.dur) * 0) * (T >= SC.born.start ? 1 : 0) + (T < SC.born.start ? sstep(5, 12, li) * .35 : 0);
    if (T >= SC.born.start) o.ring = Math.max(sstep(5, 12, li) * .35, sstep(0, 11, lb));
    o.bloom = T >= SC.born.start ? sstep(3, 18, lb) : 0;
    if (k === 'us') { o.ring = 1; o.bloom = 1; }
  }
  if (T < SC.pull.start) o.objects = 1;
  // camera
  const asp = W / H;
  let pos, tgt, ref = .4, rate = 1;
  if (k === 'dream') { pos = V(0, .3, 46); tgt = V(-.4, .6, 0); ref = .3; rate = 4; }
  else if (k === 'space') { pos = mix3(V(0, .3, 46), V(.9, .55, 13), eio(u)); tgt = V(-.4, .6, 0); ref = .3; rate = 2.5; }
  else if (k === 'her') { pos = add(A0, V(1.25 + Math.sin(lt * .09) * .4, 1.0, 6.1)); tgt = add(A0, V(0, -.32, 0)); ref = .42; rate = .85; }
  else if (k === 'me') { pos = add(B0, V(-1.1 + Math.sin(lt * .1) * .3, .8, 5.1)); tgt = add(B0, V(0, -.27, 0)); ref = .38; rate = .75; }
  else if (k === 'pull') { const g = Math.pow(u, 2.3); pos = add(M, V(0, lerp(4.4, 1.8, g), lerp(14, 7.4, g))); tgt = add(M, V(0, lerp(-.4, 0, g), 0)); ref = lerp(.75, .55, g); rate = 1; }
  else if (k === 'impact') { pos = add(M, V(0, 1.4, 7.2 + lt * .06)); tgt = M; ref = .65; rate = 1.3; }
  else {
    const lb = T - SC.born.start, a = .9 * Math.sin(lb * .035);
    const R = k === 'born' ? lerp(7.4, 6.4, sstep(0, 25, lb)) : lerp(6.4, 5.4, sstep(0, 20, T - SC.us.start));
    pos = add(M, V(Math.sin(a) * R, 1.55, Math.cos(a) * R)); tgt = M; ref = .72; rate = .7;
  }
  if (confess.on) {
    const cl = T - confess.t0, a = .75 + .12 * Math.sin(cl * .05);
    const R = lerp(5.4, 13.5, eio(clamp(cl / 6)));
    pos = add(M, V(Math.sin(a) * R, lerp(1.55, 3.6, eio(clamp(cl / 6))), Math.cos(a) * R)); tgt = add(M, V(0, lerp(0, -.6, eio(clamp(cl / 6))), 0)); ref = asp < .8 ? .46 : .9; rate = 1.2;
  }
  const fit = Math.max(1, ref / (.5 * asp));
  o.camPos = add(tgt, mul(sub(pos, tgt), fit)); o.camTgt = tgt; o.camRate = rate;
  // shake
  if (T >= SC.impact.start && !RM) {
    const li = L('impact'), a = .16 * Math.exp(-li * 1.1) * (li > 0 ? 1 : 0);
    o.shake = V(Math.sin(li * 37) * a, Math.sin(li * 29 + 1) * a, Math.sin(li * 23 + 2) * a * .5);
  } else o.shake = V();
  return o;
}

/* ───────────── canvases ───────────── */
const glc = $('#gl'), fxc = $('#fx'), fx = fxc.getContext('2d');
let W = innerWidth, H = innerHeight, DPR = Math.min(2, devicePixelRatio || 1), glScale = Math.min(1.25, DPR);
function resize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(2, devicePixelRatio || 1);
  fxc.width = W * DPR; fxc.height = H * DPR; sizeGL();
}
function sizeGL() { glc.width = Math.max(2, Math.round(W * glScale)); glc.height = Math.max(2, Math.round(H * glScale)); if (gl) gl.viewport(0, 0, glc.width, glc.height); }

/* ───────────── WebGL shader ───────────── */
const VS = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }`;
const FS = `#version 300 es
precision highp float;
out vec4 C;
uniform vec2 uRes; uniform float uTime, uFocal;
uniform vec3 uCam, uR, uU, uF, uSun;
uniform vec4 uA, uB, uBound;
uniform float uK, uHeat, uFormed, uTunnel, uTPhase, uFlash, uShock, uRing, uBloom, uSpin;
uniform vec3 uShockC, uShockN, uRingN;

float h13(vec3 p){ p = fract(p*.3183099+.1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h13(i),h13(i+vec3(1,0,0)),f.x),mix(h13(i+vec3(0,1,0)),h13(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h13(i+vec3(0,0,1)),h13(i+vec3(1,0,1)),f.x),mix(h13(i+vec3(0,1,1)),h13(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*noise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=.5; } return s; }
float fbm3(vec3 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*noise(p); p=p*2.07+vec3(5.1,1.3,7.7); a*=.5; } return s; }
mat3 rY(float a){ float c=cos(a), s=sin(a); return mat3(c,0,-s, 0,1,0, s,0,c); }
mat3 rX(float a){ float c=cos(a), s=sin(a); return mat3(1,0,0, 0,c,s, 0,-s,c); }

vec3 stars(vec3 rd){
  vec3 c = vec3(0);
  for(int i=0;i<2;i++){
    float sc = 70. + float(i)*95.;
    vec3 p = rd*sc, id = floor(p), f = fract(p)-.5;
    float h = h13(id + float(i)*17.3);
    if(h > .8){
      vec3 o = vec3(h13(id+3.1),h13(id+5.7),h13(id+9.3))-.5;
      float d = length(f - o*.55);
      float tw = .55 + .45*sin(uTime*(.7+h*2.5) + h*60.);
      vec3 col = mix(vec3(.72,.78,1.), vec3(1.,.78,.86), h13(id+1.3));
      float b = (h-.8)*5.;
      c += col * (pow(max(0., 1.-d*6.5), 4.)*1.6 + pow(max(0., 1.-d*2.2), 6.)*.12) * tw * (.35 + b*1.4);
    }
  }
  return c;
}
vec3 nebula(vec3 rd){
  vec3 p = rd*1.7;
  float n1 = fbm(p + vec3(0., 0., uTime*.003));
  float n2 = fbm(p*2.3 + n1*1.9 + 4.);
  float band = exp(-pow(dot(rd, normalize(vec3(.35,1.,.15)))*2.4, 2.));
  vec3 c = vec3(.010,.007,.024);
  c += vec3(.22,.09,.42) * pow(n1, 2.6) * 1.7 * (.35 + band);
  c += vec3(.50,.05,.20) * pow(n2, 4.2) * 1.5 * band;
  c += vec3(.03,.16,.24) * pow(fbm3(p*3.1-2.), 3.) * 1.1;
  c *= .5 + .5*smoothstep(.28, .66, fbm3(p*3.6 + 9.));
  return c;
}

float smin(float a, float b, float k){ float h = clamp(.5+.5*(b-a)/k, 0., 1.); return mix(b,a,h) - k*h*(1.-h); }
float dA_, dB_;
float map(vec3 p){
  dA_ = uA.w > 0. ? length(p-uA.xyz) - uA.w : 1e4;
  dB_ = uB.w > 0. ? length(p-uB.xyz) - uB.w : 1e4;
  float d = uK > .001 ? smin(dA_, dB_, uK) : min(dA_, dB_);
  if(uHeat > .01) d += (noise(p*3.5 + uTime*1.3) - .5) * .07 * uHeat;
  return d;
}
vec3 calcN(vec3 p){ vec2 e = vec2(.0015, -.0015);
  return normalize(e.xyy*map(p+e.xyy) + e.yyx*map(p+e.yyx) + e.yxy*map(p+e.yxy) + e.xxx*map(p+e.xxx)); }

// surfaces return color, w = land mask
vec4 herS(vec3 n){
  float h = fbm3(n*2.6 + 3.), d = fbm3(n*8. + h*2.5);
  vec3 sea = mix(vec3(.05,.02,.15), vec3(.17,.07,.38), d);
  vec3 land = mix(vec3(.30,.19,.55), vec3(.68,.56,.88), smoothstep(.3,.75,d));
  land = mix(land, vec3(.12,.06,.26), smoothstep(.62,.7,fbm3(n*14.+1.))*.5);
  float m = smoothstep(.5, .53, h);
  vec3 c = mix(sea, land, m);
  c = mix(c, vec3(.9,.88,1.), smoothstep(.8, .93, abs(n.y) + d*.12));
  return vec4(c, m);
}
vec4 hisS(vec3 n){
  float h = fbm3(n*2.2 + 11.), d = fbm3(n*7. - h*2.);
  vec3 sea = mix(vec3(.02,.09,.13), vec3(.05,.25,.30), d);
  vec3 land = mix(vec3(.45,.22,.16), vec3(.90,.64,.38), smoothstep(.25,.8,d));
  land = mix(land, vec3(.66,.30,.32), smoothstep(.5, .68, fbm3(n*4. + 5.)) * .7);
  float cr = fbm3(n*16. + 2.);
  land *= .78 + .35*smoothstep(.35,.65,cr);
  float m = smoothstep(.36, .41, h);
  return vec4(mix(sea, land, m), m);
}
float flowers(vec3 n){
  float f = 0.;
  for(int i=0;i<2;i++){
    float sc = 15. + float(i)*17.;
    vec3 p = n*sc, id = floor(p), fr = fract(p);
    float h = h13(id + float(i)*7.1);
    vec3 o = vec3(h13(id+1.7), h13(id+2.9), h13(id+4.1))*.6 + .2;
    float d = length(fr - o);
    float on = smoothstep(h*1.1, h*1.1 - .08, uBloom*.8);
    f += on * (smoothstep(.24, 0., d) + smoothstep(.6, 0., d)*.15) * (.75 + .25*sin(uTime*1.7 + h*40.));
  }
  return f;
}
float halo(vec3 ro, vec3 rd, vec4 s, out float lit){
  lit = 0.; if(s.w <= 0.) return 0.;
  vec3 oc = s.xyz - ro; float t = max(dot(oc, rd), 0.);
  vec3 q = ro + rd*t; float d = length(q - s.xyz);
  float x = max(d - s.w, 0.) / (s.w*.32);
  lit = clamp(dot(normalize(q - s.xyz), uSun) + .35, 0., 1.);
  return exp(-x*x*1.4) * step(.0001, t);
}

vec3 tunnel(vec2 uv){
  float r = length(uv) + 1e-4, a = atan(uv.y, uv.x);
  float z = .55 / r;                         // depth along the corridor
  float zz = z + uTPhase;
  vec3 q = vec3(cos(a)*1.3, sin(a)*1.3, zz*.35);
  float fold = fbm3(q + vec3(0., 0., uTime*.03));
  float drape = .5 + .5*sin(a*6. + fold*5. + zz*.15);      // soft velvet folds
  float rib = .5 + .5*sin(zz*2.6 + fold*2.2);              // arches of the tunnel
  rib = smoothstep(.15, 1., rib);
  vec3 wall = mix(vec3(.05,.045,.16), vec3(.22,.20,.58), rib*.6 + drape*.25 + fold*.25);
  wall += vec3(.45,.36,.9) * pow(rib, 10.) * .25;            // light catching rib edges
  wall *= .55 + .45*drape;
  float fog = 1. - exp(-z*.09);
  vec3 endL = vec3(.22,.20,.55);
  vec3 c = mix(wall, endL, fog*.8);
  c += vec3(.85,.82,1.) * exp(-r*r*260.) * .8 + vec3(.5,.45,1.) * exp(-r*r*20.) * .12;
  c *= smoothstep(1.25, .25, r) * .6 + .4;
  return c;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5*uRes) / uRes.y;
  vec3 ro = uCam, rd = normalize(uv.x*uR + uv.y*uU + uFocal*uF);
  vec3 col = nebula(rd) + stars(rd);

  // planets
  float tHit = 1e9; bool hit = false;
  vec3 oc = ro - uBound.xyz; float b = dot(oc, rd), cc = dot(oc,oc) - uBound.w*uBound.w, disc = b*b - cc;
  if(uBound.w > 0. && disc > 0.){
    float t = max(-b - sqrt(disc), 0.), tEnd = -b + sqrt(disc);
    for(int i=0;i<90;i++){
      float d = map(ro + rd*t);
      if(d < .0008*t){ hit = true; break; }
      t += d*.9; if(t > tEnd) break;
    }
    if(hit) tHit = t;
  }
  float la, lb2;
  float hA = halo(ro, rd, uA, la), hB = halo(ro, rd, uB, lb2);
  vec3 atA = vec3(.62,.45,1.), atB = vec3(1.,.68,.42), atN = vec3(1.,.55,.78);
  if(!hit){
    vec3 h1 = atA*hA*(.25+la), h2 = atB*hB*(.25+lb2);
    vec3 hn = mix(h1+h2, atN*max(hA,hB)*(.3+max(la,lb2)), uFormed);
    col += hn * .55;
  } else {
    vec3 p = ro + rd*tHit, N = calcN(p);
    map(p);
    float k = max(uK, .05);
    float s = clamp(.5 + .5*(dB_ - dA_)/k, 0., 1.);
    vec3 nA = rX(.35) * rY(uSpin) * normalize(p - uA.xyz);
    vec3 nB = rX(-.25) * rY(uSpin*1.3 + 2.) * normalize(p - uB.xyz);
    vec4 sa = herS(nA), sb = hisS(nB);
    vec3 base = mix(sb.rgb, sa.rgb, s); float land = mix(sb.w, sa.w, s);
    vec3 atm = mix(atB, atA, s);
    float cloud = smoothstep(.6, .88, fbm3(mix(nB, nA, s)*4.4 + uTime*.012 + 3.));
    vec3 emis = vec3(0);
    float seam = exp(-pow((dA_ - dB_)/.14, 2.)) * uHeat;
    float vn = fbm3(p*2.6 + uTime*.15);
    float crack = (1. - smoothstep(.0, .035, abs(vn - .5))) * uHeat;
    float magma = smoothstep(.55, .8, fbm3(p*5. - uTime*.2)) * uHeat;
    emis += vec3(1.,.45,.35)*seam*2.4 + vec3(1.,.72,.45)*crack*2.2 + vec3(.9,.25,.35)*magma*.8;
    if(uFormed > .001){
      vec3 nN = rX(.2) * rY(uSpin*.8) * normalize(p - uA.xyz);
      float msk = fbm3(nN*1.7 + fbm3(nN*3.2)*1.6);
      float sm = smoothstep(.47, .53, msk);
      vec4 a = herS(nN), bb = hisS(nN);
      vec3 nc = mix(bb.rgb, a.rgb, sm);
      float nl = mix(bb.w, a.w, sm);
      base = mix(base, nc, uFormed); land = mix(land, nl, uFormed);
      atm = mix(atm, atN, uFormed);
      float st = exp(-pow((msk - .5)*55., 2.));
      float dash = smoothstep(-.2, .4, sin(dot(nN, vec3(37., 23., 51.))));
      emis += vec3(1.,.62,.72) * st * (.35 + .65*dash) * 1.1 * uFormed;
      cloud *= mix(1., .7, uFormed);
      float fl = flowers(nN) * (.25 + .75*nl);
      emis += mix(vec3(1.,.25,.45), vec3(1.,.6,.75), .3) * fl * 1.8 * uFormed;
    }
    float ndl = dot(N, uSun);
    float diff = smoothstep(-.14, 1., ndl);
    vec3 c = base * (.025 + 1.2*diff);
    float spec = pow(max(dot(reflect(-uSun, N), -rd), 0.), 90.) * .12 * (1. - land) * diff;
    c += vec3(1.,.92,.95) * spec;
    c = mix(c, vec3(.95,.92,1.) * (.04 + 1.05*diff), cloud*.72);
    float fr = pow(1. - max(dot(N, -rd), 0.), 2.6);
    c += atm * fr * (.12 + 1.1*max(ndl + .3, 0.));
    float night = 1. - smoothstep(-.15, .3, ndl);
    c += emis * (.35 + 1.3*night);
    col = c;
  }

  // rings of the new planet
  if(uRing > .002){
    float den = dot(rd, uRingN);
    if(abs(den) > 1e-4){
      float t = dot(uA.xyz - ro, uRingN) / den;
      if(t > 0. && t < tHit){
        vec3 p = ro + rd*t; vec3 dp = p - uA.xyz; float r = length(dp) / uA.w;
        if(r > 1.45 && r < 2.6){
          float bands = .55 + .45*sin(r*38. + noise(vec3(r*9.,0.,0.))*6.);
          float gaps = smoothstep(.0, .12, abs(r - 1.98)) * smoothstep(.0,.04,abs(r-2.32));
          float edge = smoothstep(1.45, 1.6, r) * smoothstep(2.6, 2.35, r);
          float fine = noise(vec3(r*80., atan(dp.z, dp.x)*2., 0.));
          float a = bands * gaps * edge * (.55 + .45*fine) * uRing;
          vec3 rc = mix(vec3(.75,.62,1.), vec3(1.,.72,.62), noise(vec3(r*5.,1.,0.)));
          float sh = (dot(dp, uSun) < 0. && length(cross(dp, uSun)) < uA.w) ? .12 : 1.;
          rc *= (.25 + .9*sh);
          col = mix(col, rc, a*.75);
          col += rc * a * .15;
        }
      }
    }
  }
  // shockwave
  if(uShock > 0.){
    float den = dot(rd, uShockN);
    float t = dot(uShockC - ro, uShockN) / den;
    if(t > 0. && t < tHit){
      float r = length(ro + rd*t - uShockC);
      float w = exp(-pow((r - uShock)*2.4, 2.)) * exp(-uShock*.22);
      col += vec3(1.,.6,.8) * w * 1.3 + vec3(.6,.5,1.) * exp(-pow((r - uShock*.82)*1.4,2.)) * exp(-uShock*.3) * .4;
    }
  }
  // impact flash
  if(uFlash > .001){
    vec3 oc2 = uShockC - ro; float t = max(dot(oc2, rd), 0.); float d = length(oc2 - rd*t);
    col += vec3(1.,.8,.9) * uFlash * (exp(-d*d*1.6)*1.6 + .25);
  }
  // tunnel overlay
  if(uTunnel > .001){
    float hole = (1. - uTunnel) * 1.6;
    float r = length(uv);
    float m = uTunnel * smoothstep(hole - .05, hole + .25, r);
    if(uTunnel > .999) m = 1.;
    col = mix(col, tunnel(uv), m);
    col += vec3(.7,.65,1.) * exp(-pow((r - hole)*6., 2.)) * (1. - uTunnel) * uTunnel * 2.;
  }
  col = 1. - exp(-col * 1.25);
  col *= 1. - .38*dot(uv*.9, uv*.9);
  col += (h13(vec3(gl_FragCoord.xy, uTime*60.)) - .5) * .028;
  C = vec4(max(col, 0.), 1.);
}`;

let gl = null, U = {};
function initGL() {
  gl = glc.getContext('webgl2', { antialias: false, alpha: false, depth: false, powerPreference: 'high-performance' });
  if (!gl) return false;
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; } return s; };
  const pr = gl.createProgram(); const v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, FS);
  if (!v || !f) { gl = null; return false; }
  gl.attachShader(pr, v); gl.attachShader(pr, f); gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(pr)); gl = null; return false; }
  gl.useProgram(pr);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  ['uRes', 'uTime', 'uFocal', 'uCam', 'uR', 'uU', 'uF', 'uSun', 'uA', 'uB', 'uBound', 'uK', 'uHeat', 'uFormed', 'uTunnel', 'uTPhase', 'uFlash', 'uShock', 'uRing', 'uBloom', 'uSpin', 'uShockC', 'uShockN', 'uRingN']
    .forEach(n => U[n] = gl.getUniformLocation(pr, n));
  return true;
}

/* ───────────── camera ───────────── */
const cam = { pos: V(0, .3, 46), tgt: V(-.4, .6, 0), vel: V(), r: V(1, 0, 0), u: V(0, 1, 0), f: V(0, 0, -1), eye: V(0, .3, 46) };
function camBasis() {
  const f = norm(sub(cam.tgt, cam.eye)), r = norm(cross(f, V(0, 1, 0))), u = cross(r, f);
  cam.f = f; cam.r = r; cam.u = u;
}
function project(p) {
  const v = sub(p, cam.eye), z = dot(v, cam.f);
  if (z < .05) return null;
  const k = FOCAL / z;
  return { x: W / 2 + dot(v, cam.r) * k * H, y: H / 2 - dot(v, cam.u) * k * H, z, s: k * H };
}
let ST = null;
function occluded(p) {
  const v = sub(p, cam.eye), L = len(v), d = mul(v, 1 / L);
  for (const [c, r] of [[ST.A, ST.rA], [ST.B, ST.rB]]) {
    const oc = sub(c, cam.eye), t = dot(oc, d); if (t <= 0) continue;
    const q = len(sub(oc, mul(d, t))); if (q >= r) continue;
    if (t - Math.sqrt(r * r - q * q) < L) return true;
  }
  return false;
}

/* ───────────── sprites ───────────── */
const PAL = Object.assign({ deep: '#5c0722', mid: '#c3264f', edge: '#ff9db6' }, S.camellia || {});
function makeFeather() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.translate(10, 32);
  const vane = new Path2D(); vane.moveTo(0, 0); vane.bezierCurveTo(60, -27, 170, -25, 238, -2); vane.bezierCurveTo(170, 17, 70, 23, 0, 0);
  const gr = g.createLinearGradient(0, -22, 0, 22); gr.addColorStop(0, '#2c1a4c'); gr.addColorStop(.5, '#09060f'); gr.addColorStop(1, '#1c1132');
  g.fillStyle = gr; g.fill(vane);
  g.save(); g.clip(vane); g.strokeStyle = 'rgba(175,135,255,.42)'; g.lineWidth = 1;
  for (let x = 6; x < 236; x += 4.5) { g.beginPath(); g.moveTo(x, 0); g.quadraticCurveTo(x + 10, -10, x + 22, -26); g.moveTo(x, 0); g.quadraticCurveTo(x + 10, 10, x + 22, 24); g.stroke(); }
  g.restore();
  g.strokeStyle = 'rgba(205,170,255,.75)'; g.lineWidth = 1.6; g.stroke(vane);
  g.strokeStyle = 'rgba(235,220,255,.8)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-9, .5); g.quadraticCurveTo(120, -3, 238, -2); g.stroke();
  return c;
}
function makePetal() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.translate(32, 60);
  const p = new Path2D(); p.moveTo(0, 0); p.bezierCurveTo(-27, -10, -31, -46, -7, -55); p.quadraticCurveTo(0, -51, 7, -55); p.bezierCurveTo(31, -46, 27, -10, 0, 0);
  const gr = g.createRadialGradient(0, -6, 2, 0, -20, 50); gr.addColorStop(0, PAL.deep); gr.addColorStop(.5, PAL.mid); gr.addColorStop(1, PAL.edge);
  g.fillStyle = gr; g.fill(p); g.strokeStyle = 'rgba(255,215,228,.35)'; g.lineWidth = 1; g.stroke(p);
  return c;
}
const FEATHER = makeFeather(), PETAL = makePetal();

/* ───────────── camellia & objects ───────────── */
const LAYERS = [[9, 1, 0], [8, .87, .36], [8, .74, .1], [7, .61, .52], [6, .48, .2], [5, .36, .66], [4, .25, .05], [3, .15, .4]];
function camellia(g, x, y, s, open, t) {
  g.save(); g.translate(x, y);
  const glow = g.createRadialGradient(0, 0, 0, 0, 0, s * 2.4);
  glow.addColorStop(0, 'rgba(255,90,140,.28)'); glow.addColorStop(1, 'rgba(255,90,140,0)');
  g.globalCompositeOperation = 'lighter'; g.fillStyle = glow; g.fillRect(-s * 2.4, -s * 2.4, s * 4.8, s * 4.8);
  g.globalCompositeOperation = 'source-over';
  g.scale(1, .8);
  LAYERS.forEach(([n, r, rot], li) => {
    const lo = li >= 5 ? .6 + .4 * open : sstep(li * .1, li * .1 + .55, open);
    if (lo <= .01) return;
    const L = s * r * lo, w = L * .8;
    const gr = g.createRadialGradient(0, 0, L * .05, 0, 0, L);
    const shade = li / LAYERS.length;
    gr.addColorStop(0, PAL.deep); gr.addColorStop(.55 - shade * .15, PAL.mid); gr.addColorStop(1, shade > .6 ? PAL.mid : PAL.edge);
    for (let i = 0; i < n; i++) {
      const a = rot + i * 6.2832 / n + Math.sin(t * .6 + li + i) * .015;
      g.save(); g.rotate(a);
      g.beginPath(); g.moveTo(0, 0);
      g.bezierCurveTo(-w * .55, -L * .12, -w * .64, -L * .9, -w * .08, -L);
      g.quadraticCurveTo(0, -L * .96, w * .08, -L);
      g.bezierCurveTo(w * .64, -L * .9, w * .55, -L * .12, 0, 0);
      g.fillStyle = gr; g.fill();
      g.strokeStyle = 'rgba(255,215,228,' + (.18 + shade * .15) + ')'; g.lineWidth = Math.max(.6, s * .012); g.stroke();
      g.restore();
    }
  });
  g.restore();
}
function leaf(g, x, y, l, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  const gr = g.createLinearGradient(0, -l * .3, 0, l * .3); gr.addColorStop(0, '#2f6e58'); gr.addColorStop(1, '#0c2a22');
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * .5, -l * .34, l, 0); g.quadraticCurveTo(l * .5, l * .3, 0, 0);
  g.fillStyle = gr; g.fill(); g.strokeStyle = 'rgba(170,240,210,.25)'; g.lineWidth = .8;
  g.beginPath(); g.moveTo(l * .05, 0); g.lineTo(l * .9, 0); g.stroke(); g.restore();
}
function drawHerGarden(g, P, R, st, t) {
  const a = st.objects; if (a <= .01 || R < 5) return;
  const s = R * .17, stem = R * .24, x = P.x, y = P.y;
  g.save(); g.globalAlpha = a;
  g.strokeStyle = '#1c3a2f'; g.lineWidth = Math.max(1, R * .016); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + R * .03, y - stem * .5, x, y - stem); g.stroke();
  leaf(g, x + R * .01, y - stem * .38, R * .13, -.5); leaf(g, x - R * .005, y - stem * .55, R * .11, Math.PI + .55);
  camellia(g, x, y - stem, s * (.35 + .65 * st.flower), st.flower, t);
  // glass dome
  const dw = s * 1.55, dh = stem + s * 1.35;
  g.globalAlpha = a * st.dome;
  const dg = g.createLinearGradient(x - dw, 0, x + dw, 0);
  dg.addColorStop(0, 'rgba(210,200,255,.16)'); dg.addColorStop(.35, 'rgba(210,200,255,.03)'); dg.addColorStop(1, 'rgba(210,200,255,.1)');
  g.beginPath(); g.moveTo(x - dw, y); g.lineTo(x - dw, y - dh + dw); g.arc(x, y - dh + dw, dw, Math.PI, 0); g.lineTo(x + dw, y); g.closePath();
  g.fillStyle = dg; g.fill(); g.strokeStyle = 'rgba(230,222,255,.35)'; g.lineWidth = 1; g.stroke();
  g.beginPath(); g.ellipse(x, y, dw, dw * .18, 0, 0, Math.PI); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = Math.max(1, R * .012);
  g.beginPath(); g.arc(x, y - dh + dw, dw * .78, Math.PI * 1.12, Math.PI * 1.38); g.stroke();
  g.fillStyle = 'rgba(230,222,255,.55)'; g.beginPath(); g.arc(x, y - dh - R * .012, Math.max(1.2, R * .018), 0, 7); g.fill();
  g.restore();
}
function drawLamp(g, P, R, st, t) {
  const a = st.objects; if (a <= .01 || R < 5) return;
  const h = R * .36, x = P.x, y = P.y, ink = '#120d1a';
  g.save(); g.globalAlpha = a; g.strokeStyle = ink; g.fillStyle = ink; g.lineCap = 'round';
  g.lineWidth = Math.max(1.2, R * .014); g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - h); g.stroke();
  g.beginPath(); g.ellipse(x, y, R * .03, R * .01, 0, 0, 7); g.fill();
  g.lineWidth = Math.max(.8, R * .008); g.beginPath(); g.moveTo(x - R * .035, y - h * .72); g.lineTo(x + R * .035, y - h * .72); g.stroke();
  const lw = R * .027, lh = R * .06, ly = y - h - lh;
  const on = st.lamp * (.9 + .1 * Math.sin(t * 11) * Math.sin(t * 6.7));
  if (on > .02) {
    g.globalCompositeOperation = 'lighter';
    const cx = x, cy = ly + lh * .55, gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * .75);
    gr.addColorStop(0, `rgba(255,220,160,${.8 * on})`); gr.addColorStop(.1, `rgba(255,175,105,${.42 * on})`); gr.addColorStop(.4, `rgba(255,120,90,${.1 * on})`); gr.addColorStop(1, 'rgba(255,120,80,0)');
    g.fillStyle = gr; g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.globalCompositeOperation = 'source-over';
  }
  const glass = g.createLinearGradient(0, ly, 0, ly + lh);
  glass.addColorStop(0, `rgba(255,236,190,${.25 + .75 * on})`); glass.addColorStop(1, `rgba(255,170,90,${.2 + .7 * on})`);
  g.fillStyle = glass; g.beginPath(); g.moveTo(x - lw * .8, ly + lh); g.lineTo(x - lw, ly); g.lineTo(x + lw, ly); g.lineTo(x + lw * .8, ly + lh); g.closePath(); g.fill();
  g.strokeStyle = ink; g.lineWidth = Math.max(.7, R * .006); g.stroke();
  g.fillStyle = ink; g.beginPath(); g.moveTo(x - lw * 1.35, ly); g.lineTo(x + lw * 1.35, ly); g.lineTo(x, ly - lh * .55); g.closePath(); g.fill();
  g.beginPath(); g.arc(x, ly - lh * .6, Math.max(.8, R * .007), 0, 7); g.fill();
  g.restore();
}

/* ───────────── particles ───────────── */
seed = 11;
const DUST = Array.from({ length: 240 }, () => ({ p: V(rr(-9, 9), rr(-9, 9), rr(-9, 9)), b: rr(.3, 1) }));
const FEATHERS = Array.from({ length: 34 }, () => ({ p: V(rr(-7, 8), rr(-4, 5), rr(12, 44)), a: rr(0, 6.28), sp: rr(-.25, .25), s: rr(.5, 1.1), ph: rr(0, 6.28) }));
// ворон снизу, крылья раскрыты: голова, тело, клиновидный хвост, два крыла
const RAVEN = (() => { const P = [[0, .34], [0, .22], [0, .08], [0, -.16], [0, -.32], [-.12, -.52], [.12, -.52], [0, -.58],
  [-.3, .2], [-.6, .16], [-.88, .02], [-.4, -.04], [.3, .2], [.6, .16], [.88, .02], [.4, -.04]];
  const a = -.28; return P.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]); })();
const RAVEN_E = [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6], [5, 7], [6, 7], [2, 8], [8, 9], [9, 10], [10, 11], [11, 3], [2, 12], [12, 13], [13, 14], [14, 15], [15, 3]];
const RAVEN_C = V(-15, 11, -40), RAVEN_S = 15;
let petals = [], debris = [];
function spawnPetal(p, v, life) { petals.push({ p, v, a: rr(0, 6.28), sp: rr(-2, 2), fl: rr(0, 6.28), s: rr(.05, .09), age: 0, life }); }
function burstDebris() {
  debris = []; seed = 99;
  const P = add(CONTACT.A, mul(CONTACT.dir, RA));
  for (let i = 0; i < 520; i++) {
    let d = rdir(); d = norm(sub(d, mul(CONTACT.dir, dot(d, CONTACT.dir) * .7)));
    debris.push({ p: P.slice(), v: mul(d, rr(.6, 4.8)), age: 0, life: rr(2.5, 7), h: rnd() });
  }
  for (let i = 0; i < 70; i++) spawnPetal(add(P, mul(rdir(), .3)), mul(rdir(), rr(.4, 1.6)), rr(6, 12));
}

/* ───────────── confession stars ───────────── */
const CONF = S.confessions || [];
const confess = { on: false, t0: 0, stars: [], seen: new Set() };
seed = 5;
CONF.forEach((c, i) => {
  const a = i / Math.max(1, CONF.length) * 6.2832 + rr(-.2, .2);
  const r = rr(3.2, 4.3);
  confess.stars.push({ a, r, y: rr(-1.6, 1.9), tw: rr(0, 6), sx: 0, sy: 0, vis: false });
});

/* ───────────── overlay render ───────────── */
function drawFX(T, dt, wall) {
  const g = fx; g.setTransform(DPR, 0, 0, DPR, 0, 0); g.clearRect(0, 0, W, H);
  const st = ST;
  // constellation
  if (st.constelA > .01) {
    const pts = RAVEN.map(([x, y]) => project(add(RAVEN_C, V(x * RAVEN_S, y * RAVEN_S, 0))));
    g.save(); g.globalAlpha = st.constelA; g.strokeStyle = 'rgba(190,165,255,.32)'; g.lineWidth = 1;
    const nE = RAVEN_E.length * st.constel;
    RAVEN_E.forEach(([a, b], i) => {
      const f = clamp(nE - i); if (f <= 0 || !pts[a] || !pts[b]) return;
      g.beginPath(); g.moveTo(pts[a].x, pts[a].y); g.lineTo(lerp(pts[a].x, pts[b].x, f), lerp(pts[a].y, pts[b].y, f)); g.stroke();
    });
    g.globalCompositeOperation = 'lighter';
    pts.forEach((p, i) => { if (!p) return; const tw = .7 + .3 * Math.sin(wall * 1.3 + i * 2.1); star(g, p.x, p.y, 2.2 + (i % 3), tw, '220,205,255'); });
    g.restore();
  }
  // dust
  g.save(); g.globalCompositeOperation = 'lighter';
  const vel = cam.vel, sp = len(vel);
  DUST.forEach(d => {
    g.lineWidth = 1;
    const rel = d.p.map((v, i) => { const c = cam.eye[i]; let x = ((v - c) % 18 + 27) % 18 - 9; return x; });
    const w = add(cam.eye, rel); const p = project(w); if (!p || p.z > 9) return;
    const a = d.b * (1 - p.z / 9) * .7;
    if (sp > 1.5) { const q = project(sub(w, mul(vel, .045))); if (q) { g.strokeStyle = `rgba(200,190,255,${a * .8})`; g.lineWidth = 1; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke(); return; } }
    g.fillStyle = `rgba(210,200,255,${a})`; g.fillRect(p.x, p.y, 1.3, 1.3);
  });
  g.restore();
  // feathers
  if (st.feathers > .01) {
    FEATHERS.forEach(f => {
      const w = add(f.p, V(Math.sin(wall * .2 + f.ph) * .6, -((wall * .12 + f.ph) % 9) + 4.5, 0));
      const p = project(w); if (!p || p.z < .6) return;
      const sz = p.s * f.s; if (sz < 4) return;
      const near = clamp((p.z - .6) / 2) * clamp((30 - p.z) / 10);
      g.save(); g.globalAlpha = st.feathers * near * .9; g.translate(p.x, p.y); g.rotate(f.a + Math.sin(wall * .5 + f.ph) * .4);
      g.scale(1, .75 + .25 * Math.sin(wall * .7 + f.ph)); g.drawImage(FEATHER, -sz / 2, -sz / 8, sz, sz / 4); g.restore();
    });
  }
  // planet objects
  if (st.objects > .01 && st.tunnel < .6) {
    const pa = project(add(st.A, V(0, st.rA * .985, 0))), pb = project(add(st.B, V(0, st.rB * .985, 0)));
    if (pa) drawHerGarden(g, pa, pa.s * st.rA, st, wall);
    if (pb && !occluded(add(st.B, V(0, st.rB * 1.05, 0)))) drawLamp(g, pb, pb.s * st.rB, st, wall);
  }
  // petals
  petals.forEach(q => {
    const p = project(q.p); if (!p || occluded(q.p)) return;
    const sz = p.s * q.s; if (sz < 1.5) return;
    const a = Math.min(1, q.age * 2) * clamp((q.life - q.age) / 2);
    g.save(); g.globalAlpha = a; g.translate(p.x, p.y); g.rotate(q.a); g.scale(Math.cos(q.fl), 1);
    g.drawImage(PETAL, -sz / 2, -sz / 2, sz, sz); g.restore();
  });
  // debris
  if (debris.length) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    debris.forEach(d => {
      if (d.age >= d.life) return; const p = project(d.p); if (!p || occluded(d.p)) return;
      const q = project(sub(d.p, mul(d.v, .06))); if (!q) return;
      const k = d.age / d.life, heat = Math.exp(-d.age * 1.2);
      const c = heat > .5 ? '255,235,240' : d.h > .5 ? '255,120,160' : '170,140,255';
      g.strokeStyle = `rgba(${c},${(1 - k) * .9})`; g.lineWidth = Math.max(1, p.s * .012 * (1 - k * .6));
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
    });
    g.restore();
  }
  // confession stars
  if (confess.on) {
    const cl = T - confess.t0;
    g.save(); g.globalCompositeOperation = 'lighter';
    confess.stars.forEach((s, i) => {
      const a = s.a + wall * .02;
      const pt = W / H < .8, kx = pt ? .55 : 1, ky = pt ? 2.1 : 1;
      const w = add(M, V(Math.cos(a) * s.r * kx, s.y * ky, Math.sin(a) * s.r * kx));
      const p = project(w); s.vis = false; if (!p) return;
      const appear = sstep(3 + i * .45, 4.5 + i * .45, cl);
      if (appear <= 0 || occluded(w)) return;
      s.sx = p.x; s.sy = p.y; s.vis = appear > .5;
      const tw = .75 + .25 * Math.sin(wall * 1.6 + s.tw);
      const seen = confess.seen.has(i);
      star(g, p.x, p.y, (seen ? 5 : 7.5) * (s.hover ? 1.35 : 1), appear * tw, seen ? '200,190,255' : '255,170,200');
    });
    g.restore();
  }
}
function star(g, x, y, r, a, rgb) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r * 4);
  gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(.15, `rgba(${rgb},${a * .8})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(x - r * 4, y - r * 4, r * 8, r * 8);
  g.strokeStyle = `rgba(${rgb},${a * .55})`; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x - r * 2.6, y); g.lineTo(x + r * 2.6, y); g.moveTo(x, y - r * 2.6); g.lineTo(x, y + r * 2.6); g.stroke();
}

function stepParticles(T, dt, prevT) {
  // petals from her flower
  if (ST.key === 'her' && ST.flower > .5 && Math.random() < dt * .45) {
    const top = add(ST.A, V(0, ST.rA * 1.22, 0)); spawnPetal(add(top, mul(rdir(), .05)), V(rr(.05, .25), rr(.02, .12), rr(-.1, .1)), 9);
  }
  if (prevT < SC.pull.start + SC.pull.dur * .78 && T >= SC.pull.start + SC.pull.dur * .78) {
    seed = 3; const top = add(ST.A, V(0, ST.rA * 1.2, 0));
    for (let i = 0; i < 26; i++) spawnPetal(add(top, mul(rdir(), .06)), add(mul(rdir(), rr(.1, .5)), V(0, .2, 0)), rr(5, 9));
  }
  if (prevT < SC.impact.start && T >= SC.impact.start) { burstDebris(); boom(); }
  if (ST.key === 'born' && Math.random() < dt * 1.6) {
    const a = rr(0, 6.28), r = RN * rr(1.6, 2.6);
    spawnPetal(add(M, V(Math.cos(a) * r, rr(-.4, .9), Math.sin(a) * r)), V(-Math.sin(a) * .25, -.04, Math.cos(a) * .25), rr(7, 12));
  }
  petals.forEach(q => {
    q.age += dt; q.a += q.sp * dt; q.fl += dt * 3;
    const toM = sub(M, q.p);
    if (T >= SC.impact.start) { const dl = len(toM); q.v = add(q.v, mul(cross(V(0, 1, 0), toM), dt * .12 / Math.max(dl, .5))); q.v = add(q.v, mul(toM, dt * .02)); }
    q.v = mul(q.v, 1 - dt * .15); q.p = add(q.p, mul(q.v, dt));
  });
  petals = petals.filter(q => q.age < q.life);
  debris.forEach(d => {
    d.age += dt; d.v = mul(d.v, 1 - dt * .55);
    const toM = sub(M, d.p); d.v = add(d.v, mul(toM, dt * .12));
    d.v = add(d.v, mul(cross(V(0, 1, 0), toM), dt * .08));
    d.p = add(d.p, mul(d.v, dt));
  });
  if (debris.length && debris.every(d => d.age >= d.life)) debris = [];
}

/* ───────────── sound ───────────── */
const voice = $('#voice');
let AC = null, master = null, voiceOK = false, muted = false;
function initAudio() {
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = muted ? 0 : (S.ambientVolume ?? .55); master.connect(AC.destination);
  } catch (e) { AC = null; }
}
let ambientOn = false, verb = null;
function startAmbient() {
  if (!AC || ambientOn || S.ambient === false) return; ambientOn = true;
  const delay = AC.createDelay(2); delay.delayTime.value = .42; const fb = AC.createGain(); fb.gain.value = .42;
  const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
  delay.connect(lp); lp.connect(fb); fb.connect(delay); lp.connect(master); verb = delay;
  // pad
  const padF = AC.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 520; padF.Q.value = .6; padF.connect(master);
  const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = .05; lg.gain.value = 220; lfo.connect(lg); lg.connect(padF.frequency); lfo.start();
  const chords = [[146.83, 220, 349.23], [116.54, 174.61, 293.66], [130.81, 196, 329.63], [110, 164.81, 261.63]];
  let ci = 0;
  const playChord = () => {
    const t = AC.currentTime;
    chords[ci % chords.length].forEach((f, j) => {
      [0, 1].forEach(dd => {
        const o = AC.createOscillator(), gg = AC.createGain(); o.type = dd ? 'sine' : 'triangle';
        o.frequency.value = f * (dd ? 1.003 : .998);
        gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(.05 / (j + 1.5), t + 4); gg.gain.linearRampToValueAtTime(0, t + 13);
        o.connect(gg); gg.connect(padF); o.start(t); o.stop(t + 13.2);
      });
    });
    ci++;
  };
  playChord(); setInterval(playChord, 10000);
  // music box
  const notes = [587.33, 698.46, 783.99, 880, 1046.5, 1174.66, 1396.91];
  const tick = () => {
    if (Math.random() < .62) {
      const t = AC.currentTime, f = notes[Math.floor(Math.random() * notes.length)];
      [1, 3.01, 5.4].forEach((h, j) => {
        const o = AC.createOscillator(), gg = AC.createGain(); o.type = 'sine'; o.frequency.value = f * h;
        gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(.032 / (1 + j * 3), t + .005); gg.gain.exponentialRampToValueAtTime(.0001, t + 2.2 / (1 + j));
        o.connect(gg); gg.connect(master); gg.connect(delay); o.start(t); o.stop(t + 2.4);
      });
    }
    setTimeout(tick, 900 + Math.random() * 2200);
  };
  setTimeout(tick, 2500);
}
function boom() {
  if (!AC) return; const t = AC.currentTime;
  const n = AC.createBuffer(1, AC.sampleRate * 4, AC.sampleRate), d = n.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const src = AC.createBufferSource(); src.buffer = n;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1400, t); f.frequency.exponentialRampToValueAtTime(50, t + 3.5);
  const g = AC.createGain(); g.gain.setValueAtTime(.9, t); g.gain.exponentialRampToValueAtTime(.001, t + 4);
  src.connect(f); f.connect(g); g.connect(master); if (verb) g.connect(verb); src.start(t);
  const o = AC.createOscillator(), og = AC.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(28, t + 3);
  og.gain.setValueAtTime(.7, t); og.gain.exponentialRampToValueAtTime(.001, t + 3.5); o.connect(og); og.connect(master); o.start(t); o.stop(t + 3.6);
  // shimmer
  [1318.5, 1567.98, 1975.53, 2349.3].forEach((fq, i) => {
    const s = AC.createOscillator(), sg = AC.createGain(); s.frequency.value = fq; const tt = t + 1.2 + i * .35;
    sg.gain.setValueAtTime(0, tt); sg.gain.linearRampToValueAtTime(.025, tt + .02); sg.gain.exponentialRampToValueAtTime(.0001, tt + 3);
    s.connect(sg); sg.connect(master); if (verb) sg.connect(verb); s.start(tt); s.stop(tt + 3.1);
  });
}
function checkVoice() {
  return new Promise(res => {
    if (!S.voice) return res(false);
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    voice.addEventListener('canplaythrough', () => fin(true), { once: true });
    voice.addEventListener('loadedmetadata', () => setTimeout(() => fin(true), 1500), { once: true });
    voice.addEventListener('error', () => fin(false), { once: true });
    voice.src = S.voice; voice.volume = S.voiceVolume ?? 1; voice.load();
    setTimeout(() => fin(voice.readyState >= 1), 7000);
  });
}

/* ───────────── clock ───────────── */
const clock = { started: false, paused: false, T: -(S.preroll ?? 4.5), vStarted: false, wall: 0 };
function advance(dt) {
  clock.T += dt;
  if (!voiceOK) return;
  if (!clock.vStarted && clock.T >= 0 && clock.T < (voice.duration || 1e9)) {
    clock.vStarted = true; try { voice.currentTime = Math.max(0, clock.T); } catch (e) {}
    voice.play().catch(() => { voiceOK = false; });
  }
  if (clock.vStarted && !voice.paused && !voice.ended) {
    const vt = voice.currentTime, d = vt - clock.T;
    if (Math.abs(d) > .25) clock.T = vt; else clock.T += d * .08;
  }
}

/* ───────────── subtitles ───────────── */
const subs = $('#subs'), live = new Map();
function buildLine(l) {
  const el = document.createElement('div'); el.className = 'line'; el.dataset.pos = l.pos;
  const words = []; let c = 0; const total = plain(l.text).length || 1;
  l.text.split(/(\*[^*]+\*)/).forEach(part => {
    if (!part) return; const em = /^\*[^*]+\*$/.test(part), txt = em ? part.slice(1, -1) : part;
    txt.split(/(\s+)/).forEach(tok => {
      if (!tok) return;
      if (/^\s+$/.test(tok)) { el.appendChild(document.createTextNode(' ')); c += 1; return; }
      const sp = document.createElement('span'); sp.className = 'w' + (em ? ' em' : ''); sp.textContent = tok; el.appendChild(sp);
      words.push({ el: sp, t: l.at + (c / total) * l.reveal }); c += tok.length;
    });
  });
  return { el, words };
}
function updateText(T) {
  let bottom = false;
  LINES.forEach(l => {
    if (!l.text) return;
    const vis = T >= l.at - .05 && T < l.hideAt && !confess.on;
    let r = live.get(l.i);
    if (vis && !r) { r = buildLine(l); subs.appendChild(r.el); live.set(l.i, r); }
    if (!r) return;
    if (vis && l.pos === 'bottom') bottom = true;
    if (!vis && !r.leaving) { r.leaving = true; r.el.classList.add('out'); setTimeout(() => { r.el.remove(); live.delete(l.i); }, 1300); }
    if (vis) r.words.forEach(w => w.el.classList.toggle('on', T >= w.t));
  });
  $('#scrim').classList.toggle('on', bottom || confess.on);
}

/* ───────────── finale & letters ───────────── */
function startConfess(T) {
  if (confess.on) return; confess.on = true; confess.t0 = T;
  $('#pname').textContent = S.planetName || ''; $('#psub').textContent = S.planetSubtitle || '';
  setTimeout(() => $('#finale').classList.add('on'), 600);
  $('#hint').textContent = S.finaleHint || '';
  setTimeout(() => $('#hint').classList.add('on'), 3500);
  setTimeout(() => $('#endbar').classList.add('on'), 6000);
}
const letter = $('#letter');
let letterAudio = null;
function openLetter(i) {
  const c = CONF[i]; if (!c) return; confess.seen.add(i);
  $('#ltitle').textContent = c.title || '';
  const b = letter.querySelector('.body'); b.innerHTML = '';
  (c.text || '').split(/\n\s*\n/).forEach(par => { const p = document.createElement('p'); p.textContent = fill(par); b.appendChild(p); });
  letter.classList.add('on'); letter.querySelector('.x').focus();
  if (letterAudio) letterAudio.pause();
  if (c.voice) { letterAudio = new Audio(c.voice); letterAudio.play().catch(() => {}); }
}
function openList() {
  $('#ltitle').textContent = 'Письма'; const b = letter.querySelector('.body'); b.innerHTML = '';
  const ul = document.createElement('ul');
  CONF.forEach((c, i) => { const li = document.createElement('li'), bt = document.createElement('button'); bt.textContent = c.title; if (confess.seen.has(i)) bt.className = 'seen'; bt.onclick = () => openLetter(i); li.appendChild(bt); ul.appendChild(li); });
  b.appendChild(ul); letter.classList.add('on');
}
function closeLetter() { letter.classList.remove('on'); if (letterAudio) letterAudio.pause(); }
letter.querySelector('.x').onclick = closeLetter;
letter.addEventListener('click', e => { if (e.target === letter) closeLetter(); });
addEventListener('keydown', e => { if (e.key === 'Escape') closeLetter(); });
$('#all').onclick = openList;
$('#again').onclick = () => { location.href = location.pathname; };
function hitStar(x, y) {
  let best = -1, bd = 30;
  confess.stars.forEach((s, i) => { if (!s.vis) return; const d = Math.hypot(s.sx - x, s.sy - y); if (d < bd) { bd = d; best = i; } });
  return best;
}
fxc.style.pointerEvents = 'none';
addEventListener('pointerdown', e => {
  if (!confess.on || letter.classList.contains('on') || e.target.closest('button')) return;
  const i = hitStar(e.clientX, e.clientY); if (i >= 0) openLetter(i);
});
addEventListener('pointermove', e => {
  if (!confess.on) return; const i = hitStar(e.clientX, e.clientY);
  confess.stars.forEach((s, j) => s.hover = j === i); document.body.style.cursor = i >= 0 ? 'pointer' : '';
});

/* ───────────── controls ───────────── */
$('#mute').onclick = () => {
  muted = !muted; voice.muted = muted; if (master) master.gain.value = muted ? 0 : (S.ambientVolume ?? .55);
  $('#mute .wv').style.opacity = muted ? .15 : 1; $('#mute').setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');
};
$('#pause').onclick = () => {
  clock.paused = !clock.paused;
  if (clock.paused) { voice.pause(); AC && AC.suspend(); } else { if (clock.vStarted && !voice.ended) voice.play().catch(() => {}); AC && AC.resume(); }
  $('#pause').innerHTML = clock.paused ? '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5l11 7-11 7z"/></svg>' : '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
};

/* ───────────── main loop ───────────── */
let last = performance.now(), prevT = clock.T, frames = 0, acc = 0, lastAdapt = 0, snap = true;
function frame(now) {
  const dt = Math.min(.1, (now - last) / 1000); last = now; clock.wall += dt;
  if (clock.started && !clock.paused) advance(dt);
  const T = clock.T;
  if (clock.started && !confess.on && T > TOTAL + 1.5) startConfess(T);
  ST = direct(T);
  // camera spring
  const k = snap ? 1 : 1 - Math.exp(-dt * ST.camRate);
  const prev = cam.eye.slice();
  cam.pos = mix3(cam.pos, ST.camPos, k); cam.tgt = mix3(cam.tgt, ST.camTgt, k); snap = false;
  cam.eye = add(cam.pos, ST.shake); camBasis();
  cam.vel = dt > 0 ? mul(sub(cam.eye, prev), 1 / dt) : V();
  if (clock.started && !clock.paused) stepParticles(T, dt, prevT);
  prevT = T;
  if (gl && clock.started) renderGL(T, dt);
  drawFX(T, dt, clock.wall);
  updateText(T);
  if (DEBUG) $('#dbg').textContent = `t ${T.toFixed(2)}  ${ST.key} ${ST.lt.toFixed(1)}/${SC[ST.key].dur.toFixed(1)}  scale ${glScale.toFixed(2)}  fps ${(1 / Math.max(dt, 1e-3)).toFixed(0)}`;
  // adaptive resolution
  acc += dt; frames++;
  if (clock.wall - lastAdapt > 2 && frames > 20) {
    const avg = acc / frames; acc = 0; frames = 0; lastAdapt = clock.wall;
    if (avg > .026 && glScale > .4) { glScale = Math.max(.4, glScale * .82); sizeGL(); }
    else if (avg < .0145 && glScale < Math.min(1.25, DPR)) { glScale = Math.min(Math.min(1.25, DPR), glScale * 1.1); sizeGL(); }
  }
  requestAnimationFrame(frame);
}
let tPhase = 0;
function renderGL(T, dt) {
  const s = ST;
  tPhase += dt * (.5 + (1 - s.tunnel) * 3 + (T < 0 ? .4 : 0));
  gl.uniform2f(U.uRes, glc.width, glc.height); gl.uniform1f(U.uTime, clock.wall); gl.uniform1f(U.uFocal, FOCAL);
  gl.uniform3fv(U.uCam, cam.eye); gl.uniform3fv(U.uR, cam.r); gl.uniform3fv(U.uU, cam.u); gl.uniform3fv(U.uF, cam.f); gl.uniform3fv(U.uSun, SUN);
  gl.uniform4f(U.uA, ...s.A, s.rA); gl.uniform4f(U.uB, ...s.B, s.rB);
  const c = mul(add(s.A, s.B), .5), rad = len(sub(s.A, s.B)) / 2 + Math.max(s.rA, s.rB) + s.K + .15;
  gl.uniform4f(U.uBound, ...c, rad);
  gl.uniform1f(U.uK, s.K); gl.uniform1f(U.uHeat, s.heat); gl.uniform1f(U.uFormed, s.formed); gl.uniform1f(U.uTunnel, s.tunnel); gl.uniform1f(U.uTPhase, tPhase);
  gl.uniform1f(U.uFlash, s.flash); gl.uniform1f(U.uShock, s.shock); gl.uniform1f(U.uRing, s.ring); gl.uniform1f(U.uBloom, s.bloom); gl.uniform1f(U.uSpin, clock.wall * .045);
  gl.uniform3fv(U.uShockC, s.shock >= 0 ? M : add(CONTACT.A, mul(CONTACT.dir, RA)));
  gl.uniform3fv(U.uShockN, norm(V(.15, 1, .25))); gl.uniform3fv(U.uRingN, norm(V(.12, 1, .32)));
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* ───────────── start ───────────── */
function begin() {
  if (clock.started) return;
  initAudio(); if (AC && AC.state === 'suspended') AC.resume();
  if (voiceOK) { const p = voice.play(); if (p) p.then(() => { if (!clock.vStarted) { voice.pause(); voice.currentTime = 0; } }).catch(() => {}); }
  startAmbient();
  $('#door-screen').classList.add('opening');
  setTimeout(() => $('#door-screen').remove(), 3400);
  setTimeout(() => $('#ui').classList.add('on'), 6000);
  clock.started = true; snap = true;
}

/* ───────────── mark tool (?mark) ───────────── */
function markTool() {
  const el = $('#mark'); el.classList.add('on'); $('#door-screen').remove();
  const texts = LINES.map(l => l.text);
  const at = LINES.map(() => null); let idx = 0;
  el.innerHTML = `<h3>Разметка озвучки</h3>
  <div>Нажми «Старт», и в момент, когда ты начинаешь говорить каждую фразу, жми <b>Пробел</b> (или большую кнопку). Пустые строки — паузы: на них тоже жми, когда пауза начинается (например, момент удара).<br>«Назад» отменяет последнюю отметку и отматывает запись.</div>
  <div class="row"><button id="mk-play">▶ Старт</button><button class="big" id="mk-hit">Отметить</button><button id="mk-undo">← Назад</button><span id="mk-t">0.00</span></div>
  <ol id="mk-list"></ol>
  <div class="row"><button id="mk-preview">Посмотреть с этой разметкой</button><button id="mk-copy">Скопировать код</button></div>
  <div>Вставь этот код в story.js вместо всего блока <code>lines: [ … ]</code>:</div>
  <textarea id="mk-out" readonly></textarea>`;
  const list = $('#mk-list');
  const render = () => {
    list.innerHTML = LINES.map((l, i) => `<li class="${i === idx ? 'cur' : at[i] != null ? 'done' : ''}"><b>${at[i] != null ? at[i].toFixed(2) : '—'}</b>${l.scene ? '[' + l.scene + '] ' : ''}${texts[i] ? texts[i].replace(/</g, '&lt;') : '<i>пауза</i>'}</li>`).join('');
    const cur = list.children[idx]; if (cur) cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
    $('#mk-out').value = 'lines: [\n' + (S.lines || []).map((l, i) => '    ' + JSON.stringify(Object.assign({}, l, at[i] != null ? { at: +at[i].toFixed(2) } : {})) + (i < LINES.length - 1 ? ',' : '')).join('\n') + '\n  ],';
  };
  render();
  if (!voiceOK) { $('#mk-t').textContent = 'Файл озвучки не найден: ' + S.voice; }
  const hit = () => { if (idx >= LINES.length) return; at[idx] = voice.currentTime; idx++; render(); };
  $('#mk-play').onclick = () => { voice.currentTime = 0; voice.play(); };
  $('#mk-hit').onclick = hit;
  $('#mk-undo').onclick = () => { if (idx > 0) { idx--; const t = at[idx]; at[idx] = null; voice.currentTime = Math.max(0, (t ?? voice.currentTime) - 2.5); render(); } };
  $('#mk-copy').onclick = () => { $('#mk-out').select(); navigator.clipboard?.writeText($('#mk-out').value); };
  $('#mk-preview').onclick = () => { sessionStorage.setItem('dream-marks', JSON.stringify(at)); location.href = location.pathname; };
  addEventListener('keydown', e => { if (e.code === 'Space') { e.preventDefault(); hit(); } });
  setInterval(() => { if (voiceOK) $('#mk-t').textContent = voice.currentTime.toFixed(2) + ' с'; }, 50);
}

/* ───────────── boot ───────────── */
$('#door-top').textContent = S.door?.top || '';
resize(); addEventListener('resize', resize);
if (!initGL()) glc.style.background = 'radial-gradient(ellipse at 50% 40%,#2a1450,#07050d 70%)';
if (DEBUG) { const d = document.createElement('div'); d.id = 'dbg'; document.body.appendChild(d); }
const fontsReady = (document.fonts ? document.fonts.ready : Promise.resolve()).catch(() => {});
Promise.all([checkVoice(), Promise.race([fontsReady, new Promise(r => setTimeout(r, 3000))])]).then(([ok]) => {
  voiceOK = ok;
  if (MARK) return markTool();
  if (JUMP != null) { $('#door-screen').remove(); clock.T = JUMP; prevT = JUMP - .01; clock.started = true; voiceOK = false; snap = true;
    if (JUMP > SC.impact.start && JUMP < SC.impact.start + 8) { burstDebris(); debris.forEach(d => { for (let t = 0; t < JUMP - SC.impact.start; t += .05) { d.age += .05; d.v = mul(d.v, 1 - .05 * .55); d.p = add(d.p, mul(d.v, .05)); } }); }
    if (JUMP > TOTAL + 1.5) { startConfess(JUMP - 8); }
    $('#ui').classList.add('on'); return; }
  const ds = $('#door-screen'); ds.classList.remove('loading'); $('#door-hint').textContent = S.door?.hint || '';
  $('#door').onclick = begin;
});
requestAnimationFrame(frame);
if (DEBUG) console.log('scenes', JSON.stringify(SC), 'total', TOTAL);
})();
