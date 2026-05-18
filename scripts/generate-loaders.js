#!/usr/bin/env node
// Generates small Skinny-Studio-styled loader Lotties to public/.
// Mirrors the structure of /Users/henrynicholson/Desktop/skinny-logo-lottie/generate.js
// so future designers can extend with the same conventions.
//
// Skinny aesthetic:
//   - Lime accent: #D6FC51
//   - Dark canvas: transparent (caller decides bg)
//   - Liquid feel: motion uses smooth easing, soft alpha breathing
//   - 60fps, looping, no audio
//
// Output: 4 JSONs in /public/:
//   - skinny-loader-drip.json   : a lime droplet falling + ripple (logo-liquid motif)
//   - skinny-loader-wave.json   : 3 vertical bars rising/falling in stagger (audio-EQ feel)
//   - skinny-loader-orbit.json  : 3 small dots orbiting a center (async/processing feel)
//   - skinny-loader-pulse.json  : one soft pulsing ring (Director thinking)

const fs = require('fs')
const path = require('path')

const LIME = [214 / 255, 252 / 255, 81 / 255, 1] // [r,g,b,a] in 0..1 space — Lottie color format
const LIME_FADED = [214 / 255, 252 / 255, 81 / 255, 0.45]
const OUT_DIR = path.join(__dirname, '..', 'public')
const FPS = 60

function shapeBase(name, layers, w, h, op) {
  return {
    v: '5.7.0',
    fr: FPS,
    ip: 0,
    op,
    w,
    h,
    nm: name,
    ddd: 0,
    assets: [],
    layers,
    markers: [],
  }
}

/** Linear keyframe helper. `keys` is [{ t, v, i?, o? }] with t in frames. */
function kf(keys) {
  return {
    a: 1,
    k: keys.map((k, idx) => {
      const next = keys[idx + 1]
      return {
        t: k.t,
        s: Array.isArray(k.v) ? k.v : [k.v],
        ...(next
          ? {
              i: k.i || { x: [0.42], y: [1] },
              o: k.o || { x: [0.58], y: [0] },
            }
          : {}),
      }
    }),
  }
}

function staticVal(v) {
  return { a: 0, k: Array.isArray(v) ? v : [v] }
}

/** Ellipse shape — d=1 ellipse direction, p=center, s=size [w,h]. */
function ellipseShape(cx, cy, w, h) {
  return {
    ty: 'el',
    p: { a: 0, k: [cx, cy] },
    s: { a: 0, k: [w, h] },
    d: 1,
    nm: 'ellipse',
  }
}

/** Rectangle shape. */
function rectShape(cx, cy, w, h, r = 0) {
  return {
    ty: 'rc',
    p: { a: 0, k: [cx, cy] },
    s: { a: 0, k: [w, h] },
    r: { a: 0, k: r },
    d: 1,
    nm: 'rect',
  }
}

function fillShape(color, opacity = 100) {
  return {
    ty: 'fl',
    c: { a: 0, k: color },
    o: Array.isArray(opacity) ? opacity : { a: 0, k: opacity },
    r: 1,
    nm: 'fill',
  }
}

function transform({ p = [0, 0], s = [100, 100], r = 0, o = 100, a = [0, 0] } = {}) {
  return {
    ty: 'tr',
    p: Array.isArray(p) && typeof p[0] === 'object' ? p : { a: 0, k: p },
    a: Array.isArray(a) && typeof a[0] === 'object' ? a : { a: 0, k: a },
    s: Array.isArray(s) && typeof s[0] === 'object' ? s : { a: 0, k: s },
    r: typeof r === 'object' ? r : { a: 0, k: r },
    o: typeof o === 'object' ? o : { a: 0, k: o },
    sk: { a: 0, k: 0 },
    sa: { a: 0, k: 0 },
  }
}

function group(name, items) {
  return { ty: 'gr', nm: name, np: items.length + 1, it: items, hd: false }
}

/** Shape layer wrapper. */
function shapeLayer(name, shapes, op) {
  return {
    ddd: 0,
    ind: 0,
    ty: 4,
    nm: name,
    sr: 1,
    ks: {
      o: { a: 0, k: 100 },
      r: { a: 0, k: 0 },
      p: { a: 0, k: [0, 0] },
      a: { a: 0, k: [0, 0] },
      s: { a: 0, k: [100, 100] },
    },
    ao: 0,
    shapes,
    ip: 0,
    op,
    st: 0,
    bm: 0,
  }
}

