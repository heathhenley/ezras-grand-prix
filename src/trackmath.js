// Pure math for tracks (no Babylon), so it can be tested in Node.
// A track is a ring of evenly spaced samples along the centerline.

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) =>
    0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

export function buildTrack(points, step = 2) {
  const n = points.length;
  const dense = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    for (let j = 0; j < 50; j++) dense.push(catmullRom(p0, p1, p2, p3, j / 50));
  }
  const D = dense.length;
  const cum = [0];
  for (let i = 1; i < D; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  const total = cum[D - 1] + Math.hypot(dense[0][0] - dense[D - 1][0], dense[0][1] - dense[D - 1][1]);

  const count = Math.round(total / step);
  const pos = [];
  let k = 0;
  for (let s = 0; s < count; s++) {
    const d = (s * total) / count;
    while (k < D - 1 && cum[k + 1] < d) k++;
    const a = dense[k], b = dense[(k + 1) % D];
    const segEnd = k + 1 < D ? cum[k + 1] : total;
    const t = segEnd > cum[k] ? (d - cum[k]) / (segEnd - cum[k]) : 0;
    pos.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }

  const samples = pos.map((p, i) => {
    const a = pos[(i - 1 + count) % count], b = pos[(i + 1) % count];
    let tx = b[0] - a[0], tz = b[1] - a[1];
    const len = Math.hypot(tx, tz) || 1;
    tx /= len; tz /= len;
    return { x: p[0], z: p[1], tx, tz, rx: tz, rz: -tx, heading: Math.atan2(tx, tz), curve: 0 };
  });

  // How sharply the road bends over the next ~30m (used by AI to slow for corners)
  for (let i = 0; i < count; i++) {
    const a = samples[i].heading, b = samples[(i + 15) % count].heading;
    samples[i].curve = Math.abs(wrapAngle(b - a));
  }

  return { samples, length: total, count };
}

export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// Find the nearest sample to (x,z). With a hint, only searches nearby (fast + avoids jumping across the track).
export function locate(track, x, z, hint = -1) {
  const { samples, count } = track;
  let best = 0, bestD = Infinity;
  const check = (i) => {
    const s = samples[i];
    const d = (s.x - x) ** 2 + (s.z - z) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  };
  if (hint < 0) for (let i = 0; i < count; i++) check(i);
  else for (let o = -25; o <= 25; o++) check((hint + o + count) % count);
  const s = samples[best];
  const lateral = (x - s.x) * s.rx + (z - s.z) * s.rz;
  return { idx: best, lateral };
}

// Smallest distance between parts of the centerline that are far apart along the loop.
// If this is less than the road width the track overlaps itself.
export function minSelfClearance(track, minSeparation = 40) {
  const { samples, count } = track;
  let min = Infinity;
  for (let i = 0; i < count; i++) {
    for (let j = i + minSeparation; j < count; j++) {
      if (count - (j - i) < minSeparation) continue;
      const d = Math.hypot(samples[i].x - samples[j].x, samples[i].z - samples[j].z);
      if (d < min) min = d;
    }
  }
  return min;
}

// ---------- heights: hills, bridges and jumps over the road ----------
// def.heights: [[fraction round the lap 0..1, meters], ...] keyframes, eased smoothly from one to the
// next (each key is a crest, a dip or a flat bit). Kept as fractions, so rescaling a track's points
// doesn't break it. def.leaps: [fraction, ...] where the road jumps over a lower bit of itself: a
// kicker ramp, an open gap, and a landing on the far side.
// Adds to every sample: y (road height), grade (rise per meter along the road), bridge (a deck on
// pillars, with railings), gap (no road at all: the open part of a leap) and wall (how far from the
// middle a car's centre may go). Adds track.groundAt(x, z) for the terrain height anywhere, and
// track.roadY(idx, x, z) for the road height at a point near sample idx.
export function addElevation(track, def, hw, wallMargin) {
  const { samples, count } = track, step = track.length / count;
  const keys = [...(def.heights ?? [])].sort((a, b) => a[0] - b[0]);
  const heightAt = (f) => {
    if (!keys.length) return 0;
    if (keys.length === 1) return keys[0][1];
    let k = keys.findIndex(([kf]) => kf > f);
    const [a, b] = k < 0 ? [keys[keys.length - 1], [keys[0][0] + 1, keys[0][1]]] : k === 0 ? [[keys[keys.length - 1][0] - 1, keys[keys.length - 1][1]], keys[0]] : [keys[k - 1], keys[k]];
    const u = (f - a[0]) / (b[0] - a[0] || 1), e = u * u * (3 - 2 * u);
    return a[1] + (b[1] - a[1]) * e;
  };
  samples.forEach((s, i) => { s.y = heightAt(i / count); s.bridge = false; s.gap = false; s.wall = hw + wallMargin; });
  samples.forEach((s, i) => { s.grade = (samples[(i + 1) % count].y - samples[(i - 1 + count) % count].y) / (2 * step); });

  // leaps: the gap is wide enough to clear the road underneath with room to spare
  const LEAP_HALF = hw + 3; // meters either side of the middle of the gap
  track.leaps = (def.leaps ?? []).map((f) => {
    const mid = Math.round(f * count), half = Math.round(LEAP_HALF / step);
    for (let o = -half; o <= half; o++) samples[(mid + o + count) % count].gap = true;
    return { lip: (mid - half + count) % count, land: (mid + half + 1) % count };
  });

  // bridges: wherever the road passes well above another bit of itself, it is a deck on pillars,
  // and the deck carries on a little past the road below
  const far = (i, j) => { const d = Math.abs(i - j); return Math.min(d, count - d) > 30; };
  const over = new Array(count).fill(false), reach = (2 * hw + 14) ** 2;
  for (let i = 0; i < count; i++) {
    const s = samples[i];
    for (let j = 0; j < count; j += 1) {
      if (!far(i, j)) continue;
      const t = samples[j];
      if (s.y - t.y > 3 && (s.x - t.x) ** 2 + (s.z - t.z) ** 2 < reach) { over[i] = true; break; }
    }
  }
  const EXTEND = 12; // samples of deck past the last bit over the road below
  for (let i = 0; i < count; i++) if (over[i]) for (let o = -EXTEND; o <= EXTEND; o++) { const t = samples[(i + o + count) % count]; if (!t.gap) t.bridge = true; }
  // railings on the bridges: the invisible wall closes in to them, funnelling in over 50 m either side
  const RAIL = hw - 0.4, FUNNEL = 25;
  for (let i = 0; i < count; i++) {
    if (!samples[i].bridge && !samples[i].gap) continue;
    for (let o = -FUNNEL; o <= FUNNEL; o++) {
      const t = samples[(i + o + count) % count];
      t.wall = Math.min(t.wall, RAIL + (hw + wallMargin - RAIL) * (Math.abs(o) / FUNNEL) ** 1.5);
    }
  }

  track.roadY = (idx, x, z) => {
    const s = samples[idx], along = (x - s.x) * s.tx + (z - s.z) * s.tz;
    return s.y + s.grade * along;
  };
  buildTerrain(track, hw, wallMargin);
}

