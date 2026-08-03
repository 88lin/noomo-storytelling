/* eslint-disable */
/**
 * creature-sculpt.js — 七只磨砂小动物的程序化几何（本文件由 img2threejs
 * 流程产出，构建时原样拼进引擎产物，见 tools/creatures.js 的锚点表）。
 *
 * 不是模块：不要写 import / export / module.exports。它是一个 IIFE，
 * 唯一的对外出口是 globalThis.NSCreature。
 */
/**
 * creature.js — procedural frosted creature family.
 *
 * Implements creature-sculpt-spec.json: ONE parametric body plan, seven species
 * that differ only by parameter set. No species has bespoke geometry code.
 *
 * Method: the whole creature is a single signed distance field built from
 * smooth-unioned analytic primitives, polygonised with naive surface nets.
 * That is what makes it a `continuous-sculpt` rather than a pile of
 * intersecting primitives — there is one surface and the joins are real
 * blends, not hidden seams.
 *
 * Vertex normals come from the analytic SDF gradient, not from face averaging,
 * so a coarse grid still shades perfectly smoothly. Only the silhouette is
 * resolution-limited, and two constrained Laplacian passes clean that up.
 *
 * No THREE import: the page bundles its own copy of three.js and does not
 * expose it, so the caller passes in the classes it harvested from live
 * objects. Pure data in, pure data out.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- sdf math
  var min = Math.min, max = Math.max, abs = Math.abs, sqrt = Math.sqrt;
  var sin = Math.sin, cos = Math.cos, PI = Math.PI;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function mix(a, b, t) { return a + (b - a) * t; }

  /** Polynomial smooth minimum (IQ). k is the blend radius in world units. */
  function smin(a, b, k) {
    if (k <= 0) return min(a, b);
    var h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
    return mix(b, a, h) - k * h * (1 - h);
  }
  /** Smooth maximum — used for filleted cuts (the flat seat, the mouth groove). */
  function smax(a, b, k) { return -smin(-a, -b, k); }

  function sdSphere(px, py, pz, r) { return sqrt(px * px + py * py + pz * pz) - r; }

  /**
   * Ellipsoid. The classic bound is (|p/r|-1)*min(r); it under-estimates badly
   * for elongated shapes, which shows up as a lumpy blend. Using the
   * gradient-corrected form keeps the blend even.
   */
  function sdEllipsoid(px, py, pz, rx, ry, rz) {
    var kx = px / rx, ky = py / ry, kz = pz / rz;
    var k0 = sqrt(kx * kx + ky * ky + kz * kz);
    if (k0 === 0) return -min(rx, min(ry, rz));
    var lx = kx / rx, ly = ky / ry, lz = kz / rz;
    var k1 = sqrt(lx * lx + ly * ly + lz * lz);
    return k0 * (k0 - 1.0) / k1;
  }

  /** Capsule between a and b with radius r. */
  function sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, r) {
    var pax = px - ax, pay = py - ay, paz = pz - az;
    var bax = bx - ax, bay = by - ay, baz = bz - az;
    var d = bax * bax + bay * bay + baz * baz;
    var h = d > 0 ? clamp((pax * bax + pay * bay + paz * baz) / d, 0, 1) : 0;
    var dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
    return sqrt(dx * dx + dy * dy + dz * dz) - r;
  }

  /**
   * Round cone between a (radius r1) and b (radius r2): a solid of revolution
   * with rounded caps. This is IQ's exact closed form.
   *
   * The previous implementation approximated it with a chain of five capsules.
   * Each joint in that chain left a small bulge, and because the joints are
   * evenly spaced the bulges came out as regular horizontal ripples running up
   * the ears — clearly visible in the first cat render.
   */
  function sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
    var bax = bx - ax, bay = by - ay, baz = bz - az;
    var l2 = bax * bax + bay * bay + baz * baz;
    if (l2 <= 1e-9) return sdSphere(px - ax, py - ay, pz - az, max(r1, r2));
    var rr = r1 - r2;
    var a2 = l2 - rr * rr;
    var il2 = 1.0 / l2;

    var pax = px - ax, pay = py - ay, paz = pz - az;
    var y = pax * bax + pay * bay + paz * baz;
    var z = y - l2;
    var qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
    var x2 = qx * qx + qy * qy + qz * qz;
    var y2 = y * y * l2;
    var z2 = z * z * l2;

    var k = (rr < 0 ? -1 : (rr > 0 ? 1 : 0)) * rr * rr * x2;
    if ((z < 0 ? -1 : 1) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
    if ((y < 0 ? -1 : 1) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
    return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
  }

  /** Axis-aligned rounded box — used for the whale fluke and the chick beak. */
  function sdRoundBox(px, py, pz, bx, by, bz, r) {
    var qx = abs(px) - bx + r, qy = abs(py) - by + r, qz = abs(pz) - bz + r;
    var mx = max(qx, 0), my = max(qy, 0), mz = max(qz, 0);
    return sqrt(mx * mx + my * my + mz * mz) + min(max(qx, max(qy, qz)), 0) - r;
  }

  /** Rotate a point about X then Z (used to splay/tilt ears without matrices). */
  function rotZ(p, s, c) { var x = p[0], y = p[1]; p[0] = c * x - s * y; p[1] = s * x + c * y; }
  function rotX(p, s, c) { var y = p[1], z = p[2]; p[1] = c * y - s * z; p[2] = s * y + c * z; }

  // ------------------------------------------------------------ species data
  /**
   * Species data.
   *
   * Every field ending in F is a proportion MEASURED off the reference crops by
   * measure_ref.py — not chosen by eye. The first version of this table was
   * hand-tuned and gave the cat ears worth 28% of its total height; the
   * reference cat's ears are 6.7%, which is why that render read as a horned
   * blob rather than a cat. Fractions are:
   *
   *   aspect    maxSilhouetteWidth / totalHeight
   *   crownF    top of the head, as a fraction of total height from the TOP
   *   headYF    the head's widest row
   *   headWF    head width / max silhouette width
   *   neckYF    the narrowest row between head and body
   *   neckWF    neck width / head width
   *   bodyYF    the body's widest row
   *   ear       baseWF | gapF (between the ears) | spanF (outer to outer)
   *
   * Values that a single front view cannot show are assumptions, marked A:
   *   depthK    body depth / body width
   *   headDepthK, bodyWF (how much of the max width is body rather than tail),
   *   and everything about where things sit in Z.
   */
  var HT = 1.0;   // every species is built to the same total height; the page
                  // normalises each one into the slot the timeline gives it

  var SPECIES = [
    {
      // pale/deep solved in closed form against ref/0_cat.png by
      // solve_colour.py (mean band error 6.8/255). The two tints are
      // deliberately close: the reference is a near-flat frosted peach,
      // not the cream-to-orange candy gradient grade() was inventing.
      id: 'cat', hue: '#f6e2c1', pale: '#f7d6cd', deep: '#ecc6b0',
      // aspect is the nominal maxW; the widest row the camera actually sees is
      // maxW*bodyWF, so aspect had to be divided by bodyWF to land the measured
      // silhouette aspect on the reference's 0.5751.
      aspect: 0.6194, crownF: 0.067, headYF: 0.281, headWF: 0.940,
      neckYF: 0.509, neckWF: 0.416, bodyYF: 0.970, headK: 0.17,
      bodyWF: 0.774, depthK: 0.90, headDepthK: 0.92,          // A
      // Solved from the reference's own row runs, not eyeballed. Half-width
      // grows 0.025 -> 0.123 maxW over the first 0.058 of height and the axis
      // moves 0.307 -> 0.260, so the cone base belongs AT the crown (f=0.062,
      // r=0.130 maxW, axis 0.257), not extrapolated below it: continuing the
      // 1.69/unit flare down to f=0.09 made the ears the widest thing in the
      // whole silhouette. This cat's ears are broad and low, not tall spikes.
      ear: { profile: 'point', baseWF: 0.300, gapF: 0.275, spanF: 0.7765,
             tipK: 0.206, lean: 1.195, sink: 0.420 },
      tail: { kind: 'curl', rF: 0.155, sweep: -1 },
      footPlace: { xF: 0.46, yF: 0.078, zF: 1.22, rF: 0.108 },
      chest: { wF: 0.88, ryF: 0.30, yF: 0.56, zF: 0.06, dF: 0.92, kF: 0.26 },
      haunch: { wF: 1.06, ryF: 0.34, yF: 0.26, zF: 0.02, dF: 1.02, kF: 0.26 },
      feet: 'tucked', eyeMode: 'face', snout: 'muzzle', nose: true,
    },
    {
      id: 'rabbit', hue: '#f6d0c6', pale: '#e5d0db', deep: '#e4c5d3',
      aspect: 0.3709, crownF: 0.292, headYF: 0.452, headWF: 0.924,
      // the reference rabbit has almost no waist; 0.473 carved an hourglass
      neckYF: 0.621, neckWF: 0.640, bodyYF: 0.950,
      bodyWF: 0.97, depthK: 0.92, headDepthK: 0.95,          // A
      // widest near the tip, so the cone opens upward into a rounded club
      chest: { wF: 0.78, ryF: 0.30, yF: 0.56, zF: 0.06, dF: 0.94, kF: 0.32 },
      haunch: { wF: 1.34, ryF: 0.40, yF: 0.14, zF: 0.02, dF: 1.12, kF: 0.32 },
      // The measured base width (0.1234) is the width of the ear WHERE IT
      // LEAVES THE SKULL, which on this reference is a pinch. The visible
      // ear is a broad rounded paddle roughly 0.21 of max width across, so
      // that is what the cone has to be built at.
      ear: { profile: 'tall', baseWF: 0.208, gapF: 0.1900, spanF: 0.6076,
             tipK: 1.06, lean: 1.62, sink: 0.28, baseK: 0.86, widen: 1.30 },
      footPlace: { xF: 0.40, yF: 0.068, zF: 1.00, rF: 0.098 },
      tail: { kind: 'puff', rF: 0.16, sweep: 0 },
      feet: 'tucked', eyeMode: 'face', snout: 'muzzle', nose: true,
    },
    {
      id: 'bear', hue: '#f6d0e3', pale: '#ddc4d0', deep: '#e8cad7',
      aspect: 0.5359, crownF: 0.120, headYF: 0.286, headWF: 0.936,
      // a bear is a barrel with a head on it, not an hourglass
      neckYF: 0.505, neckWF: 0.780, bodyYF: 0.695, headK: 0.24,
      bodyWF: 0.98, depthK: 0.92, headDepthK: 0.94,          // A
      ear: { profile: 'button', baseWF: 0.3400, gapF: 0.4700, spanF: 0.8324,
             tipK: 1.00, lean: 1.00, sink: 1.00 },
      tail: { kind: 'puff', rF: 0.09, sweep: 0 },
      feet: 'tucked', eyeMode: 'face', snout: 'muzzle', nose: true,
      footPlace: { xF: 0.44, yF: 0.090, zF: 0.94, rF: 0.130 },
      pads: [{ xF: 0.88, yF: 0.34, zF: 0.22, rx: 0.100, ry: 0.150,
               rz: 0.100, k: 0.50 }],
    },
    {
      id: 'fox', hue: '#edd1f5', pale: '#d0c8e2', deep: '#c3b8df',
      aspect: 0.6619, crownF: 0.205, headYF: 0.330, headWF: 0.868,
      // the measured waist is 0.22 of head width; held at 0.34 so the neck is
      // still a neck and not a stalk at page thumbnail size
      neckYF: 0.493, neckWF: 0.34, bodyYF: 0.752, headK: 0.20,
      bodyWF: 0.745, depthK: 0.88, headDepthK: 0.90,         // A
      chest: { wF: 0.90, ryF: 0.30, yF: 0.56, zF: 0.06, dF: 0.94, kF: 0.30 },
      haunch: { wF: 1.06, ryF: 0.34, yF: 0.25, zF: 0.02, dF: 1.02, kF: 0.30 },
      // measured base width is 0.345 of the silhouette; at that size the two
      // ears meet over the crown and the head reads as a bat's. Halved, and
      // the gap opened to match, which is what the reference actually shows.
      ear: { profile: 'point', baseWF: 0.352, gapF: 0.1450, spanF: 0.8245,
             tipK: 0.27, lean: 0.98, sink: 0.60 },
      tail: { kind: 'bush', rF: 0.222, sweep: 1 },
      footPlace: { xF: 0.44, yF: 0.078, zF: 1.10, rF: 0.108 },
      feet: 'tucked', eyeMode: 'face', snout: 'muzzle', nose: true,
    },
    {
      id: 'chick', hue: '#c7d3f5', pale: '#ccd6ee', deep: '#afc2e1',
      // one egg: headWF and neckWF both measure 1.0, so there is no head lump
      aspect: 0.6660, crownF: 0.004, headYF: 0.546, headWF: 1.000,
      neckYF: 0.546, neckWF: 1.000, bodyYF: 0.546,
      bodyWF: 0.90, depthK: 0.86, headDepthK: 0.86,          // A
      ear: { profile: 'none' },
      tail: { kind: 'fan', rF: 0.10, sweep: -1 },
      feet: 'planted', eyeMode: 'face', snout: 'beak', nose: false,
      // the wings, not the trunk, set the widest point - that is what puts a
      // notch under each wing instead of one unbroken egg outline
      wings: { yF: 0.00, zF: 0.10, rF: 0.205, lean: 0.18 },
    },
    {
      id: 'whale', hue: '#c2eef5', pale: '#c6cee1', deep: '#c1d0e7',
      aspect: 1.6736, crownF: 0.391, headYF: 0.492, headWF: 1.000,
      neckYF: 0.492, neckWF: 1.000, bodyYF: 0.426,
      bodyWF: 0.80, depthK: 0.74, headDepthK: 0.74,          // A
      ear: { profile: 'none' },
      // the fluke rises behind the body and splits into two lobes; measured
      // outer span 0.964 of max width, rising to the full silhouette height
      tail: { kind: 'fluke', rF: 0.072, spanF: 0.964, riseF: 0.391, sweep: 1 },
      feet: 'none', eyeMode: 'side', snout: 'groove', nose: false, fins: true,
    },
    {
      id: 'frog', hue: '#ccf5e2', pale: '#dce7e5', deep: '#c5d3d0',
      aspect: 1.418, crownF: 0.126, headYF: 0.516, headWF: 0.827,
      neckYF: 0.700, neckWF: 0.864, bodyYF: 0.880,
      bodyWF: 0.86, depthK: 0.78, headDepthK: 0.78,          // A
      // the two runs at the top of the frog silhouette are its eye domes, not
      // ears; those numbers drive eyePlacements below
      ear: { profile: 'tympanum', rF: 0.055 },
      eyeDome: { baseWF: 0.2209, gapF: 0.2129, riseF: 0.126 },
      tail: { kind: 'none' },
      feet: 'planted', eyeMode: 'crown', snout: 'groove', nose: false,
      // The default foot placement puts the paws at 0.52*W / 0.66*D, which
      // on a body this wide and shallow is strictly inside the body
      // ellipsoid: the frog came out with no limbs at all. Front paws are
      // pushed out past the chest, rear haunches are separate body masses
      // at the flanks - together they are what makes a frog silhouette
      // wider than it is tall.
      footPlace: { xF: 0.46, yF: 0.072, zF: 1.24, rF: 0.098 },
      // seated low and pushed into the face: the cut the eye reads is
      // the top of this sphere, which curls up at both corners.
      groove: { wx: 0.72, wy: 0.22, wz: 0.20, dy: 0.30, dz: 1.02, k: 0.15 },
      pads: [{ xF: 0.94, yF: -0.04, zF: -0.10, rx: 0.128, ry: 0.090,
               rz: 0.156, k: 0.95 }],
    },
  ];

  /**
   * Build the list of named SDF pieces for one species. Each piece is
   * {id, f(x,y,z), k} where k is the blend radius used when smooth-unioning it
   * into the accumulated field. Piece ids are the componentTree ids, so the
   * built model can be split into the named parts the spec promised.
   */
  function speciesParts(sp) {
    var parts = [];
    var maxW = sp.aspect * HT;                 // full silhouette width
    var W = 0.5 * maxW * sp.bodyWF;            // body half-width
    var D = W * sp.depthK;                     // body half-depth
    var hasHead = sp.headWF < 0.99 || sp.neckWF < 0.95;

    var hRX = 0.5 * sp.headWF * maxW;          // head half-width
    var hRZ = hRX * sp.headDepthK;
    var nCY = HT * (1 - sp.neckYF);            // neck height
    var bCY = HT * (1 - sp.bodyYF);            // body widest row

    // Head. Defined by the two rows a front view can actually locate — the
    // crown and the neck — with the widest row biasing where the equator sits.
    // Deriving the half-height straight from crownF - headYF instead put the
    // fox's equator 0.018 below its crown (its head really is widest right at
    // the ears), which built a disc, and left a gap the blend could not close:
    // bear and fox came out as two disconnected shells.
    var crownY = HT * (1 - sp.crownF);
    var hSpan = max(1e-3, crownY - nCY);
    // keep the equator inside the middle 40% so neither pole degenerates
    var hCY = clamp(HT * (1 - sp.headYF), nCY + 0.30 * hSpan, crownY - 0.30 * hSpan);
    var hRYup = crownY - hCY;
    // 1/0.80 so the neck row lands where the ellipsoid has narrowed to 60% —
    // for the cat that predicts a neck 0.536 of max width against 0.531
    // measured, so the waist comes out of the geometry, not out of a fudge
    var hRYdn = (hCY - nCY) / 0.80;
    var hRY = 0.5 * (hRYup + hRYdn);           // nominal, for ear/face offsets

    // Body. One egg with independent upper and lower vertical radii. The upper
    // radius is set so the neck row lands at 80% of the way to the pole, where
    // an ellipsoid has already narrowed to 60% of full width — that is where
    // the waist comes from. The previous version blended a sphere into a
    // barrel with k=0.11 and filled the waist in completely, which is why the
    // first cat had no jawline.
    var ryUp = hasHead ? (nCY - bCY) / 0.80 : (HT - bCY);
    var ryDn = bCY + 0.20 * ryUp;
    parts.push({
      id: 'body', k: 0.0,
      f: function (x, y, z) {
        var dy = y - bCY;
        return sdEllipsoid(x, dy, z, W, dy >= 0 ? ryUp : ryDn, D);
      },
    });

    // Haunch. A sitting animal is widest across the thighs, which sit well
    // above the seat line, not at it. One egg cannot do that and keep a narrow
    // waist: the reference cat reaches 0.98 of max width at 0.79 of height
    // while the single ellipsoid was still at 0.83 there and only peaked at
    // 0.90 of height. A second low mass fixes the profile without widening the
    // neck. Labelled 'body' so the part inventory is unchanged.
    var hq = sp.haunch;
    if (hq) {
      parts.push({
        id: 'body', k: W * hq.kF,
        f: function (x, y, z) {
          return sdEllipsoid(x, y - (bCY + ryUp * hq.yF), z - D * hq.zF,
                             W * hq.wF, ryUp * hq.ryF, D * hq.dF);
        },
      });
    }

    // Chest. The haunch fixed the lower profile but left a long straight-sided
    // cone between the waist and the shoulders, so the creature read as a
    // bowling pin rather than a sitting animal: the reference is already at
    // 0.82 of max width one band below the head while a bare ellipsoid was
    // still at 0.75 and falling. A shallow upper mass fills the shoulder
    // without touching the neck, because it stops short of nCY. Also labelled
    // 'body' so the part inventory is unchanged.
    var ch = sp.chest;
    if (ch) {
      parts.push({
        id: 'body', k: W * ch.kF,
        f: function (x, y, z) {
          return sdEllipsoid(x, y - (bCY + ryUp * ch.yF), z - D * ch.zF,
                             W * ch.wF, ryUp * ch.ryF, D * ch.dF);
        },
      });
    }

    if (hasHead) {
      parts.push({
        id: 'head', k: hRX * (sp.headK == null ? 0.28 : sp.headK),
        f: function (x, y, z) {
          var dy = y - hCY;
          return sdEllipsoid(x, dy, z, hRX, dy >= 0 ? hRYup : hRYdn, hRZ);
        },
      });
    }

    // ears
    var ear = sp.ear;
    if (ear && ear.profile === 'tympanum') {
      // A frog has no pinna but it does have a tympanum: a round eardrum disc
      // behind each eye. That is the real landmark, so the ear component is
      // satisfied honestly instead of by bolting a mammal ear onto a frog.
      var tR = ear.rF * maxW;
      [['earL', -1], ['earR', 1]].forEach(function (pair) {
        var name = pair[0], sx = pair[1];
        var tx = sx * W * 0.66, ty = bCY + ryUp * 0.42, tz = D * 0.52;
        parts.push({
          id: name, k: tR * 0.45,
          f: function (x, y, z) { return sdSphere(x - tx, y - ty, z - tz, tR); },
        });
      });
    } else if (ear && ear.profile === 'button') {
      // A bear ear is a disc half-sunk into the top corner of the skull.
      // Running it through the generic round cone below pins the tip to
      // the top of the whole silhouette (by0 = HT - rTip), which turns
      // every button ear into a rabbit ear no matter what tipK says.
      var bR = 0.5 * ear.baseWF * maxW;
      var bcx = 0.5 * (ear.gapF + ear.baseWF) * maxW;
      var bey = hCY + hRYup * (ear.sink == null ? 0.70 : ear.sink);
      [['earL', -1], ['earR', 1]].forEach(function (pair) {
        var name = pair[0], sx = pair[1];
        parts.push({
          id: name, k: bR * 0.34,
          f: function (x, y, z) {
            return sdEllipsoid(x - sx * bcx, y - bey, z + hRZ * 0.10,
                               bR, bR * 1.04, bR * 0.66);
          },
        });
      });
    } else if (ear && ear.profile && ear.profile !== 'none') {
      var R = 0.5 * ear.baseWF * maxW;                    // measured half-width
      var cx = 0.5 * (ear.gapF + ear.baseWF) * maxW;      // measured ear axis
      var rBase = R * (ear.baseK == null ? 1.0 : ear.baseK);
      var rTip = max(0.010, R * ear.tipK);   // floor only guards the SDF, not the shape
      var ay0 = hCY + hRY * ear.sink;
      var by0 = HT - rTip;                                // the tip sets the height
      [['earL', -1], ['earR', 1]].forEach(function (pair) {
        var name = pair[0], sx = pair[1];
        var ax = sx * cx, az = -hRZ * 0.12;
        var bx = sx * cx * ear.lean, bz = az + hRZ * 0.06;
        // 'widen' pushes the mid-span of the cone outward so a tall ear can be
        // a flat paddle instead of a spike: the round cone alone can only
        // interpolate linearly between the two end radii.
        var wid = ear.widen || 0;
        parts.push({
          // The fillet radius must NOT scale with the ear: k = R*0.55 made the
          // blend grow every time the ear got wider, so widening the ear only
          // melted more of it into the skull and the measured ear width barely
          // moved. A cat ear meets the head with a small, near-constant fillet.
          id: name, k: min(R * 0.30, 0.022),
          f: function (x, y, z) {
            var d = sdRoundConeSafe(x, y, z, ax, ay0, az, bx, by0, bz, rBase, rTip);
            if (wid) {
              var my = ay0 + (by0 - ay0) * 0.55;
              d = smin(d, sdEllipsoid(x - sx * cx * 1.03, y - my, z - az,
                        rBase * wid, (by0 - ay0) * 0.42, rBase * wid * 0.62),
                       rBase * 0.60);
            }
            return d;
          },
        });
      });
    }

    // Frog eye domes are part of the head, not two dark balls stuck on it: in
    // the reference they are the same frosted material as the body and only
    // the pupil is dark. Built here so they fuse into the skull, with the
    // pupils added separately in eyePlacements.
    if (sp.eyeDome) {
      var dm = sp.eyeDome;
      var dr = 0.5 * dm.baseWF * maxW;
      var dcx = 0.5 * (dm.gapF + dm.baseWF) * maxW;
      [-1, 1].forEach(function (sx) {
        parts.push({
          id: 'head', k: dr * 0.42,
          f: function (x, y, z) {
            return sdSphere(x - sx * dcx, y - (HT - dr * 0.94), z - hRZ * 0.16, dr);
          },
        });
      });
    }

    // snout
    var faceY = hasHead ? hCY - hRYdn * 0.22 : bCY + ryUp * 0.34;
    var faceZ = hasHead ? hRZ * 0.88 : D * 0.86;
    var fRX = hasHead ? hRX : W, fRY = hasHead ? hRY : ryUp, fRZ = hasHead ? hRZ : D;
    if (sp.snout === 'muzzle') {
      parts.push({
        id: 'muzzle', k: fRX * 0.20,
        f: function (x, y, z) {
          return sdEllipsoid(x, y - faceY, z - faceZ, fRX * 0.46, fRY * 0.27, fRZ * 0.34);
        },
      });
    } else if (sp.snout === 'beak') {
      parts.push({
        id: 'muzzle', k: fRX * 0.055,
        f: function (x, y, z) {
          return sdRoundConeSafe(x, y, z,
            0, faceY + fRY * 0.20, fRZ * 0.54, 0, faceY + fRY * 0.04, fRZ * 1.14,
            fRX * 0.23, fRX * 0.070);
        },
      });
    } else {
      // groove: a wide shallow negative cut carved after the union
      var gv = sp.groove || {};
      var gwx = gv.wx == null ? 0.56 : gv.wx;
      var gwy = gv.wy == null ? 0.10 : gv.wy;
      var gwz = gv.wz == null ? 0.22 : gv.wz;
      var gdy = gv.dy == null ? -0.06 : gv.dy;
      var gdz = gv.dz == null ? 1.02 : gv.dz;
      var gk = gv.k == null ? 0.14 : gv.k;
      parts.push({
        id: 'muzzle', k: fRX * gk, subtract: true,
        f: function (x, y, z) {
          return sdEllipsoid(x, y - (faceY - fRY * gdy), z - fRZ * gdz,
            fRX * gwx, fRY * gwy, fRZ * gwz);
        },
      });
    }

    // wings: two flat paddles pressed against the flanks. Labelled 'body'
    // because the part inventory in the spec has no wing component and a
    // silent extra mesh would fail the coverage check as an unnamed part.
    if (sp.wings) {
      var wg = sp.wings;
      var wr = wg.rF * maxW;
      [-1, 1].forEach(function (sx) {
        parts.push({
          id: 'body', k: wr * 0.34,
          f: function (x, y, z) {
            var p = [x - sx * W * 1.04, y - (bCY + ryUp * wg.yF), z - D * wg.zF];
            rotZ(p, sin(sx * wg.lean), cos(sx * wg.lean));
            return sdEllipsoid(p[0], p[1], p[2], wr * 0.36, wr * 1.42, wr * 0.70);
          },
        });
      });
    }

    // pads: extra rounded masses that belong to the body outline but are
    // not components of their own (a frog's rear haunches). Labelled
    // 'body' for the same reason the wings are: the spec's part inventory
    // has no such component and a silent extra mesh fails coverage.
    if (sp.pads) {
      sp.pads.forEach(function (pd) {
        [-1, 1].forEach(function (sx) {
          parts.push({
            id: 'body', k: maxW * (pd.k == null ? 0.5 : pd.k) * 0.1,
            f: function (x, y, z) {
              return sdEllipsoid(x - sx * W * pd.xF,
                                 y - (bCY + ryUp * pd.yF), z - D * pd.zF,
                                 maxW * pd.rx, maxW * pd.ry, maxW * pd.rz);
            },
          });
        });
      });
    }

    // tail
    var tl = sp.tail;
    if (tl && tl.kind !== 'none') {
      var sw = tl.sweep || 1;
      var tR = tl.rF * maxW;
      // the tail's outer edge is what defines max silhouette width on its side
      var reach = max(W * 0.6, 0.5 * maxW - tR);
      if (tl.kind === 'curl') {
        // The tail has to be read at a glance or the animal is just a blob.
        // The old path hugged the seat line at y = 0.07 and was swallowed by
        // the body's own bottom fillet. This one leaves the hip at 42% of the
        // body's upper radius, wraps the flank at full reach, and lays the tip
        // across the midline in front, which is what the reference does.
        // Kept clearly proud of the body instead of wrapped tight against the
        // flank. A tube whose outer edge only just clears the body meets it at
        // a near-tangent angle, and dual contouring cannot decide which sheet
        // a cell belongs to along that graze: the first attempt produced a
        // sawtooth band right across the hips. Lying the tail across the FRONT
        // of the base, where the reference actually puts it, makes the
        // intersection transverse and the seam clean.
        parts.push({
          // k must stay several voxels wide. At tR*0.30 the fillet valley was
          // 0.024 against a 0.021 cell, so the mesher could not resolve which
          // side of the crease each dual vertex belonged to and the seam came
          // out as a row of spikes. tR*0.55 is ~2.5 cells and still leaves the
          // tail legible as a separate tube.
          // The middle node used to sit at x = W*1.02, which is exactly where
          // the haunch surface is at that height: the tube ran along the hip
          // at zero clearance and the mesher produced a serrated band there,
          // and the extra reach pushed the silhouette to aspect 0.685 against
          // the reference's 0.575. The path now drops to the seat first and
          // only then swings wide, so it clears the body where the body has
          // already tapered, and every surface crossing is transverse.
          id: 'tail', k: tR * 0.55,
          f: polyline([
            [sw * W * 0.58, bCY + ryUp * 0.420, -D * 0.25],
            [sw * W * 0.98, bCY + ryUp * 0.160, D * 0.55],
            [sw * W * 0.88, bCY + ryUp * 0.070, D * 1.05],
            [-sw * W * 0.34, bCY + ryUp * 0.150, D * 1.16],
          ], [tR * 0.78, tR * 1.00, tR * 0.98, tR * 0.60]),
        });
      } else if (tl.kind === 'puff') {
        parts.push({
          id: 'tail', k: tR * 0.55,
          f: function (x, y, z) {
            return sdSphere(x, y - (bCY + ryUp * 0.10), z + D * 0.94, tR);
          },
        });
      } else if (tl.kind === 'bush') {
        parts.push({
          id: 'tail', k: tR * 0.45,
          f: polyline([
            [sw * reach * 0.30, bCY + ryUp * 0.55, -D * 0.86],
            [sw * reach * 0.86, bCY + ryUp * 0.20, -D * 0.30],
            [sw * reach * 1.00, tR * 0.86, D * 0.46],
            [sw * reach * 0.52, tR * 0.72, D * 1.00],
          ], [tR * 0.66, tR, tR * 0.98, tR * 0.62]),
        });
      } else if (tl.kind === 'fan') {
        parts.push({
          id: 'tail', k: tR * 0.5,
          f: function (x, y, z) {
            var p = [x, y - (bCY + ryUp * 0.30), z + D * 0.90];
            rotX(p, sin(-0.5), cos(-0.5));
            return sdRoundBox(p[0], p[1], p[2], tR * 0.55, tR * 1.9, tR * 0.30, tR * 0.28);
          },
        });
      } else if (tl.kind === 'fluke') {
        // A whale fluke is a flat crescent in the X-Y plane. Built out of two
        // tapering round cones it reads as a dart, and pushing the lobe tips
        // out to 1.6*W made the fluke's reach - not the body - set the
        // bounding box, so every fitted camera shrank the whale to a pebble.
        // Each lobe is now an ellipsoid squashed in Z and rotated onto its own
        // axis, and the whole fan is pulled back in toward the body.
        var fsw = tl.sweep || 1;
        var th = tR * 0.70;                                // thickness in Z
        var rootX = fsw * W * 0.82, rootY = bCY + ryUp * 0.06;
        var midX = fsw * W * 1.06, midY = bCY + ryUp * 0.74;
        // the notch between the lobes is the whole point of a fluke; at
        // lobe half-width L*0.62 and blend tR*0.85 the two lobes and the
        // stem merged into one lollipop, so both are cut back hard.
        var lobes = [
          [fsw * W * 0.46, ryUp * 0.34, W * 0.150],        // trailing lobe
          [-fsw * W * 0.26, ryUp * 0.60, W * 0.135],       // leading lobe
        ];
        parts.push({
          id: 'tail', k: tR * 0.45,
          f: function (x, y, z) {
            var d = sdRoundConeSafe(x, y, z, rootX, rootY, 0, midX, midY, 0,
                                    tR * 1.05, tR * 0.40);
            for (var i = 0; i < lobes.length; i++) {
              var dx = lobes[i][0], dy = lobes[i][1];
              var L = sqrt(dx * dx + dy * dy);
              var p = [x - (midX + dx * 0.5), y - (midY + dy * 0.5), z];
              rotZ(p, -dy / L, dx / L);
              d = smin(d, sdEllipsoid(p[0], p[1], p[2], L * 0.54,
                                      lobes[i][2], th), tR * 0.42);
            }
            return d;
          },
        });
      }
    }

    // feet
    if (sp.feet !== 'none') {
      var planted = sp.feet === 'planted';
      var fp = sp.footPlace || {};
      var footR = maxW * (fp.rF == null ? (planted ? 0.135 : 0.115) : fp.rF);
      var footX = W * (fp.xF == null ? (planted ? 0.52 : 0.58) : fp.xF);
      var footY = maxW * (fp.yF == null ? (planted ? 0.085 : 0.078) : fp.yF);
      // pushed forward of the tail's front lobe: at 0.58 the tucked paws sat
      // inside the tail tube and never appeared in the silhouette at all
      var footZ = D * (fp.zF == null ? (planted ? 0.66 : 0.80) : fp.zF);
      [['footL', -1], ['footR', 1]].forEach(function (pair) {
        var name = pair[0], sx = pair[1];
        parts.push({
          id: name, k: footR * 0.5,
          f: function (x, y, z) {
            return sdEllipsoid(x - sx * footX, y - footY, z - footZ,
              footR, footR * 0.62, footR * 1.18);
          },
        });
      });
    }

    // whale side fins
    if (sp.fins) {
      [['footL', -1], ['footR', 1]].forEach(function (pair) {
        var name = pair[0], sx = pair[1];
        var fr = maxW * 0.116;   // the flipper has to survive thumbnail scale
        parts.push({
          id: name, k: fr * 0.30,
          f: function (x, y, z) {
            var p = [x + W * 0.10, y - (bCY - ryDn * 0.90), z - sx * D * 0.54];
            rotZ(p, sin(-0.42), cos(-0.42));
            rotX(p, sin(sx * 0.40), cos(sx * 0.40));
            return sdEllipsoid(p[0], p[1], p[2], fr * 2.0, fr * 0.38, fr * 1.02);
          },
        });
      });
    }

    if (!hasHead) {
      // A whale's head is the front of its body and its muzzle is the mouth
      // line — both real anatomy, just not separate lumps. Label-only regions
      // name them on the fused surface instead of grafting on a sphere the
      // animal does not have. Declaration order is priority, so muzzle wins
      // inside head.
      parts.push({
        id: 'head', labelRegion: true,
        f: function (x, y, z) {
          return sdRoundBox(x, y - (bCY + ryUp * 0.30), z - D * 0.70,
            W * 1.3, ryUp * 0.95, D * 0.60, 0.0);
        },
      });
    }

    if (sp.snout === 'groove') {
      // A carved groove removes surface, so it never wins a nearest-surface
      // vote and the component would go unbuilt (the frog lost its muzzle
      // entirely). Name the lip band around the cut instead. A chick's beak is
      // real geometry and already answers to 'muzzle', so it gets no region.
      parts.push({
        id: 'muzzle', labelRegion: true, over: ['body', 'head'],
        f: function (x, y, z) {
          return sdEllipsoid(x, y - faceY + fRY * 0.06, z - fRZ * 0.98,
            fRX * 0.72, fRY * 0.22, fRZ * 0.34);
        },
      });
    }

    return {
      parts: parts, maxW: maxW, W: W, D: D, hasHead: hasHead,
      hRX: hRX, hRY: hRY, hRYup: hRYup, hRYdn: hRYdn, hRZ: hRZ, hCY: hCY, nCY: nCY,
      bCY: bCY, ryUp: ryUp, ryDn: ryDn,
      faceY: faceY, faceZ: faceZ, fRX: fRX, fRY: fRY, fRZ: fRZ,
      // legacy aliases kept so nothing downstream has to change
      H: 0.5 * (ryUp + ryDn), bodyY: bCY, headR: hRX, headY: hCY,
    };
  }

  /**
   * Guarded round cone. The closed form needs a2 = |b-a|^2 - (r1-r2)^2 > 0; if
   * the radius difference is as large as the segment length there is no valid
   * tangent envelope and the square roots go imaginary. Those cases degrade to
   * a capsule of the larger radius, which is the correct limit shape.
   */
  function sdRoundConeSafe(px, py, pz, ax, ay, az, bx, by, bz, r1, r2) {
    var bax = bx - ax, bay = by - ay, baz = bz - az;
    var l2 = bax * bax + bay * bay + baz * baz;
    if (l2 <= 1e-9) return sdSphere(px - ax, py - ay, pz - az, max(r1, r2));
    var rr = r1 - r2;
    if (rr * rr >= l2 * 0.999) {
      return sdCapsule(px, py, pz, ax, ay, az, bx, by, bz, max(r1, r2));
    }
    return sdRoundCone(px, py, pz, ax, ay, az, bx, by, bz, r1, r2);
  }

  /** Swept tube through a polyline with per-node radii. */
  function polyline(pts, radii) {
    return function (x, y, z) {
      var best = 1e9;
      for (var i = 0; i < pts.length - 1; i++) {
        var a = pts[i], b = pts[i + 1];
        var r = (radii[i] + radii[i + 1]) * 0.5;
        var d = sdCapsule(x, y, z, a[0], a[1], a[2], b[0], b[1], b[2], r);
        if (d < best) best = d;
      }
      return best;
    };
  }

  /** Compose the species pieces into one field, plus a filleted flat seat. */
  function makeField(geo, sp) {
    var parts = geo.parts;
    var adds = [], subs = [];
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].labelRegion) continue;   // naming only: contributes no surface
      (parts[i].subtract ? subs : adds).push(parts[i]);
    }
    var seatY = 0.0;
    return function (x, y, z) {
      var d = adds[0].f(x, y, z);
      for (var i = 1; i < adds.length; i++) d = smin(d, adds[i].f(x, y, z), adds[i].k);
      for (var j = 0; j < subs.length; j++) d = smax(d, -subs[j].f(x, y, z), subs[j].k);
      // flat seat: filleted plane cut so the figurine sits instead of balancing
      return smax(d, seatY - y, 0.020);
    };
  }

  /** Nearest-part label for a surface point (used to split the fused surface
   *  back into the named components the spec promised). */
  function labelAt(geo, x, y, z) {
    // Nearest *surface*, not smallest signed value. A point on the head is
    // deep inside the body's field, so argmin(f) would hand every head
    // triangle to the body; argmin(|f|) asks "whose surface passes through
    // here", which is the question we actually mean.
    var parts = geo.parts, bi = -1, bd = 1e9, ri = -1;
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      if (p.labelRegion) {
        // Label-only regions carve names out of a fused mass (the "head" of a
        // whale is the front of its body, not a separate lump). They override
        // the nearest-surface vote for any point they contain.
        // declaration order is priority: a later region wins inside an earlier
        // one, so 'muzzle' overrides 'head' on the same fused surface
        if (p.f(x, y, z) < 0) ri = i;
        continue;
      }
      if (p.subtract) continue;
      var d = abs(p.f(x, y, z));
      if (d < bd) { bd = d; bi = i; }
    }
    var nearest = bi < 0 ? parts[0].id : parts[bi].id;
    // A label region only carves a name out of an undifferentiated mass. It
    // must never outrank a part that genuinely owns this surface, or the
    // frog's tympanum discs and feet get swallowed by its "head" region — so
    // each region declares exactly which fused mass it is allowed to rename.
    // Default is the body alone; a carved muzzle also renames head surface,
    // because subtractions leave no surface of their own to vote with.
    if (ri >= 0) {
      var over = parts[ri].over || ['body'];
      for (var q = 0; q < over.length; q++) {
        if (nearest === over[q]) return parts[ri].id;
      }
    }
    return nearest;
  }

  // ------------------------------------------------------- naive surface nets
  var CORNER = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ];
  var EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];

  // Corner adjacency along cube edges (bit0=x, bit1=y, bit2=z).
  var CORNER_ADJ = [[1, 2, 4], [0, 3, 5], [0, 3, 6], [1, 2, 7],
                    [0, 5, 6], [1, 4, 7], [2, 4, 7], [3, 5, 6]];

  /**
   * For each of the 256 corner sign configurations, which surface sheet every
   * crossing edge belongs to.
   *
   * Naive surface nets places exactly one vertex per cell. When a cell happens
   * to contain two disjoint pieces of surface - which is what a blend crevice
   * or a thin appendage looks like at grid scale - that single vertex welds
   * the two sheets together and the result is a non-manifold edge. Splitting
   * the cell into one vertex per sheet is the standard manifold fix and makes
   * the mesher robust regardless of how the shape is parameterised.
   */
  var EDGE_COMP = (function () {
    var table = new Array(256);
    for (var mask = 0; mask < 256; mask++) {
      var comp = new Int8Array(8), seen = new Int8Array(8), n = 0;
      for (var c = 0; c < 8; c++) {
        if (seen[c]) continue;
        var inside = (mask >> c) & 1;
        var stack = [c]; seen[c] = 1; comp[c] = n;
        while (stack.length) {
          var u = stack.pop();
          for (var a = 0; a < 3; a++) {
            var w = CORNER_ADJ[u][a];
            if (!seen[w] && ((mask >> w) & 1) === inside) {
              seen[w] = 1; comp[w] = n; stack.push(w);
            }
          }
        }
        n++;
      }
      var ec = new Int8Array(12);
      for (var e = 0; e < 12; e++) {
        var p0 = EDGES[e][0], p1 = EDGES[e][1];
        var i0 = (mask >> p0) & 1, i1 = (mask >> p1) & 1;
        // a sheet is identified by the inside-corner component it wraps
        ec[e] = (i0 === i1) ? -1 : comp[i0 ? p0 : p1];
      }
      table[mask] = ec;
    }
    return table;
  })();

  /** Coarse scan for the axis-aligned box the solid actually occupies. */
  function probeBounds(field, lo, hi, n) {
    var bl = [1e9, 1e9, 1e9], bh = [-1e9, -1e9, -1e9], found = false;
    var sx = (hi[0] - lo[0]) / (n - 1), sy = (hi[1] - lo[1]) / (n - 1), sz = (hi[2] - lo[2]) / (n - 1);
    var near = max(sx, max(sy, sz));
    for (var k = 0; k < n; k++) {
      var z = lo[2] + k * sz;
      for (var j = 0; j < n; j++) {
        var y = lo[1] + j * sy;
        for (var i = 0; i < n; i++) {
          var x = lo[0] + i * sx;
          // count samples inside or within one coarse cell of the surface, so
          // a thin feature between probe points is still enclosed
          if (field(x, y, z) >= near) continue;
          found = true;
          if (x < bl[0]) bl[0] = x; if (y < bl[1]) bl[1] = y; if (z < bl[2]) bl[2] = z;
          if (x > bh[0]) bh[0] = x; if (y > bh[1]) bh[1] = y; if (z > bh[2]) bh[2] = z;
        }
      }
    }
    if (!found) return { lo: lo.slice(), hi: hi.slice() };
    return { lo: bl, hi: bh };
  }

  /**
   * Polygonise field over [lo, hi] on an n0 x n1 x n2 grid.
   * Returns {positions: Float32Array, indices: Uint32Array}.
   */
  function surfaceNets(field, lo, hi, dims) {
    var nx = dims[0], ny = dims[1], nz = dims[2];
    var sx = (hi[0] - lo[0]) / (nx - 1);
    var sy = (hi[1] - lo[1]) / (ny - 1);
    var sz = (hi[2] - lo[2]) / (nz - 1);

    // sample the field once per grid point
    var vals = new Float32Array(nx * ny * nz);
    var w = 0;
    for (var k = 0; k < nz; k++) {
      var wz = lo[2] + k * sz;
      for (var j = 0; j < ny; j++) {
        var wy = lo[1] + j * sy;
        for (var i = 0; i < nx; i++) vals[w++] = field(lo[0] + i * sx, wy, wz);
      }
    }
    function at(i, j, k) { return vals[i + nx * (j + ny * k)]; }

    var cnx = nx - 1, cny = ny - 1, cnz = nz - 1;
    // one slot per (cell, cube edge): the vertex representing the sheet that
    // crosses that edge. Cells with two sheets therefore expose two vertices.
    var edgeVert = new Int32Array(cnx * cny * cnz * 12).fill(-1);
    var pos = [];
    var v = new Float32Array(8);
    var sums = new Float64Array(8 * 4);
    var vidx = new Int32Array(8);

    for (var ck = 0; ck < cnz; ck++) {
      for (var cj = 0; cj < cny; cj++) {
        for (var ci = 0; ci < cnx; ci++) {
          var mask = 0;
          for (var c = 0; c < 8; c++) {
            var o = CORNER[c];
            var val = at(ci + o[0], cj + o[1], ck + o[2]);
            v[c] = val;
            if (val < 0) mask |= (1 << c);
          }
          if (mask === 0 || mask === 255) continue;
          var ec = EDGE_COMP[mask];

          sums.fill(0);
          for (var e = 0; e < 12; e++) {
            var comp = ec[e];
            if (comp < 0) continue;
            var a = EDGES[e][0], b = EDGES[e][1];
            var va = v[a], vb = v[b];
            var t = va / (va - vb);
            var ca = CORNER[a], cb = CORNER[b];
            var q = comp * 4;
            sums[q] += ca[0] + (cb[0] - ca[0]) * t;
            sums[q + 1] += ca[1] + (cb[1] - ca[1]) * t;
            sums[q + 2] += ca[2] + (cb[2] - ca[2]) * t;
            sums[q + 3] += 1;
          }

          for (var m = 0; m < 8; m++) {
            var cnt = sums[m * 4 + 3];
            if (cnt === 0) { vidx[m] = -1; continue; }
            vidx[m] = pos.length / 3;
            pos.push(lo[0] + (ci + sums[m * 4] / cnt) * sx,
                     lo[1] + (cj + sums[m * 4 + 1] / cnt) * sy,
                     lo[2] + (ck + sums[m * 4 + 2] / cnt) * sz);
          }
          var base = (ci + cnx * (cj + cny * ck)) * 12;
          for (var e2 = 0; e2 < 12; e2++) {
            var cm = ec[e2];
            if (cm >= 0) edgeVert[base + e2] = vidx[cm];
          }
        }
      }
    }

    /** vertex of the sheet crossing local cube edge `le` of one cell */
    function ev(ci, cj, ck, le) {
      if (ci < 0 || cj < 0 || ck < 0 || ci >= cnx || cj >= cny || ck >= cnz) return -1;
      return edgeVert[(ci + cnx * (cj + cny * ck)) * 12 + le];
    }

    var tris = [];
    function quad(a, b, c, d, flip) {
      if (a < 0 || b < 0 || c < 0 || d < 0) return;
      // Winding verified empirically against the analytic SDF gradient in
      // test_nets.js: this orientation yields outward-facing normals and a
      // positive signed volume for a sphere, blend blob and flat-seat cut.
      if (flip) { tris.push(a, b, c, a, c, d); }
      else { tris.push(a, c, b, a, d, c); }
    }

    // Each grid edge with a sign change is surrounded by four cells; the local
    // cube-edge index differs per cell, which is how the right sheet is picked.
    for (var k2 = 1; k2 < nz - 1; k2++) {
      for (var j2 = 1; j2 < ny - 1; j2++) {
        for (var i2 = 1; i2 < nx - 1; i2++) {
          var v0 = at(i2, j2, k2) < 0;
          if (v0 !== (at(i2 + 1, j2, k2) < 0)) {
            quad(ev(i2, j2, k2, 0), ev(i2, j2 - 1, k2, 1),
                 ev(i2, j2 - 1, k2 - 1, 3), ev(i2, j2, k2 - 1, 2), v0);
          }
          if (v0 !== (at(i2, j2 + 1, k2) < 0)) {
            quad(ev(i2, j2, k2, 4), ev(i2, j2, k2 - 1, 6),
                 ev(i2 - 1, j2, k2 - 1, 7), ev(i2 - 1, j2, k2, 5), v0);
          }
          if (v0 !== (at(i2, j2, k2 + 1) < 0)) {
            quad(ev(i2, j2, k2, 8), ev(i2 - 1, j2, k2, 9),
                 ev(i2 - 1, j2 - 1, k2, 11), ev(i2, j2 - 1, k2, 10), v0);
          }
        }
      }
    }
    return { positions: new Float32Array(pos), indices: new Uint32Array(tris) };
  }

  /** Constrained Laplacian smoothing: relax, then push back onto the isosurface
   *  so the shape does not shrink. */
  function relax(positions, indices, field, iterations, step) {
    var n = positions.length / 3;
    var adjA = new Int32Array(indices.length * 2);
    var adjB = new Int32Array(indices.length * 2);
    var m = 0;
    for (var t = 0; t < indices.length; t += 3) {
      for (var e = 0; e < 3; e++) {
        var a = indices[t + e], b = indices[t + (e + 1) % 3];
        adjA[m] = a; adjB[m] = b; m++;
        adjA[m] = b; adjB[m] = a; m++;
      }
    }
    var sum = new Float32Array(n * 3), cnt = new Float32Array(n);
    for (var it = 0; it < iterations; it++) {
      sum.fill(0); cnt.fill(0);
      for (var q = 0; q < m; q++) {
        var a2 = adjA[q], b2 = adjB[q];
        sum[a2 * 3] += positions[b2 * 3];
        sum[a2 * 3 + 1] += positions[b2 * 3 + 1];
        sum[a2 * 3 + 2] += positions[b2 * 3 + 2];
        cnt[a2] += 1;
      }
      for (var i = 0; i < n; i++) {
        if (cnt[i] === 0) continue;
        var px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
        px = mix(px, sum[i * 3] / cnt[i], step);
        py = mix(py, sum[i * 3 + 1] / cnt[i], step);
        pz = mix(pz, sum[i * 3 + 2] / cnt[i], step);
        // project back to the isosurface along the gradient
        var d = field(px, py, pz);
        var h = 1e-3;
        var gx = field(px + h, py, pz) - field(px - h, py, pz);
        var gy = field(px, py + h, pz) - field(px, py - h, pz);
        var gz = field(px, py, pz + h) - field(px, py, pz - h);
        var gl = sqrt(gx * gx + gy * gy + gz * gz) / (2 * h);
        if (gl > 1e-6) {
          px -= d * (gx / (2 * h)) / (gl * gl);
          py -= d * (gy / (2 * h)) / (gl * gl);
          pz -= d * (gz / (2 * h)) / (gl * gl);
        }
        positions[i * 3] = px; positions[i * 3 + 1] = py; positions[i * 3 + 2] = pz;
      }
    }
  }

  /** Analytic SDF-gradient normals — smooth regardless of grid resolution. */
  function gradientNormals(positions, field) {
    var n = positions.length / 3;
    var normals = new Float32Array(n * 3);
    var h = 1.2e-3;
    for (var i = 0; i < n; i++) {
      var x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
      var gx = field(x + h, y, z) - field(x - h, y, z);
      var gy = field(x, y + h, z) - field(x, y - h, z);
      var gz = field(x, y, z + h) - field(x, y, z - h);
      var l = sqrt(gx * gx + gy * gy + gz * gz) || 1;
      normals[i * 3] = gx / l; normals[i * 3 + 1] = gy / l; normals[i * 3 + 2] = gz / l;
    }
    return normals;
  }

  // ------------------------------------------------------------------ public
  /**
   * Build one creature as raw typed arrays plus a per-triangle part label.
   * resolution = grid cells along the longest axis.
   */
  function buildCreatureData(speciesIndex, opts) {
    opts = opts || {};
    var res = opts.resolution || 46;
    var sp = SPECIES[speciesIndex % SPECIES.length];
    var geo = speciesParts(sp);
    var field = makeField(geo, sp);

    // Fit the sampling box to this species rather than sharing one domain.
    // A whale is wide and flat, a rabbit is narrow and tall; a shared box
    // spends most of its cells on empty air for both, and any feature that
    // reaches the wall comes out with an open boundary because surface nets
    // skips the outermost cell layer.
    var bounds = probeBounds(field, [-1.15, -0.06, -1.15], [1.15, 1.55, 1.15], 30);
    // One world-space cell size for the whole family, not a fixed division
    // count per species: a shared division count gives the physically smaller
    // animals finer cells and therefore denser detail, which reads as an
    // inconsistent family. Equal cells means equal surface detail density.
    var cellSize = opts.cell || 0.019;
    var lo = [], hi = [];
    for (var a = 0; a < 3; a++) {
      lo[a] = bounds.lo[a] - cellSize * 3;
      hi[a] = bounds.hi[a] + cellSize * 3;
    }
    var span = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
    var dims = span.map(function (s) { return min(110, max(8, Math.round(s / cellSize) + 1)); });

    var mesh = surfaceNets(field, lo, hi, dims);
    if (!opts.noRelax) relax(mesh.positions, mesh.indices, field, 2, 0.55);
    var normals = gradientNormals(mesh.positions, field);

    // per-triangle nearest-part label
    var tri = mesh.indices.length / 3;
    var labels = new Array(tri);
    var P = mesh.positions;
    for (var t = 0; t < tri; t++) {
      var a = mesh.indices[t * 3], b = mesh.indices[t * 3 + 1], c = mesh.indices[t * 3 + 2];
      var cx = (P[a * 3] + P[b * 3] + P[c * 3]) / 3;
      var cy = (P[a * 3 + 1] + P[b * 3 + 1] + P[c * 3 + 1]) / 3;
      var cz = (P[a * 3 + 2] + P[b * 3 + 2] + P[c * 3 + 2]) / 3;
      labels[t] = labelAt(geo, cx, cy, cz);
    }

    return {
      species: sp, geo: geo, field: field,
      positions: mesh.positions, normals: normals, indices: mesh.indices,
      labels: labels, dims: dims,
      eyes: eyePlacements(geo, sp),
    };
  }

  /**
   * Eye and nose domes. Separate meshes because they carry a second material.
   *
   * Positions are measured off the reference crop, not guessed: on the cat the
   * eye centres sit at 0.179 of max silhouette width either side of the head
   * midline, 0.293 of total height down from the top, and each dome is 0.086
   * of max width across. Expressed against the face ellipsoid that is
   * x = 0.40*fRX, y = hCY - 0.05*fRY, diameter = 0.25*fRX.
   *
   * The domes are pushed out to 1.25x the measured reference diameter and
   * given a dark resin instead of the reference's same-colour bumps. That is
   * the deliberate deviation recorded in the spec: seven of these share one
   * screen at thumbnail scale, where a same-colour bump is invisible.
   */
  function eyePlacements(geo, sp) {
    var out = [];
    if (sp.eyeMode === 'crown') {
      // Frog. The two runs at the top of the reference silhouette ARE the eye
      // domes, so their diameter and spacing are measured rather than invented.
      var dm = sp.eyeDome;
      var r = 0.5 * dm.baseWF * geo.maxW;
      var cx = 0.5 * (dm.gapF + dm.baseWF) * geo.maxW;
      // the dome itself is frosted body geometry (see speciesParts); what goes
      // here is only the pupil, sitting on the dome's front-upper quadrant
      [-1, 1].forEach(function (s) {
        out.push({
          id: s < 0 ? 'eyeL' : 'eyeR',
          x: s * (cx + r * 0.16), y: HT - r * 0.94 + r * 0.30,
          z: geo.hRZ * 0.16 + r * 0.80, r: r * 0.34,
          sx: 1.0, sy: 1.0, sz: 0.70,
        });
      });
      return out;
    }
    if (sp.eyeMode === 'side') {
      // pulled forward and up onto the cheek, and enlarged: at 0.052*W the
      // whale's eye vanished entirely once the page scales it to a thumbnail
      var wr = geo.W * 0.068;
      var wy = geo.bCY + geo.ryUp * 0.34;
      var wx = -geo.W * 0.60;
      [-1, 1].forEach(function (s) {
        var u = wx / geo.W, v = (wy - geo.bCY) / geo.ryUp;
        var zz = geo.D * sqrt(max(1 - u * u - v * v, 0.04));
        out.push({
          id: s < 0 ? 'eyeL' : 'eyeR', x: wx, y: wy, z: s * (zz + wr * 0.18),
          r: wr, sx: 0.70, sy: 1.0, sz: 1.0,
        });
      });
      return out;
    }
    var cy = geo.hasHead ? geo.hCY : geo.bCY;
    var er = geo.fRX * 0.112;   // 1.19x the measured dome, then +10% for thumbnail legibility
    var ex = geo.fRX * 0.40;
    var ey = geo.hasHead ? geo.hCY - geo.fRY * 0.05 : geo.faceY + geo.fRY * 0.30;
    // Sit the dome on the actual face surface instead of at a guessed z, so
    // every species reads as an inset disc rather than a floating ball.
    var u = ex / geo.fRX, v = (ey - cy) / geo.fRY;
    var ez = geo.fRZ * sqrt(max(1 - u * u - v * v, 0.04)) + er * 0.20;
    [-1, 1].forEach(function (s) {
      out.push({
        id: s < 0 ? 'eyeL' : 'eyeR', x: s * ex, y: ey, z: ez, r: er,
        sx: 1.0, sy: 1.0, sz: 0.62,
      });
    });
    if (sp.nose) {
      // wide and flat: the reference nose measures 0.122 of max width across
      // but only 0.078 tall, so it is a squashed wedge rather than a ball
      out.push({
        id: 'nose', x: 0, y: geo.faceY + geo.fRY * 0.02,
        z: geo.faceZ + geo.fRZ * 0.26, r: er * 0.92,
        sx: 1.30, sy: 0.80, sz: 0.70,
      });
    }
    return out;
  }

  /**
   * Split the fused surface into the named components the spec promised.
   * Vertices on a part boundary are duplicated into both parts with identical
   * position and identical SDF-gradient normal, so the parts are individually
   * selectable without any visible seam between them.
   */
  function splitByPart(data) {
    var groups = {}, order = [];
    for (var t = 0; t < data.labels.length; t++) {
      var id = data.labels[t];
      if (!groups[id]) { groups[id] = []; order.push(id); }
      groups[id].push(t);
    }
    return order.map(function (id) {
      var tris = groups[id];
      var map = new Int32Array(data.positions.length / 3).fill(-1);
      var P = [], N = [], I = [];
      for (var i = 0; i < tris.length; i++) {
        for (var c = 0; c < 3; c++) {
          var vi = data.indices[tris[i] * 3 + c];
          var m = map[vi];
          if (m < 0) {
            m = P.length / 3; map[vi] = m;
            P.push(data.positions[vi * 3], data.positions[vi * 3 + 1], data.positions[vi * 3 + 2]);
            N.push(data.normals[vi * 3], data.normals[vi * 3 + 1], data.normals[vi * 3 + 2]);
          }
          I.push(m);
        }
      }
      return {
        id: id, triangles: tris.length,
        positions: new Float32Array(P), normals: new Float32Array(N),
        indices: new Uint32Array(I),
      };
    });
  }

  root.NSCreature = {
    SPECIES: SPECIES,
    buildCreatureData: buildCreatureData,
    splitByPart: splitByPart,
    _internals: { smin: smin, smax: smax, surfaceNets: surfaceNets, sdEllipsoid: sdEllipsoid },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
