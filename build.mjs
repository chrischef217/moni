import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const partDir = path.resolve('archive-parts');
const b64 = fs.readdirSync(partDir).sort().map(name => fs.readFileSync(path.join(partDir,name),'utf8')).join('');
const payload = JSON.parse(zlib.gunzipSync(Buffer.from(b64,'base64')).toString('utf8'));
fs.rmSync('public',{recursive:true,force:true});
for (const [rel,data] of Object.entries(payload)) {
  const dest=path.join('public',rel);
  fs.mkdirSync(path.dirname(dest),{recursive:true});
  fs.writeFileSync(dest,Buffer.from(data,'base64'));
}
console.log(`UG SALES build: ${Object.keys(payload).length} files`);
