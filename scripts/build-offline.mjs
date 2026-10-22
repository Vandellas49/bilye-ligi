/* Çevrimdışı tek dosya: dist/bilye-ligi.html
   Oyunun tüm kodu (client + shared) esbuild ile tek betiğe paketlenir, Three.js (3B) de gömülür; sunucu ve
   Socket.IO yok. Dosyaya çift tıklayınca (file://) açılır. Çevrimiçi kısımlar (çevrimiçi oyna, lig tablosu,
   çevrimiçi paneli) gizlenir; tek maç, turnuva ve öğrenme modu çalışır. Çalıştırma: npm run build:offline */
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(ROOT, 'dist');
fs.mkdirSync(out, { recursive: true });

const res = await build({
  entryPoints: [path.join(ROOT, 'client/main.js')],
  bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
  define: { 'window.BILYE_OFFLINE': 'true' },
  logLevel: 'warning',
});
const js = res.outputFiles[0].text;
const three = fs.readFileSync(path.join(ROOT, 'client/three.min.js'), 'utf8');
let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

const swap = (a, b) => { if (!html.includes(a)) throw new Error('index.html içinde bulunamadı: ' + a); html = html.replace(a, () => b); };
// file:// uyarısı gereksiz (her şey gömülü)
html = html.replace(/<script>\s*\/\/ ES modülleri file:\/\/[\s\S]*?<\/script>\s*/, '');
// Socket.IO istemcisi yok; Three.js ve oyun gömülü. "</script" metin içinde geçerse kaçırılır.
const inline = code => code.replace(/<\/script/gi, '<\\/script');
swap('<script src="lib/sio.min.js"></script>', `<script>window.BILYE_OFFLINE = true;</script>\n<script>${inline(three)}</script>`);
swap('<script type="module" src="client/main.js"></script>', `<script>${inline(js)}</script>`);

const file = path.join(out, 'bilye-ligi.html');
fs.writeFileSync(file, html);
console.log(`${path.relative(ROOT, file)}: ${(fs.statSync(file).size/1024).toFixed(0)} KB`);
