// Removes the optional "skeleton" hint from each skin in a .glb. In these three models it points at a
// bone that is not above all the others, which makes the loader build the skeleton wrongly.
import fs from 'node:fs';
for (const f of process.argv.slice(2)) {
  const b = fs.readFileSync(f);
  const jsonLen = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jsonLen).toString());
  const rest = b.subarray(20 + jsonLen); // the binary chunk(s), unchanged
  let n = 0;
  for (const s of j.skins || []) if ('skeleton' in s) { delete s.skeleton; n++; }
  let text = JSON.stringify(j);
  while (text.length % 4) text += ' ';
  const json = Buffer.from(text);
  const head = Buffer.alloc(20);
  b.copy(head, 0, 0, 12);
  head.writeUInt32LE(20 + json.length + rest.length, 8);
  head.writeUInt32LE(json.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  fs.writeFileSync(f, Buffer.concat([head, json, rest]));
  console.log(f.split('/').pop(), 'skins fixed:', n, 'size', fs.statSync(f).size);
}
