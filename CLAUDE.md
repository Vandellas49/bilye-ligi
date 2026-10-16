# Bilye Ligi

Tepeden görünümlü, Haxball tarzı arcade futbol oyunu. Yuvarlak, yüzlü karakterler; paslaşma, top sürme, depar, top kapma ve özel şutlar var. Üç biçimde oynanır:

- **Tek maç:** bota karşı ya da aynı klavyede 2 kişi (simülasyon tarayıcıda)
- **Turnuva:** tek kişilik, 4 ya da 8 takımlı eleme tablosu, rakipler her turda zorlaşır
- **Çevrimiçi:** oda kur / katıl, takımlara oyuncular girer, boş yerleri botlar doldurur; oda türü maç ya da turnuva. Maç sunucuda çalışır (sunucu otoriteli).

Bu dosya, projeye Claude Code ile devam ederken bağlam sağlamak için yazıldı.

## Çalıştırma

```bash
npm install        # bağımlılık: socket.io (sunucu); testler için socket.io-client
npm start          # node server/index.js -> http://localhost:8080 (PORT ile değiştirilebilir)
npm test           # Node testleri
```

Sunucu hem oyunu (`index.html`, `client/`, `shared/`) hem Socket.IO uç noktasını (`/canli`) ve tarayıcı istemcisini (`/lib/sio.min.js`) aynı portta sunar. Yol bilerek varsayılan `/socket.io` değil: kurum IIS sunucusunda `socket.io` geçen adresleri ana uygulamaya yönlendiren genel bir kural vardı (403.18). Adreslere `socket.io` kelimesini geri koymayın. Çevrimiçi mod bu sunucu olmadan çalışmaz; tek maç ve turnuva için herhangi bir statik sunucu da yeter (`npm run static`). Oyun ES modüllerinden oluştuğu için `index.html`'i doğrudan (`file://`) açmak çalışmaz; dosyadan açılırsa menüde uyarı çıkar.

Tek dış bağımlılık (tarayıcıda) Google Fonts (Bagel Fat One, Figtree). İnternet yoksa sistem yazı tiplerine düşer.

### IIS'te alt uygulama olarak

Kurum ağındaki bir IIS sitesinin altında (`Convert to Application`, ör. `https://alanadi/bilye-ligi/`) çalışabilir; `web.config` hazır. IIS, ASP.NET Core Module V2 ile ilk istekte `C:\nodejs\node.exe .\server\index.js` komutunu başlatır ve istekleri ona iletir. Portu `ASPNETCORE_PORT`, uygulama adresini `ASPNETCORE_APPL_PATH` ile verir; sunucu ikisini de okur (`HTTP_PLATFORM_PORT` ve elle `BASE_PATH` de desteklenir).

- Sunucu gelen her isteğin başındaki öneki `stripBase` ile kaldırır (büyük/küçük harfe duyarsız; önek gelmezse adres olduğu gibi kalır), hem dosyalar hem Socket.IO temizlenmiş adresle çalışır. Önek sondaki `/` olmadan gelirse 301 ile yönlendirir. Socket.IO yolu temizlendikten sonra `/canli`, tarayıcıdan `<önek>/canli`.
- Kurulum sorunlarında `<önek>/tani` sunucunun aldığı adresi, öneki ve Node sürümünü düz metin olarak gösterir.
- İstemcide tüm adresler göreli: `index.html` Socket.IO betiğini `lib/sio.min.js` ile, `client/net.js` bağlantıyı sayfanın klasörüne göre kurar. Yeni bir adres eklerken başına `/` koymayın.
- Uygulama havuzu: "Yönetilen kod yok", boşta kalma zaman aşımı 0 (havuz kapanınca odalar silinir). IIS "WebSocket Protocol" özelliği yoksa oyun polling ile çalışır.
- Uygulama klasöründe bir kez `npm ci --omit=dev` gerekir.

## Dosya yapısı

`index.html` yalnızca CSS ve HTML (menü, mola, maç sonu, turnuva, çevrimiçi ve lobi ekranları, dokunmatik düğmeler) içerir, JavaScript'i `client/main.js` ile modül olarak yükler.