// =====================================================================
// 1. DRIP — a lime droplet falls + ripple expands at the bottom
//    The drop scales in at top, falls with ease, hits, ripple ring scales
//    out fading to 0. Loops every 90 frames (1.5s @ 60fps).
// =====================================================================
function genDrip() {
  const W = 120
  const H = 160
  const OP = 90

  // Drop: ellipse, animated y position + opacity scale
  const drop = shapeLayer(
    'drop',
    [
      group('drop-grp', [
        ellipseShape(0, 0, 18, 22),
        fillShape(LIME),
        {
          ty: 'tr',
          p: {
            a: 1,
            k: [
              {
                t: 0,
                s: [W / 2, 24],
                i: { x: 0.42, y: 1 },
                o: { x: 0.58, y: 0 },
              },
              {
                t: 48,
                s: [W / 2, H - 36],
                i: { x: 0.42, y: 1 },
                o: { x: 0.58, y: 0 },
              },
              { t: 56, s: [W / 2, H - 36] },
            ],
          },
          a: { a: 0, k: [0, 0] },
          s: {
            a: 1,
            k: [
              { t: 0, s: [0, 0], i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } },
              {
                t: 10,
                s: [100, 100],
                i: { x: [0.42], y: [1] },
                o: { x: [0.58], y: [0] },
              },
              { t: 40, s: [100, 100] },
              {
                t: 50,
                s: [140, 60],
                i: { x: [0.42], y: [1] },
                o: { x: [0.58], y: [0] },
              },
              { t: 56, s: [0, 0] },
            ],
          },
          r: { a: 0, k: 0 },
          o: {
            a: 1,
            k: [
              { t: 0, s: [0], i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } },
              { t: 8, s: [100] },
              { t: 50, s: [100], i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } },
              { t: 56, s: [0] },
            ],
          },
          sk: { a: 0, k: 0 },
          sa: { a: 0, k: 0 },
        },
      ]),
    ],
    OP,
  )

  // Ripple ring: ellipse stroke, animated scale up + opacity fade
  const ripple = shapeLayer(
    'ripple',
    [
      group('ripple-grp', [
        ellipseShape(0, 0, 20, 8),
        {
          ty: 'st',
          c: { a: 0, k: LIME },
          o: { a: 0, k: 100 },
          w: { a: 0, k: 3 },
          lc: 2,
          lj: 2,
          ml: 4,
          nm: 'stroke',
        },
        {
          ty: 'tr',
          p: { a: 0, k: [W / 2, H - 30] },
          a: { a: 0, k: [0, 0] },
          s: {
            a: 1,
            k: [
              { t: 50, s: [40, 40], i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } },
              { t: 80, s: [240, 240] },
            ],
          },
          r: { a: 0, k: 0 },
          o: {
            a: 1,
            k: [
              { t: 50, s: [0], i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } },
              { t: 56, s: [100], i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } },
              { t: 80, s: [0] },
            ],
          },
          sk: { a: 0, k: 0 },
          sa: { a: 0, k: 0 },
        },
      ]),
    ],
    OP,
  )

  return shapeBase('skinny-loader-drip', [drop, ripple], W, H, OP)
}

// =====================================================================
// 2. WAVE — 3 lime vertical bars rising and falling in a wave pattern.
//    Audio-EQ feel. Loops every 60 frames (1s).
// =====================================================================
function genWave() {
  const W = 120
  const H = 60
  const OP = 60
  const BAR_W = 14
  const GAP = 12
  const center = W / 2
  const xs = [center - (BAR_W + GAP), center, center + (BAR_W + GAP)]
  // Per-bar phase offset (frames). The wave reads left → right.
  const phases = [0, 8, 16]

  const layers = xs.map((cx, i) => {
    const phase = phases[i]
    // Sine-ish wave: bar height oscillates between 16 and 44 over 60 frames.
    const keys = []
    const STEPS = 6
    for (let s = 0; s <= STEPS; s++) {
      const t = (s * OP) / STEPS + phase
      const tWrap = ((t % OP) + OP) % OP
      const angle = (s / STEPS) * Math.PI * 2
      const h = 28 + Math.sin(angle) * 14
      keys.push({
        t: tWrap,
        s: [BAR_W, h],
        i: { x: [0.42], y: [1] },
        o: { x: [0.58], y: [0] },
      })
    }
    // Sort by t — Lottie requires keyframes in ascending order.
    keys.sort((a, b) => a.t - b.t)

    return shapeLayer(
      `bar-${i}`,
      [
        group(`bar-grp-${i}`, [
          rectShape(0, 0, BAR_W, 28, 3),
          fillShape(LIME, 88),
          {
            ty: 'tr',
            p: { a: 0, k: [cx, H / 2] },
            a: { a: 0, k: [0, 0] },
            s: {
              a: 1,
              k: keys.map((k, idx) => ({
                t: k.t,
                s: [100 * (k.s[0] / BAR_W), 100 * (k.s[1] / 28)],
                ...(idx < keys.length - 1
                  ? { i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } }
                  : {}),
              })),
            },
            r: { a: 0, k: 0 },
            o: { a: 0, k: 100 },
            sk: { a: 0, k: 0 },
            sa: { a: 0, k: 0 },
          },
        ]),
      ],
      OP,
    )
  })

  return shapeBase('skinny-loader-wave', layers, W, H, OP)
}

