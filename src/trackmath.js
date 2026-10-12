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