```
shared/              DOM'a, sese, gerçek zamana ve Math.random'a dokunmaz (tarayıcı + Node)
  constants.js       saha ölçüleri, fizik katsayıları, takım renkleri, SHOTS, FACES, ARENAS, DIFF, formation
  rng.js             tohumlu RNG (mulberry32): createRng, random, randInt, shuffle, randomSeed
  pass.js            simBall, interceptFor, registerKick, updatePass, laneOpen
  ai.js              assignRoles, aiInput, aiOwnerInput, makePlan, passPlan, pickAiShot, aiCalls
  sim.js             createMatch, step, sanitizeInput; fizik, top sahipliği, müdahale, özel şut, gol
  net.js             roster, matchInfo, snapshot (sunucu) / createView, applySnapshot, lerpView (istemci)
  tournament.js      eleme tablosu, nextMatch, recordResult, roundDiff, simulateMatch (ekransız bot maçı), penaltılar
client/
  main.js            istemci durumu G, tek maç / turnuva / çevrimiçi akışları, sabit adımlı döngü
  net.js             Socket.IO bağlantısı (global io), yeniden bağlanma, girdi gönderimi, sunucu maçının enterpolasyonla oynatılması
  input.js           klavye, joystick, dokunmatik düğmeler -> readInput(ctrl, friend); SHOT_KEYS
  effects.js         olay -> parçacık/yazı/sarsıntı/ses (applyEvents), afterStep (iz, toz, göz), hava
  render.js          canvas çizimi; maç durumunu okur, değiştirmez
  audio.js           WebAudio sesleri (sfx.*), dosya kullanılmıyor
  ui.js              menü, ayar kaydı, HUD, overlay'ler, oda listesi, lobi, turnuva tablosu (bracketHtml)
server/
  index.js           statik dosyalar + Socket.IO; oturumlar, odalar, 60 Hz maç döngüsü, çevrimiçi turnuva
tests/
  sim.test.js        simülasyon: determinizm, maç sonu, girdi
  tournament.test.js tablo, zorluk, ekransız maç, anlık görüntü gidiş-dönüşü
  server.test.js     gerçek sunucu + Socket.IO istemcileri: yalnızca polling (proxy taklidi), oda, şifre, takım, maç, kopma/geri dönüş, turnuva
```

Bağımlılık yönü tek taraflı: `client/` ve `server/` → `shared/`. `shared/` içindeki hiçbir dosya tarayıcı ya da Node'a özgü API kullanmamalı.

## Temel kavramlar

**Koordinatlar.** Saha `W=1000 × H=560` dünya biriminde, `(0,0)` sol üst köşe. Kaleler `x=0` ve `x=W` çizgisinde, ağız yüksekliği `GH`, derinliği `GD`. Görünür alan `VIEW` saha + kenar boşluğu; canvas buna göre ölçeklenir (`resize`, `worldTransform`).

**Zaman.** Fizik sabit 60 Hz'te çalışır (`TICK`), çizim `requestAnimationFrame` ile. Tüm hız ve süre değerleri tick başına.

**Simülasyon API'si (`shared/sim.js`).**
- `createMatch(ayarlar)` → maç durumu. Ayarlar: `size`, `humans [{team, ctrl, name, uid?}]` (bir takımda birden çok insan olabilir, sırayla ilk yerlere geçer), `diff`, `arena` (indeks ya da `'r'`), `weather`, `minutes` (0 = süresiz demo), `specials`, `seed`, isteğe bağlı `teamNames [sol, sağ]` ve `kickoffTeam`.
- `step(state, inputs)` → **olay listesi**. Durum yerinde güncellenir. `inputs[oyuncuId] = {x, y, kick, special, call, hold, sprint}`; bot girdileri `step` içinde üretilir, eksik insan girdisi boş sayılır. Her girdi `sanitizeInput` ile sınırlanır.
- Oyuncunun `ctrl` alanı `'ai'` değilse insan sayılır: yerelde `'h1'`/`'h2'`, sunucuda `'net'` (ve `uid` = bağlantı kimliği). Maç sırasında `ctrl`'ü `'ai'` yapmak oyuncuyu bota devreder.
- Rastgelelik yalnızca `state.rng` üzerinden; aynı tohum + aynı girdi dizisi = aynı maç. Simülasyona `Math.random`, `performance.now` ya da DOM eklemeyin; test bunu yakalar.
- Olaylar: `kick`, `bounce`, `land`, `fireStop`, `steal`, `tackle`, `tackleWin`, `tackleMiss`, `whiff`, `special`, `call`, `goal`, `overtime`, `end`, `kickoff`. Görsel ve sesli karşılıkları `client/effects.js` → `applyEvents`. Yeni bir yan etki gerekiyorsa simülasyonda olay yayınlayın (`emit`), istemcide karşılayın.