// =====================================================================
// 3. ORBIT — 3 dots circling a center point. 120-frame full rotation.
// =====================================================================
function genOrbit() {
  const W = 120
  const H = 120
  const OP = 120
  const cx = W / 2
  const cy = H / 2
  const RADIUS = 32

  const layers = []
  for (let i = 0; i < 3; i++) {
    const startAngle = i * 120 // degrees
    // Build 7 keyframes around the loop so the motion stays smooth.
    const keys = []
    const STEPS = 6
    for (let s = 0; s <= STEPS; s++) {
      const t = (s * OP) / STEPS
      const angleDeg = startAngle + (s / STEPS) * 360
      const angleRad = (angleDeg * Math.PI) / 180
      const px = cx + Math.cos(angleRad) * RADIUS
      const py = cy + Math.sin(angleRad) * RADIUS
      keys.push({ t, p: [px, py] })
    }

    layers.push(
      shapeLayer(
        `dot-${i}`,
        [
          group(`dot-grp-${i}`, [
            ellipseShape(0, 0, 12 - i * 2, 12 - i * 2),
            fillShape(LIME, 100 - i * 18),
            {
              ty: 'tr',
              p: {
                a: 1,
                k: keys.map((k, idx) => ({
                  t: k.t,
                  s: k.p,
                  ...(idx < keys.length - 1
                    ? { i: { x: 0.42, y: 1 }, o: { x: 0.58, y: 0 } }
                    : {}),
                })),
              },
              a: { a: 0, k: [0, 0] },
              s: { a: 0, k: [100, 100] },
              r: { a: 0, k: 0 },
              o: { a: 0, k: 100 - i * 12 },
              sk: { a: 0, k: 0 },
              sa: { a: 0, k: 0 },
            },
          ]),
        ],
        OP,
      ),
    )
  }

  return shapeBase('skinny-loader-orbit', layers, W, H, OP)
}

// =====================================================================
// 4. PULSE — one soft lime ring breathing in and out. Director-thinking feel.
//    90-frame loop (1.5s).
// =====================================================================
function genPulse() {
  const W = 100
  const H = 100
  const OP = 90

  // Outer ripple ring — scales 60% -> 130%, opacity fades to 0
  const outer = shapeLayer(
    'outer-ring',
    [
      group('outer-grp', [
        ellipseShape(0, 0, 38, 38),
        {
          ty: 'st',
          c: { a: 0, k: LIME },
          o: { a: 0, k: 60 },
          w: { a: 0, k: 2.5 },
          lc: 2,
          lj: 2,
          ml: 4,
          nm: 'stroke',
        },
        {
          ty: 'tr',
          p: { a: 0, k: [W / 2, H / 2] },
          a: { a: 0, k: [0, 0] },
          s: {
            a: 1,
            k: [
              { t: 0, s: [60, 60], i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } },
              { t: 60, s: [140, 140] },
              { t: 90, s: [60, 60] },
            ],
          },
          r: { a: 0, k: 0 },
          o: {
            a: 1,
            k: [
              { t: 0, s: [70], i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } },
              { t: 60, s: [0] },
              { t: 90, s: [70] },
            ],
          },
          sk: { a: 0, k: 0 },
          sa: { a: 0, k: 0 },
        },
      ]),
    ],
    OP,
  )

  // Core dot — soft pulse in opacity + scale
  const core = shapeLayer(
    'core-dot',
    [
      group('core-grp', [
        ellipseShape(0, 0, 16, 16),
        fillShape(LIME),
        {
          ty: 'tr',
          p: { a: 0, k: [W / 2, H / 2] },
          a: { a: 0, k: [0, 0] },
          s: {
            a: 1,
            k: [
              { t: 0, s: [90, 90], i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } },
              { t: 45, s: [115, 115] },
              { t: 90, s: [90, 90] },
            ],
          },
          r: { a: 0, k: 0 },
          o: {
            a: 1,
            k: [
              { t: 0, s: [70], i: { x: [0.42], y: [1] }, o: { x: [0.58], y: [0] } },
              { t: 45, s: [100] },
              { t: 90, s: [70] },
            ],
          },
          sk: { a: 0, k: 0 },
          sa: { a: 0, k: 0 },
        },
      ]),
    ],
    OP,
  )

  return shapeBase('skinny-loader-pulse', [outer, core], W, H, OP)
}

// =====================================================================
// Write all four to public/
// =====================================================================
function writeJson(filename, data) {
  const filepath = path.join(OUT_DIR, filename)
  fs.writeFileSync(filepath, JSON.stringify(data))
  const size = fs.statSync(filepath).size
  console.log(`  ✓ ${filename}  (${(size / 1024).toFixed(1)} KB)`)
}

console.log('Generating Skinny loaders into', OUT_DIR)
writeJson('skinny-loader-drip.json', genDrip())
writeJson('skinny-loader-wave.json', genWave())
writeJson('skinny-loader-orbit.json', genOrbit())
writeJson('skinny-loader-pulse.json', genPulse())
console.log('Done.')