// The ground: flat (y = 0) away from the road, rising and falling with it near by, so a road on a hill
// sits on a grassy hill rather than a wall. Kept as a grid of heights, read back by groundAt.
function buildTerrain(track, hw, wallMargin) {
  const { samples } = track;
  const solid = samples.filter((s) => !s.bridge && !s.gap); // decks and gaps don't hold the ground up
  if (!samples.some((s) => Math.abs(s.y) > 0.01)) { track.groundAt = () => 0; track.terrain = null; return; }
  const CELL = 3, MARGIN = 80, R = 70;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const s of samples) { x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); z0 = Math.min(z0, s.z); z1 = Math.max(z1, s.z); }
  x0 = Math.floor((x0 - MARGIN) / CELL) * CELL; z0 = Math.floor((z0 - MARGIN) / CELL) * CELL;
  const nx = Math.ceil((x1 + MARGIN - x0) / CELL) + 1, nz = Math.ceil((z1 + MARGIN - z0) / CELL) + 1;
  // samples sorted into 20 m buckets, so each grid point only looks at the road near it
  const B = 20, buckets = new Map(), key = (bx, bz) => bx * 4096 + bz;
  for (const s of solid) { const k = key(Math.floor(s.x / B), Math.floor(s.z / B)); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(s); }
  const decks = samples.filter((s) => s.bridge || s.gap); // the ground has to stay down under these
  const h = new Float32Array(nx * nz), FLAT = hw + wallMargin + 2, EDGE = hw + 2.5;
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = x0 + i * CELL, z = z0 + j * CELL;
    let sw = 0, sy = 0, near = Infinity, nearS = null;
    const bx = Math.floor(x / B), bz = Math.floor(z / B), reachB = Math.ceil(R / B);
    for (let a = -reachB; a <= reachB; a++) for (let b = -reachB; b <= reachB; b++) {
      const list = buckets.get(key(bx + a, bz + b));
      if (!list) continue;
      for (const s of list) {
        const d2 = (s.x - x) ** 2 + (s.z - z) ** 2;
        if (d2 > R * R) continue;
        const w = 1 / (d2 + 4) ** 2;
        sw += w; sy += w * s.y;
        if (d2 < near) { near = d2; nearS = s; }
      }
    }
    if (!nearS) continue;
    near = Math.sqrt(near);
    const local = sy / sw; // the height of the road round here
    let y;
    if (near < EDGE) {
      // right by the road: just under it, so the road never sinks in or floats over a gap
      y = nearS.y + nearS.grade * ((x - nearS.x) * nearS.tx + (z - nearS.z) * nearS.tz) - 0.05;
    } else {
      const fall = FLAT + 10 + 2.5 * Math.abs(local), u = Math.max(0, Math.min(1, (near - FLAT) / (fall - FLAT)));
      y = local * (1 - u * u * (3 - 2 * u));
    }
    for (const s of decks) {
      if (Math.abs(s.x - x) < hw + 4 && Math.abs(s.z - z) < hw + 4 && (s.x - x) ** 2 + (s.z - z) ** 2 < (hw + 4) ** 2) y = Math.min(y, s.y - 1.8);
    }
    h[j * nx + i] = y;
  }
  track.terrain = { x0, z0, nx, nz, cell: CELL, h };
  track.groundAt = (x, z) => {
    const fx = (x - x0) / CELL, fz = (z - z0) / CELL, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= nz - 1) return 0;
    const u = fx - i, v = fz - j, k = j * nx + i;
    return (h[k] * (1 - u) + h[k + 1] * u) * (1 - v) + (h[k + nx] * (1 - u) + h[k + nx + 1] * u) * v;
  };
}