**Maç durumu (`S`).** Önemli alanlar:
- `S.phase`: `'kickoff'`, `'play'`, `'goal'`, `'over'`
- `S.players[]`: disk (`x, y, vx, vy, r, im`) + `id` (dizideki sıra), `team` (0 = sol, 1 = sağ), `ctrl`, `uid`, `role`, `dirA`, `sta`, `tired`, `stun`, `cd`, görünüm (`face`, `acc`, `num`, `mood`, `bubble`)
- `S.ball`: disk + `z/vz` (havadaki top), `curve` (falso), `fire` (füze), `grace`
- `S.owner`, `S.lastTouch`, `S.pass`, `S.req[team]`, `S.goalInfo`: oyuncu nesnesine referans içerir (ağda `id`'ye çevrilir, bkz. `shared/net.js`)
- `S.timed`, `S.timeLeft`, `S.overtime`, `S.score`, `S.arena` (ARENAS indeksi), `S.teamNames`, `S.rng`

**İstemci durumu (`G`, `client/main.js`).** `G.mode`: `'menu'` (arkada süresiz demo), `'match'`, `'end'`; `G.paused`; `G.cfg`; `G.state` (çizilen durum). Turnuva: `G.tour {T, me}`, `G.tourMatch`. Çevrimiçi: `G.online`, `G.netM` (anlık görüntü tamponu), `G.menuOpen` (Esc menüsü; çevrimiçi maç durmaz), `G.room` (son `roomState`). Parçacık, yazı, iz, sarsıntı, hava ve oyuncu animasyonları `fx` içinde.

**Tick sırası (`step`).** Roller atanır → girdiler (insan: `inputs[id]`, bot: `aiInput`) → depar/dayanıklılık → ivme → hareket → top fiziği → şutlar ve müdahaleler → çarpışmalar (2 iterasyon) → `updateOwner` → gol/süre kontrolü. Yerel maçta her tick: `readInput` → `step` → `applyEvents` → `afterStep`.

**Top sahipliği, pas, bot rolleri.** Yavaş ve yakın top oyuncuya "yapışır" ve bakış yönünün önünde taşınır; `C` (tut) ile menzil büyür ve top rakipten korunur. Rakip toptayken şut tuşu müdahale yapar (`startTackle` → `resolveTackle`). Her vuruştan sonra `registerKick` topun yolunu simüle edip alıcıyı seçer; botlar yol kapalıysa duvardan sektirir. İnsanın vuruş yönü `kickAim` ile yakındaki arkadaşa kilitlenir. `assignRoles` her tick `chaser`, `receiver`, `defender`, `support` dağıtır; topa sahip bot `makePlan` ile şut / pas / duvar pası / sürme seçer.

**Çizim.** Saha arka planı offscreen canvas'a bir kez çizilir (`renderBg`), her karede üstüne ışık, kar/parıltı, oyuncular, top, efektler ve HUD gelir. Karakterler `ART_R` ölçüsünde çizilip `PR`'ye büyütülür. Özel şut çubuğu yalnızca bu cihazın oyuncuları (`ctrl` `'h1'`/`'h2'`) için çizilir.

## Turnuva

- `createTournament({size, names?, seed})`: tablo `rounds[r][i] = {a, b, sa, sb, pen, winner}`; `a/b` takım indeksleri, sonraki turlar kazananlarla dolar. `nextMatch` sıradaki oynanmamış eşleşmeyi verir, `recordResult` sonucu yazar ve kazananı ilerletir.
- Zorluk `roundDiff`: son tur her zaman Zor (4 takımda Orta → Zor, 8 takımda Kolay → Orta → Zor).
- Bot–bot maçları `simulateMatch` ile ekransız oynanır (~200 ms, 3'e 3, 2 dk). Altın gol maç süresinin iki katını aşarsa penaltılara gidilir.
- Tek kişilik turnuvada oyuncunun takımı her zaman soldadır (ilk takım). Çevrimiçi turnuvada oda üyeleri takım seçer (`TOUR_TEAMS`); oyuncusu olan eşleşmeler canlı oynanır (diğer üyeler izler), oyuncusuz olanlar sunucuda anında simüle edilir. Maçlar arası 7 sn bekleme.

## Çevrimiçi

**Akış.** `hello` → `welcome` (kimlik + oturum anahtarı, tarayıcıda `localStorage 'bilye-online'`) → oda listesi → `createRoom` / `joinRoom` → lobi (`roomState`) → `setTeam` → oda sahibi `start` → `matchStart` (roster + ilk anlık görüntü) → `snap` (30 Hz, olaylarla) → `matchEnd` → lobi.

**Mesajlar (JSON, `type` alanıyla).**
- İstemci → sunucu: `hello {name, sessionKey?}`, `setName {name}`, `listRooms`, `createRoom {name, password, settings}`, `joinRoom {roomId, password}`, `setTeam {team}` (sayı ya da `null` = izleyici), `start`, `input {seq, x, y, kick, special, call, hold, sprint}`, `leave`
- Sunucu → istemci: `welcome {id, sessionKey, name}`, `rooms {rooms}`, `roomState {room}`, `matchStart {roster, info, label, snap}`, `snap {s, ev}`, `matchEnd {names, score, label, tournament}`, `left`, `error {message}`
- Oda ayarları (`cleanSettings` ile doğrulanır): `type` (`'match'`/`'tournament'`), `tSize` (4/8), `size` (1–3), `minutes` (2/3/5), `diff` (0–2, boş yerlere giren botlar), `specials`, `weather`, `arena`.

**Bağlantı.** Socket.IO önce HTTP uzun sorgulamayla (long polling) bağlanır, ağ izin verirse WebSocket'e yükseltir. WebSocket'i engelleyen kurum proxy'lerinde polling ile devam eder (daha gecikmeli); istemci bu durumda durum satırında uyarı gösterir (`net.slow`). Tüm mesajlar tek bir `m` olayıyla `{type, ...}` biçiminde gider.

**Sunucu.** Tüm odalar tek bir sabit adımlı döngüde 60 Hz ilerler, her 2 tick'te anlık görüntü yayınlanır. İstemciden yalnızca girdi kabul edilir (`sanitizeInput`); mesaj boyutu ≤ 4 KB, saniyede 120 mesajın üstü yok sayılır, 600'ün üstünde bağlantı kapatılır. Kopan oyuncunun yerini bot alır; aynı oturum anahtarıyla 60 sn içinde dönerse geri verilir, dönmezse odadan çıkarılır. Oda sahibi ayrılırsa sahiplik devredilir, oda boşalınca silinir.

**İstemci.** Sunucu maçında yerel simülasyon çalışmaz: `client/net.js` anlık görüntüleri tamponlar, en az ~100 ms (6 tick) geriden iki görüntü arasında konumları enterpole eder (`lerpView`), olayları da aynı gecikmeyle uygular. Gecikme uyarlanabilir (`M.delay`): son 4 sn'de görüntüler ne kadar geç geldiyse o kadar artar (en fazla ~600 ms), ağ düzelince yavaşça iner. Böylece polling'de topluca gelen paketlerde saha donup sıçramaz. Maç sırasında sahanın üstünde ping, bağlantı türü ve gecikme yazar (`G.netInfo`); `M.starved` donan kare sayısıdır (test için). Kendi oyuncu `mine` olarak işaretlenir ve `ctrl = 'h1'` görünür (HUD ve çizim için). Girdi değişince hemen, değişmese de 250 ms'de bir gönderilir.

## Kontroller

| İşlem | 1. oyuncu | 2. oyuncu | Dokunmatik |
|---|---|---|---|
| Hareket | WASD (tek kişide oklar da) | Oklar | Sol tarafta joystick |
| Şut / müdahale | Boşluk, X | Enter | ŞUT |
| Depar | Sol Shift | Sağ Shift | Joystick'i sonuna kadar itmek |
| Topu tut / koru | C | U, Numpad 0 | TUT |
| Pas iste | F | H | PAS |
| Falso / Füze / Aşırtma | Q / E / R | J / K / L | Ayrı düğmeler |
| Mola (çevrimiçide menü) | Esc, P | | Üstteki düğme |

## Ayarlanabilir değerler

| Sabit | Ne yapar |
|---|---|
| `P_ACC`, `P_DAMP` | Oyuncu ivmesi ve sürtünmesi (azami hız ≈ `P_ACC / (1 - P_DAMP)`) |
| `B_DAMP`, `WALL_REST` | Topun yavaşlaması ve duvardan sekme oranı |
| `KICK`, `KICK_RANGE` | Şut gücü ve vuruş mesafesi |
| `PR`, `BR` | Oyuncu ve top yarıçapı |
| `SHOTS[*].cd` | Özel şutların bekleme süresi (tick) |
| `DIFF[]` | Bot zorlukları: hız, nişan, pas eğilimi, müdahale sıklığı, depar kullanımı |
| `shared/sim.js` → `step()` içindeki depar çarpanları | Depar hızı (`1.38`), yorgun hız (`.72`), dayanıklılık harcama/dolma hızları |
| `server/index.js` başı | `SNAP_EVERY`, `RECONNECT_MS`, `BETWEEN_MS`, `MAX_ROOMS`, mesaj sınırları |
| `client/net.js` → `INTERP_TICKS`, `MAX_DELAY_TICKS`, `LATE_WINDOW_MS` | Çevrimiçi çizim gecikmesinin alt/üst sınırı ve ölçüm penceresi (yumuşaklık ↔ tepki süresi) |

## Test

`npm test` üç dosyayı paralel çalıştırır (birkaç saniye): simülasyon, turnuva/ağ serileştirme ve gerçek sunucuya Socket.IO ile bağlanan entegrasyon testi (sunucuyu rastgele bir portta kendisi başlatır).

**Tarayıcı testleri (Playwright):** sayfayı `?debug` ile açınca `window.__S` (çizilen durum), `window.__G` (istemci durumu), `window.__fx` (efektler) ve `window.__net` (bağlantı) okunabilir. Çevrimiçi senaryolar için `npm start` ile sunucuyu açıp iki ayrı tarayıcı bağlamı (context) kullanın; aynı bağlamdaki sekmeler aynı oturum anahtarını paylaşır.

Faydalı senaryolar: pas isteme başarı oranı, botların pas sayısı ve tamamlanma oranı, müdahale başarısı, uzun bot maçında gol ve konsol hatası, iki istemcide hareketin karşı tarafta görünmesi, kopma/geri dönme, turnuvanın sonuna kadar ilerlemesi.

## Bilinen kısıtlar

- Çevrimiçide istemci tahmini (client-side prediction) yok: kendi oyuncun da ~100 ms + ağ gecikmesiyle tepki verir. Yerel ağda rahat, uzak sunucuda hissedilir.
- Çevrimiçi turnuvada oyuncusuz maçlar sunucuda senkron simüle edilir (maç başına ~200 ms); bu sırada diğer odaların döngüsü kısa süre bekler. Çok odalı yoğun kullanımda worker'a taşınmalı.
- Sunucu durumu bellekte; yeniden başlatınca odalar ve oturumlar kaybolur.
- Aynı tohum aynı JS motorunda aynı maçı verir; farklı motorlar arasında bit düzeyinde aynılık garanti değil (sunucu otoriteli yapıda sorun değil).
- Bot dengesi elle ayarlandı; eşit güçteki bot takımları arasında gol az çıkıyor.
- Dikey telefonda saha küçük kalıyor (yan çevirme ipucu gösteriliyor).

## Yol haritası

1. **Modüllere ayırma** — tamamlandı.
2. **Çok oyunculu (sunucu otoriteli)** — tamamlandı: odalar, şifre, takım seçimi, izleyici, bot doldurma, kopma/geri dönme. Kalan: kendi oyuncu için tahmin + sunucu düzeltmesi (`input.seq` zaten gönderiliyor; `snap`'e son işlenen `seq` eklenip yerel `step` ile yeniden oynatılabilir), oda ayarlarını lobide değiştirme, sohbet.
3. **Turnuva modu** — tamamlandı: tek kişilik (4/8 takım, zorluk artışı, penaltılar) ve çevrimiçi oda türü.
4. **Yayına alma** — Render (ücretsiz web servisi) üzerinde: depo https://github.com/Vandellas49/bilye-ligi, build `npm ci`, start `npm start`; `main`e gönderilen her değişiklik otomatik yayınlanır. Ücretsiz serviste 15 dk hareketsizlikten sonra uyku ve ~1 dk açılış var. Kendi sunucuda reverse proxy arkasında `/canli` için `Upgrade` başlıkları iletilmeli (yoksa polling ile çalışır) ve boşta bağlantı zaman aşımı uzatılmalı (Socket.IO 15 sn'de bir ping atıyor).

## Kurallar

- Arayüz metinleri ve kod yorumları Türkçe.
- Dış görsel ya da ses dosyası yok; her şey canvas ve WebAudio ile üretiliyor. Bu korunmalı ya da bilinçli değiştirilmeli.
- `prefers-reduced-motion` açıkken parçacık, sarsıntı ve ışık animasyonları azaltılıyor; yeni efektler de buna uymalı.
- Açık/koyu tema renkleri `:root` değişkenlerinde; yeni arayüz öğeleri bu değişkenleri kullanmalı.
- Kullanıcıdan gelen metin (oyuncu ve oda adları) HTML'e yalnızca `esc()` ile ya da `textContent` ile yazılır.
- Telifli karakter, logo ya da marka kullanılmıyor; takım ve bot adları özgün.
