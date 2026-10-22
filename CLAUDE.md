# Bilye Ligi

Tepeden görünümlü, Haxball tarzı arcade futbol oyunu. Yuvarlak, yüzlü karakterler; paslaşma, top sürme, depar, top kapma ve özel şutlar var. Üç biçimde oynanır:

- **Tek maç:** bota karşı (simülasyon tarayıcıda). Aynı klavyede iki kişilik mod kaldırıldı.
- **Öğrenme:** yeni başlayanlar için 9 ders (hareket, depar, top sürme, pas, ara pas, şut, kafa/vole/rövaşata, özel şutlar, savunma); `client/tutorial.js`
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
  penalty.js         penaltı atışları (tiebreak: penalti): atan/kaleci seçimi, yerleşim, bot atış ve kaleci, sonuç, seri kuralı
  stats.js           maç istatistikleri (S.stats): sahiplik, şut/isabetli, pas/isabetli, top kapma, kurtarış, gol; statSummary + maçın oyuncusu
  tournament.js      eleme tablosu, nextMatch, recordResult, roundDiff, simulateMatch (ekransız bot maçı), penaltılar
client/
  main.js            istemci durumu G, tek maç / turnuva / çevrimiçi akışları, sabit adımlı döngü
  net.js             Socket.IO bağlantısı (global io), yeniden bağlanma, girdi gönderimi, sunucu maçının enterpolasyonla oynatılması
  input.js           klavye, joystick, dokunmatik düğmeler -> readInput(layout, {defending}); LAYOUTS ('fifa' | 'klasik')
  effects.js         olay -> parçacık/yazı/sarsıntı/ses (applyEvents), afterStep (iz, toz, göz), hava
  render.js          2B canvas çizimi; 3B'de isim/çubuk/balon/yazı/HUD katmanı; görünüm seçimi (setView3D)
  render3d.js        3B çizim (Three.js r128): kamera, karakterler, kaleler, stadyum, seyirciler, kar
  three.min.js       Three.js r128 (MIT), yalnızca 3B seçilince yüklenir
  tutorial.js        öğrenme modu: dersler (setup/check), ders kutusu (#tutBox), hedef halkası S.tutTarget
  referee.js         hakem: yalnızca görsel (fx.ref), topu çaprazdan izler, faulde koşup kart kaldırır; oyuncu gibi çizilir (kitOverride)
  crowd.js           seyirciler: coşku, ooo, olé, uğultu (updateCrowd), 2B tribün çizimi (drawCrowd2D); 3B seyirciler de crowd durumunu okur
  audio.js           WebAudio sesleri (sfx.*, tribün uğultusu crowdLevel), iki kanal: efekt ve tribün (setVolumes; menüde ve molada kaydırıcı, bilye-cfg sfxVol/crowdVol), dosya kullanılmıyor
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

**Koordinatlar.** Saha `W=1500 × H=840` dünya biriminde (1000×560 → 1250×700 → 1500×840; kale `GH=264`, orta yuvarlak `CENTER_R`, ceza sahaları sahayla orantılı), `(0,0)` sol üst köşe. Kaleler `x=0` ve `x=W` çizgisinde, ağız yüksekliği `GH`, derinliği `GD`. Görünür alan `VIEW` saha + kenar boşluğu; canvas buna göre ölçeklenir (`resize`, `worldTransform`).

**Zaman.** Fizik sabit 60 Hz'te çalışır (`TICK`), çizim `requestAnimationFrame` ile. Tüm hız ve süre değerleri tick başına.

**Simülasyon API'si (`shared/sim.js`).**
- `createMatch(ayarlar)` → maç durumu. Ayarlar: `size`, `humans [{team, ctrl, name, uid?}]` (bir takımda birden çok insan olabilir, sırayla ilk yerlere geçer), `diff`, `arena` (indeks ya da `'r'`), `weather`, `minutes` (0 = süresiz demo), `specials`, `seed`, isteğe bağlı `teamNames [sol, sağ]` ve `kickoffTeam`.
- `step(state, inputs)` → **olay listesi**. Durum yerinde güncellenir. `inputs[oyuncuId] = {x, y, kick, special, call, hold, sprint}`; bot girdileri `step` içinde üretilir, eksik insan girdisi boş sayılır. Her girdi `sanitizeInput` ile sınırlanır.
- Oyuncunun `ctrl` alanı `'ai'` değilse insan sayılır: yerelde `'h1'`, sunucuda `'net'` (ve `uid` = bağlantı kimliği). Maç sırasında `ctrl`'ü `'ai'` yapmak oyuncuyu bota devreder.
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

**Şut güç barı.** İnsan oyuncuda şut tuşu basılı tutuldukça `p.charge` 0→1 dolar (`chargeShot`, `CHARGE_TICKS` 28 tick ≈ 0,47 sn); bırakınca o güçte vuruş 10 tick bekler (`p.shot`), bar dolunca kendiliğinden vurur ve tuş bırakılana kadar kilitlenir (`p.kickLock`). Rakip toptayken tuş anında müdahale yapar, bar dolmaz. Bar oyuncunun etrafında halka olarak çizilir (`drawCharge`) ve anlık görüntüyle gönderilir. Botlar sabit güçle vurur.

**Kayarak müdahale.** `slide` girdisine basıldığı an (`startSlide`, basılı tutmak tekrarlamaz) oyuncu baktığı/bastığı yöne `SLIDE_SPEED` ile kayar, `SLIDE_TICKS` boyunca yön değiştiremez ve şut atamaz. Topa `SLIDE_REACH` kadar yaklaşırsa `slideHit`: top rakipteyse kapma şansı (önden yüksek, arkadan gövde topu kapattığı için değmez; koruma azaltır, depar/yorgunluk artırır), başarılıysa top rakibin yanından çapraz dürtülür, rakip sendeler; boştaki top kayma yönüne itilir. Kayma bitince yerden kalkma (`SLIDE_GETUP`, ıskalarsa `SLIDE_MISS_GETUP`), bekleme `SLIDE_CD`. Botlar `DIFF[].slide` olasılığıyla, yol açıksa (`slideOpen`) kayar; Kolay botlar kaymaz. Olaylar: `slide`, `slideWin`, `slideKick`, `slideMiss`; anlık görüntüde 16. bit.

**Kombolar.** Özel şut tuşlarına birlikte basılınca: `falso+fuze` (falsolu füze), `fuze+asirtma` (havadan füze), `falso+asirtma` (falsolu aşırtma), `falso+fuze+asirtma` (üçlü kombo). Girdide `special` tek şut ya da `+` ile birleşmiş kombodur, `normShot` tek biçime çevirir (parçalar `SHOT_TYPES` sırasında). `armShot` ilk tuştan sonra `COMBO_WAIT` (6 tick) bekler ve sonradan basılan hazır tuşları birleştirir; beklemedeki şut katılmaz. Fizik tek tabloda: `SHOT_PHYS` (hız, vz, falso, alev); ad/renk `COMBOS`, `shotInfo`. Kombo kullandığı tüm şutların bekleme süresini doldurur. Botlar kombo kullanmaz. İstemci bir kareden kısa tuş dokunuşlarını `TAP_MS` (40 ms) boyunca basılı sayar; dokunmatik düğmeler de aynı mekanizmayı `T:...` sanal tuşlarıyla kullanır.

**Top sahipliği, pas, bot rolleri.** Yavaş ve yakın top oyuncuya "yapışır" ve bakış yönünün önünde taşınır; insan oyuncu topu daha geniş alanda ve daha hızlıyken alır, daha uzaktan vurur (`HUMAN_GRAB`, `HUMAN_GRAB_SPEED`, `HUMAN_REACH`); boşluk topun o tick içinde geçtiği yol da hesaba katılarak ölçülür (`ballGap`), hızlı top erişimin üstünden atlayıp geçmez. Tuş basılıyken (bar doluyor) hızlı top yanından geçerse o anki güçle tek vuruş yapılır; bırakılan vuruş `SHOT_WAIT` tick bekler; `C` (tut) ile menzil büyür ve top rakipten korunur. Rakip toptayken şut tuşu müdahale yapar (`startTackle` → `resolveTackle`). Her vuruştan sonra `registerKick` topun yolunu simüle edip alıcıyı seçer; botlar yol kapalıysa duvardan sektirir. İnsanın paslarında **pas yardımı** var (`passTarget`): basılan yöne `PASS_CONE` (~34°) içindeki arkadaşlardan arada rakip olmayanı tercih edilir; topun varış süresi `B_DAMP` yavaşlamasıyla hesaplanıp arkadaşın o anki yerine (`predictPos`: insan bastığı yöne ivmelenir, bot düz gider) nişan alınır; güç mesafeye ve arkadaşın uzaklaşma hızına göre ayarlanır, güç barı `PASS_POWER_MIX` kadar etkiler; koşu hızı ve otomatik falso eklenmez. Gelen topa tek vuruşta da çalışır (en fazla ~100° yön değişikliği). Kaleye nişanlı ve bar `SHOT_OVERRIDE` üstündeyse şut sayılır, pasa çevrilmez. **Şut yardımı** (`shotTarget`, pas yardımı ayarıyla birlikte açılır/kapanır): basılan yön kaleye yaklaşık doğruysa (`SHOT_CONE`, FIFA şut tuşunda daha geniş `SHOT_CONE_WIDE`) top kale ağzına gider; yönün kale çizgisini kestiği yer direklerin içine çekilir (çapraz yukarı üst köşe, çapraz aşağı alt köşe), merkeze yakın düz vuruş kalecinin uzak köşesine; koşu hızı ve otomatik falso eklenmez. Özel şutlar da kaleye nişanlıysa kaleye gider. Özel şutlar da `kickAim` ile aynı hedefe kilitlenir. Botlar etkilenmez. Oyuncu menüden kapatabilir ("Pas yardımı: Açık/Kapalı", `bilye-cfg`'de saklanır); tercih her girdide `assist` alanıyla gider, çevrimiçinde her oyuncu kendi tercihini kullanır. Kapalıyken top sürülürken basılan yöne vurulur. `assignRoles` her tick `chaser`, `receiver`, `defender`, `support` dağıtır; topa sahip bot `makePlan` ile şut / pas / duvar pası / sürme seçer.

**3B görünüm.** Menüde "Görünüm: 3B / 2B" (kayıt yoksa bilgisayarda 3B, yalnızca dokunmatik cihazda 2B). 3B seçilince `client/three.min.js` ve `client/render3d.js` yüklenir; açılamazsa 2B'de kalınır ve menüde not çıkar. Fizik ve kontroller iki görünümde aynı. 3B sahne #cv3'te çizilir; #cv (2B tuval) saydam olarak üstte kalır ve isim, güç barı, balon, yazı ve HUD'u çizer. Oyuncu konumları `R3.project` ile ekrana yansıtılıp `posOf` üzerinden 2B çizime verilir. Saha zemini, 2B arka plan tuvalinin dokusudur (`bgVersion` değişince güncellenir). 3B maç durumunu değiştirmez; yüzler 2B `drawFace`/`drawAccessory` ile karta çizilir. Piksel oranı en fazla 1,5 (dokunmatikte 1,25); dokunmatikte gölge çözünürlüğü ve seyirci sayısı da düşük. **Otomatik kalite** (`adaptQuality`): ~2 sn'lik ortalama kare süresi 22 ms'yi aşarsa önce gölgeler kapanır, sonra seyirciler gizlenir (çözünürlük düşürülmez, görüntü bulanıklaşıyordu); en düşük kademede de 30 kare/sn altındaysa oyun bu oturumda 2B'ye geçer ve ekranda söyler (`tooSlow`). Tarayıcı 3B'yi ekran kartı olmadan, yazılımla çiziyorsa (SwiftShader, llvmpipe, Microsoft Basic Render; uzak masaüstü/sanal makinede sık) 3B hiç açılmaz (`softwareGL`); menüde 2B seçilip nedeni yazılır. Deneme için `?3dzorla` bu tespiti atlar, `?3dsabit` otomatik kaliteyi kapatır. Her karede nesne üretilmez (geçici vektörler tekrar kullanılır), yüz dokuları ve seyirciler iki karede bir güncellenir.

**Öğrenme modu.** Menüde "Mod: Öğrenme" → `startTutorial` (2'ye 2, süresiz yerel maç, saat "Ders" yazar). `createTutorial(layout)` dersleri seçili tuş düzeninin tuş adlarıyla kurar (Klasik'te ara pas dersi yok). Her ders `setup(S, st)` oyuncuları ve topu yerleştirir (kullanılmayanlar köşeye park, `ctrl: 'h9'` = girdisiz), `S.tutTarget` halkasını koyar (2B `drawTutTarget`, 3B `G3.tutRing`); `check(S, st, events)` her adımda başarıyı denetler (ör. olaylar: `goal`, `aerial`, `special`; sahiplik). Başarıda ~1,25 sn sonra sonraki ders; savunmada gol yenirse ders yeniden kurulur. Ders kutusunda Atla / Çık. İnsan halkası ve yön oku yalnızca `ctrl === 'h1'` oyuncuda çizilir.

**3B kamera.** Menüde "Kamera (3B)" (`bilye-cfg.cam`), maçta K ile sırayla: Geniş (stadyum, varsayılan), TV (yandan yayın kamerası, topu izler), Dinamik (takımının hücum yönünün arkasından), Oyuncu (kontrol edilen oyuncunun arkasından, hareket yönünü yavaşça izler), Kuşbakışı. `setCameraMode` / `updateCamera` (render3d.js); gol arasında hep Geniş kamera (sevinç yakınlaşması). `cameraYaw()` ekranın "yukarı"sının sahadaki açısıdır; main.js `camInput` girdiyi buna göre döndürür (Dinamik ve Oyuncu kamerada yukarı = ileri). Kameranın arkasında kalan noktalar `project`te ekran dışına atılır (isim etiketleri).

**Akıcılık.** Yerel maçta çizim iki fizik adımı arasındaki ara konumla yapılır (`withLerp` / `savePrev`, main.js): her adımdan önce konumlar saklanır, çizimden hemen sonra gerçek konumlar geri konur. Yüksek yenileme hızlı ya da düzensiz karelerde hareket kesik görünmez. Çevrimiçide anlık görüntü enterpolasyonu zaten var.

**Performans göstergesi.** Oyunda F2: kare/sn, en uzun kare, kare başına simülasyon ve çizim (JS) süresi, görünüm ve 3B kalite kademesi.

**Gol sevinci.** Gol arası `GOAL_PAUSE` (3 sn). Golde sevinç türü rastgele seçilir (`goalInfo.cele`, `CELEBRATIONS`: takla, gözlük, kulak, uçak, diz; anlık görüntüyle çevrimiçine de gider; kendi kalesine golde yok). Atan takımın botları gol atana koşar; gol atan botsa sevince göre köşeye, kulakta en yakın kenar çizgisine (seyirciye) koşar, taklada yerinde durur (`celebrateInput`); insanlar serbest. Hareketler istemcide çizilir (`celeOf`, `flipOf` effects.js'te; `drawGesture` render.js'te, 3B yüz kartında da): takla iki tur döner ve yüksek sıçrar, gözlükte parmaklar gözlerin çevresinde, kulakta el kulakta ve ses dalgaları, uçakta kollar açık, dizde yumruklar havada. Diğer oyuncular zıplar (`jumpOf`), takım renklerinde konfeti yağar (`fx.confetti`), "GOL!" yazısı ~0,8 sn sonra küçülüp yukarı kayar. 3B'de kamera gol atana yaklaşır, o takımın taraftarları zıplar ve LED'leri yanıp söner. 3B tribünlerde ~35 sn'de bir **meksika dalgası** dolaşır (`WAVE_CYCLE`, `WAVE_SPEED`; seyircinin tribün çevresindeki yol koordinatı `u`); `prefers-reduced-motion` açıkken yok.

**Faul ve kart.** Arkadan kayarak girmek (rakibin bakış yönüne göre arkadan) faul, çoğunlukla sarı kart; arkadan ayakta müdahale %45 faul, bazen sarı (`slideHit`, `resolveTackle` → `foul`). İkinci sarı kırmızıya döner; kırmızı kart gören oyuncu `SENDOFF_TICKS` (30 sn) üst çizginin dışında bekler (`p.out`, `sendOff`, `benchTick`; çarpışma, top, vuruş, roller ve paslarda yok sayılır), sonra kendi yarısına döner. Faulde `freekick` aşaması: oyun durur, `FK_SET` tick boyunca herkes bekler; top faulün yerinde sabit, yalnızca atıcı (`S.fk.taker`, faul yapılan) ona dokunabilir ve vurabilir, top kimseye yapışmaz; rakipler `FK_DIST` uzakta (`freekickConstraint`). Bot atıcı kaleye 450'den yakınsa uzak köşeye şut, değilse açık arkadaşa pas yönünde topun arkasına konur (`freekickAim`) ve biraz bekleyip vurur. Atıcı vurunca ya da `FK_TICKS` sonra oyun başlar. Olaylar: `foul {card}`, `sentOff`, `return`. Anlık görüntüde `fk` ve 32. bit (kenarda). İstatistikte faul ve kartlar.

**Penaltı atışları.** `settings.tiebreak` (menüde "Beraberlikte: Penaltı / Altın gol", varsayılan penaltı; çevrimiçinde penaltı). Süre bitip skor eşitse `startPenalties` (shared/penalty.js), `S.phase = 'penalty'`, `S.pens {kicks, turn, state: ready|flight|show, shooter, keeper}`. Atan takımdan sırayla biri (insanlar önce) topun arkasında; savunan takımın insanı (yoksa kaleci botu) kale çizgisinde, yalnızca çizgi boyunca hareket eder; diğerleri orta yuvarlakta. Penaltıda top kimseye yapışmaz, pas yardımı yok, yalnızca atan vurur. Bot atan bir köşeye ~1,5 kat sert vurur; bot kaleci seviyesine göre doğru tarafa atılır ve tutar. Sonuç: gol / kurtarış / kaçtı; 5'er atış, erken belli olursa biter, sonra tek tek. Bitişte `end {score, pen}`, `S.penScore`; turnuvada `recordResult(..., pen)`. Ölçüm: bot serilerinde gol oranı %72 (Zor) – %84 (Kolay).

**Lig tablosu.** `server/league.js`: çevrimiçi her maç sonunda (`finishMatch`) maçta oynayan insanlar (uid'li) adlarına göre (büyük/küçük harf duyarsız) kaydedilir: O, G, B, M, atılan/yenen, kendi golleri, maçın oyuncusu, son IP. Galibiyet 3, beraberlik 1; penaltıyla kazanan galip. Dosya `data/lig.json` (ya da `BILYE_DATA`), geçici dosyaya yazılıp yeniden adlandırılır; yazılamazsa (IIS'te izin yoksa) bellekte kalır ve bir kez uyarı basar. İstemci `league` ister, sunucu `league {rows}` döner (puan, averaj, atılan, gol sırası; en fazla 50). Menüde ve çevrimiçi ekranında "🏆 Lig tablosu".

**İstatistikler.** `shared/stats.js`, simülasyonun içinde (`initStats`, vuruşta `statKick`, sahiplikte `statOwner`, adım sonunda `statStep`). Şut: rakip kaleye 520 birimden yakın, ağız çevresine yönelen 5,5 üstü hızlı vuruş (gol olan her vuruş da şut); isabetli sonuca göre: gol ya da rakip kalecinin tutması/değmesi (kurtarış). Pas: şut olmayan vuruş; isabetli: topa sonra dokunan (tutan ya da tek dokunuşla vuran) aynı takımdan biri. Penaltı atışları sayılmaz. Maç sonu ekranında takım karşılaştırması ve maçın oyuncusu (`statSummary`: gol×3, isabetli şut×0,6, isabetli pas×0,25, top kapma×0,8, kurtarış×1,2, kazanan takıma +1). Çevrimiçinde sunucu `matchEnd {stats}` ile gönderir.

**Kaleci.** `settings.keepers` (menüde "Kaleci: Var/Yok", varsayılan var; çevrimiçi odalarda ve ekransız turnuva maçlarında açık; öğrenmede kapalı): 3'e 3 ve üstünde (kadro 1–5) her takımın son yerdeki botu `p.keeper` (2'ye 2'de sahada tek oyuncu kaldığı için yok). Topu en fazla ~0,5 sn tutar; dönemiyorsa (direğe sıkıştı) yine de atar. `keeperInput` (ai.js): kalesinin `KEEPER_OUT` önünde, topla kale ortası arasındaki çizgide; kaleye gelen hızlı topun çizgiyi keseceği yere depar; `KEEPER_BOX` içindeki yavaş topa kale tarafından çıkar, yalnızca top saha tarafındayken vurur (kendi kalesine vurmasın); topu tutunca ~20 tick sonra öndeki açık arkadaşa atar. `updateOwner`: kale alanında `KEEPER_GRAB_SPEED`'e kadar hızlı topu `DIFF[].keeper` şansıyla tutar, kaçırırsa top çarpıp seker. Kaleci iki takımdan farklı formada (`keeperKit`). Kalecinin değip kurtaramadığı şut, son vuruşu yapan (`S.lastKick`) atan takımın oyuncusuna yazılır. Ölçüm (12 maç, 2 dk 3'e 3): Orta ~1,8, Zor ~2,6 gol/maç (kalecisiz 3,9 ve 5,7; düşüş çoğunlukla sahada bir oyuncu eksilmesinden).

**Formalar ve takım adları.** `KITS` (constants.js): düz, dikey çubuklu (`serit`), yarım (`yarim`) ve yatay şeritli (`yatay`) formalar; üç kulüp forması (Fenerbahçe, Galatasaray, Beşiktaş) adı ve armasıyla (`crest`; göğüste, 3B yüz kartında, skor tabelasında, lobide; bkz. Kurallar), diğerleri renk adlı; takım adını oyuncu yazar (boşsa forma adı). Maç ayarı `kits [sol, sağ]` (`matchKits`: geçersizse varsayılan, aynıysa ikinciye başka forma), `S.kits` matchInfo ile çevrimiçine gider. İstemcide `TEAM_COL`/`TEAM_DARK` ve CSS `--team-a/b` o anki maçın formalarına göre güncellenir (`applyKitColors`, render.js); 2B gövdede desen + yaka + şort, 3B'de formaya göre önbellekli küre dokusu (`kitTexture`). Yerel: menüde "Takımım" (ad + forma) ve "Rakip forma" (`bilye-cfg`: `teamName`, `kit`, `okit`); turnuvada rakip formaları `tourKit` (tournament.js). Çevrimiçi maç odasında `room.teamCfg [{name, kit}]`; her takımın **kaptanı** (o takıma ilk giren, `captainOf`, `teamSeq`) lobide `setTeamCfg {name?, kit?}` ile değiştirir, diğer takımın formasını alamaz. 3B seyirciler takımlarının formasını giyer (gövde + ten renginde baş, `applyKits`).

**Seyirciler.** `client/crowd.js`, yalnızca istemcide (maç durumunu değiştirmez); yerelde ve çevrimiçinde her adımdan sonra `updateCrowd`. Takım başına coşku (`crowd.ex`): topa sahip takımın tribünü rakip kaleye yaklaştıkça coşar, golde atan tribün 1, yiyen 0. Hızlı top kale ağzının yanından çizgiye çarpınca "Ooo!" (atak yapan tribün elleri başında, `sfx.ooh`). Top aynı takımda 3. kez el değiştirince her pasta "Olé!" (`sfx.ole`). Tribün uğultusu coşkuya göre (`crowdLevel`). 2B: çizim alanı `SCREEN` = `VIEW` + üstte/altta `STAND` kadar tribün (simülasyon `VIEW` kullanır), 3 sıra seyirci önbellekli küçük çizimlerle (forma deseni, ten, duruş), %6'sı bayrak sallar, dalga 2B'de de var. 3B (render3d.js): aynı coşku/ooo/olé seyircilerin zıplamasına ve kollarına yansır (kollar `fanArms`, zayıf cihazda yok: aşağıda, havada, başta); %5'i bayrak sallar (`poles`/`flags`, coşkuda hızlı); kale arkası tribünlerin önünde takım adı ve armalı dev pankart (`drawBanner`, ad/forma değişince yeniden çizilir); golde atan tribünde meşaleler (ışık + takım renginde duman, `flareFans`, `smoke`). 2B tribün payı (`STAND`) yalnızca 2B'de; 3B'de çizim alanı `VIEW` (render.js `area()`).

**Oyuncu görünümü.** `buildPlayers` her oyuncuya tohumlu RNG ile ten rengi (`SKINS`, 6 ton), saç modeli (`HAIRS`: kısa, uzun, kıvırcık/afro, mohikan, topuz, örgü, kel), saç rengi (`HAIR_COLS`) ve %30 olasılıkla dövme (`TATTOOS`: yıldız, kalp, kabile, damla; yüzde, sevinçte kolda) verir; roster ile çevrimiçine gider. Çizim render.js'te: `drawSkin` (yüz bölgesi ten renginde), `drawHairFront`, `drawHairBack` (uzun saç, örgü ve afro gövdenin arkasında). Şapkalar seyrek, şapka varsa saçın üstü çizilmez. Koyu tende boncuk gözlerin arkasına beyaz konur. Oyuncu kendi görünümünü menüdeki **Oyuncum** bölümünden seçer (ten, saç, saç rengi, yüz, aksesuar, dövme; her satırda Rastgele): `bilye-cfg.look`, `initLookEditor`/`loadLook` (ui.js), önizleme `drawLookPreview` (render.js). İnsan girdisindeki `look` alanı `cleanLook` (constants.js) ile doğrulanır ve `buildPlayers`ta rastgele çekilişlerden sonra uygulanır (tohum sırası bozulmaz). Çevrimiçinde `hello {look}` ve `setLook {look}` ile sunucuya gider, sonraki maçta geçerli.

**Gol tekrarı.** `settings.replay` (yerel maç ve turnuva, çevrimiçi; öğrenmede ve demoda yok): gol arası `GOAL_PAUSE_REPLAY`. İstemci (`client/replay.js`) her adımda çizilen durumun küçük bir kopyasını tutar (`recordFrame`); golden `REPLAY_DELAY` tick sonra golden önceki `REPLAY_BEFORE` tick `REPLAY_SPEED` hızında (ağır çekim) oynatılır, ekranda "● TEKRAR" (#replayTag). Çizimde kayıttaki değerler geçici yazılır (`withReplay`), maç durumu değişmez. Golü atan takımın insan oyuncusu vuruş tuşuna yeni basınca (golden `REPLAY_SKIP_AFTER` tick sonra) simülasyon gol arasını kısaltır ve `replaySkip` yayınlar; istemciler tekrarı bitirir (çevrimiçinde de sunucu karar verir).

**Pano reklamları.** `ADS` (client/render.js; yazı, zemin, yazı ve şerit rengi; yalnızca yazı, logo yok, oyun kendi aramızda): 2B'de sahanın üst ve alt kenarında kayan şerit (üstteki sağa, alttaki sola; her karede, önceden çizilmiş reklam görselleriyle, `drawAdBoards`), 3B'de uzak pano ve kale arkası panolarında kayan reklam (`adPanels`, tek tuval dokusu, `drawAd`); golde panolar atan takımın renginde "GOL!" yazısına döner. Reklam eklemek/değiştirmek için `ADS` listesini düzenlemek yeter.

**Çizim.** Saha arka planı offscreen canvas'a bir kez çizilir (`renderBg`), her karede üstüne ışık, kar/parıltı, oyuncular, top, efektler ve HUD gelir. Karakterler `ART_R` ölçüsünde çizilip `PR`'ye büyütülür. Özel şut çubuğu yalnızca bu cihazın oyuncusu (`ctrl` `'h1'`) için, seçili tuş düzeninin tuş adlarıyla çizilir.

## Turnuva

- `createTournament({size, names?, seed})`: tablo `rounds[r][i] = {a, b, sa, sb, pen, winner}`; `a/b` takım indeksleri, sonraki turlar kazananlarla dolar. `nextMatch` sıradaki oynanmamış eşleşmeyi verir, `recordResult` sonucu yazar ve kazananı ilerletir.
- Zorluk `roundDiff`: son tur her zaman Zor (4 takımda Orta → Zor, 8 takımda Kolay → Orta → Zor).
- Bot–bot maçları `simulateMatch` ile ekransız oynanır (~200 ms, 3'e 3, 2 dk). Altın gol maç süresinin iki katını aşarsa penaltılara gidilir.
- Tek kişilik turnuvada oyuncunun takımı her zaman soldadır (ilk takım). Çevrimiçi turnuvada oda üyeleri takım seçer (`TOUR_TEAMS`); oyuncusu olan eşleşmeler canlı oynanır (diğer üyeler izler), oyuncusuz olanlar sunucuda anında simüle edilir. Maçlar arası 7 sn bekleme.

## Çevrimiçi

**Akış.** `hello` → `welcome` (kimlik + oturum anahtarı, tarayıcıda `localStorage 'bilye-online'`) → oda listesi → `createRoom` / `joinRoom` → lobi (`roomState`) → `setTeam` → oda sahibi `start` → `matchStart` (roster + ilk anlık görüntü) → `snap` (30 Hz, olaylarla) → `matchEnd` → lobi.

**Mesajlar (JSON, `type` alanıyla).**
- İstemci → sunucu: `hello {name, sessionKey?}`, `setName {name}`, `listRooms`, `createRoom {name, password, settings}`, `joinRoom {roomId, password}`, `setTeam {team}` (sayı ya da `null` = izleyici), `setLook {look}`, `setActivity {act}`, `league`, `chat {i}` (hazır mesaj, `QUICK_CHAT`; 1,2 sn'de bir; maçta oyuncunun balonu, odaya `chat {from, text}`), `setTeamCfg {name?, kit?}` (maç odası, takım kaptanı, lobide), `setSettings {settings: {diff}}` (yalnızca oda sahibi, lobide; şimdilik bot seviyesi), `start`, `input {seq, x, y, kick, special, call, hold, sprint}`, `leave`
- Sunucu → istemci: `online {users: [{id, name, ip, room, state}], recent: [{name, ip, ago}]}` (sayfayı açan herkes, oynamasa da: istemci açılışta sunucuya bağlanır ve `setActivity {act: menu|match|tour|learn|online}` bildirir; `recent` daha önce gelip çıkanlar, oturuma göre, bellekte en fazla 60; değişiklikte, en fazla 0,5 sn'de bir; IP `X-Forwarded-For`'un ilk adresi ya da bağlantı adresi, `clientIp`; istemcide sağdaki "Çevrimiçi" paneli), `welcome {id, sessionKey, name}`, `rooms {rooms}`, `roomState {room}`, `matchStart {roster, info, label, snap}`, `snap {s, ev}`, `matchEnd {names, score, label, tournament, stats}`, `left`, `error {message}`
- Oda ayarları (`cleanSettings` ile doğrulanır): `type` (`'match'`/`'tournament'`), `tSize` (4/8), `size` (1–5), `minutes` (2/3/5), `diff` (0–2, boş yerlere giren botlar), `specials`, `weather`, `arena`.

**Bağlantı.** Socket.IO önce HTTP uzun sorgulamayla (long polling) bağlanır, ağ izin verirse WebSocket'e yükseltir. WebSocket'i engelleyen kurum proxy'lerinde polling ile devam eder (daha gecikmeli); istemci bu durumda durum satırında uyarı gösterir (`net.slow`). Tüm mesajlar tek bir `m` olayıyla `{type, ...}` biçiminde gider.

**Sunucu.** Tüm odalar tek bir sabit adımlı döngüde 60 Hz ilerler, her 2 tick'te anlık görüntü yayınlanır. İstemciden yalnızca girdi kabul edilir (`sanitizeInput`); mesaj boyutu ≤ 4 KB, saniyede 120 mesajın üstü yok sayılır, 600'ün üstünde bağlantı kapatılır. Kopan oyuncunun yerini bot alır; aynı oturum anahtarıyla 60 sn içinde dönerse geri verilir, dönmezse odadan çıkarılır. Oda sahibi ayrılırsa sahiplik devredilir, oda boşalınca silinir.

**İstemci.** Sunucu maçında yerel simülasyon çalışmaz: `client/net.js` anlık görüntüleri tamponlar, en az ~100 ms (6 tick) geriden iki görüntü arasında konumları enterpole eder (`lerpView`), olayları da aynı gecikmeyle uygular. Gecikme uyarlanabilir (`M.delay`): son 4 sn'de görüntüler ne kadar geç geldiyse o kadar artar (en fazla ~600 ms), ağ düzelince yavaşça iner. Böylece polling'de topluca gelen paketlerde saha donup sıçramaz. Maç sırasında sahanın üstünde ping, bağlantı türü ve gecikme yazar (`G.netInfo`); `M.starved` donan kare sayısıdır (test için). Kendi oyuncunun hareketi tahmin edilir (`client/predict.js`): sunucuyla aynı kurallarla (`predictMove`, shared/sim.js; step ile birebir aynı olduğu test edilir) 60 Hz'te yerelde ilerletilir; her yeni görüntüde sunucu konumu bir gidiş-dönüş önceki tahmini konumla karşılaştırılır, fark birkaç adımda uygulanır (90 birimden büyükse atlanır); gol arasında ve kayarken kapalı; top bendeyse top da tahmini konumla çizilir. 200 ms pingde tuş → hareket ~440 ms'den ~75 ms'ye indi. Test için `?gecikme=200` yapay gidiş-dönüş gecikmesi, `?tahminyok` tahmini kapatır. Kendi oyuncu `mine` olarak işaretlenir ve `ctrl = 'h1'` görünür (HUD ve çizim için). Girdi değişince hemen, değişmese de 250 ms'de bir gönderilir. Gecikme ölçümü (ping, 2 sn'de bir) yalnızca odadayken (`net.inRoom`); oynamayan açık sekmeler sunucuya yalnızca bir şey değişince mesaj atar (WebSocket'i engelleyen proxy'de her mesaj bir HTTP isteği). Çevrimiçi ekranından geri dönmek bağlantıyı kesmez.

## Kontroller

Menüde "Tuş düzeni: FIFA / Klasik" (varsayılan FIFA, `bilye-cfg.keys`). FIFA düzeni, FIFA'nın "sadece klavye" düzenine göre: tuşlar topa kimin sahip olduğuna göre iş değiştirir (`readInput`'a `defending` verilir).

| İşlem | FIFA | Klasik | Dokunmatik |
|---|---|---|---|
| Hareket | Ok tuşları | WASD ya da oklar | Sol tarafta joystick |
| Pas (pas yardımıyla) | S | Boşluk / X / Enter | ŞUT |
| Sert şut (arkadaşa kilitlenmez; `SHOT_KEY_MIN/MAX`, bar `SHOT_KEY_FIRE` üstündeyse alevli, olay `hardShot`) | D | (pas yardımı kapalıysa Boşluk) | ŞUT |
| Havadan sert şut (`kind: lobshot`; aynı basışta A ve D) | A+D | – | – |
| Ara pas (arkadaşın önüne) | W | – | – |
| Havadan pas / orta | A | – | – |
| Ayak koyma / müdahale (rakip toptayken) | D | Boşluk | ŞUT |
| Kayarak müdahale | A (rakip toptayken) | V | KAY |
| Baskı (basılı; topu tutana kale tarafından kapanır, `press`, `pressDir`) | S (rakip toptayken) | – | – |
| Depar | E | Shift | Joystick'i sonuna kadar itmek |
| Topu tut / koru | Shift | C | TUT |
| Oyuncu değiştir (yerel maç) | Q | Tab | – |
| Pas iste | F | F | PAS |
| Falso / Füze / Aşırtma | Z / X / C | Q / E / R | Ayrı düğmeler |
| Kombo (birlikte bas) | Z+X, X+C, Z+C, üçü | Q+E, E+R, Q+R, üçü | Düğmelere iki/üç parmakla |
| Kamera değiştir (3B) | K | K | – |
| Hazır mesaj (balon / lobi sohbeti) | 1–6 | 1–6 | – |
| Mola (çevrimiçide menü) | Esc, P | Esc, P | Üstteki düğme |

Vuruş tuşları basılı tutuldukça güç barı dolar, bırakınca vurur. Girdideki `kind` vuruşun türünü taşır (`'pass' | 'shot' | 'through' | 'lob'`) ve tuş bırakıldıktan sonra da hatırlanır (`kindLatch`), çünkü vuruş bırakınca olur. Simülasyonda: `pass` pas yardımı ayarına göre arkadaşa kilitlenir; `shot` kilitlenmez; `through` (W) savunmanın arkasındaki boşluğa, rakip kaleye doğru (koşuyorsa koşu yönüyle karışık) `THROUGH_LEAD` + güç barı × `THROUGH_BAR` kadar ileriye; top, arkadaş oraya depar atarak vardığında gelecek hızda gider; öndeki arkadaş tercih edilir (`THROUGH_CONE`). `lob` (A) havadan (`vz`) arkadaşın biraz önüne, aradaki rakiplerin üstünden (`LOB_CONE`, geniş); uygun arkadaş yoksa güç barıyla uzağa ve yükseğe orta. İkisi de pas yardımı kapalıyken de yardımlıdır. **Havadaki top:** top `AIR_MIN`–`AIR_MAX` yüksekliğindeyken erişimdeki (`AIR_REACH`) oyuncu herhangi bir vuruş tuşuna basarsa (bot: `aiInput` kararı, rakip ya da kendi kale önünde) `aerialKick`: `AIR_HEAD` üstü kafa, altı vole, kaleye sırtı dönükse rövaşata; rakip kaleye yakınsa kaleye (şut yardımıyla), değilse basılan ya da hücum yönüne; olay `aerial {kind}` (istemcide sıçrama/geriye takla `fx.air`, yazı, ses). Orta (A) rakip kale önüne (`CROSS_ZONE`) atılınca top arkadaşın üstünden kafa yüksekliğinde geçecek şekilde biraz ileriye gider. Bot arkadaşlar takım toptayken boşa çıkar (`openSpot`, ai.js: pas yolu açık, rakipten uzak, topun en az 60 önünde, arkadaşlardan ve onların seçtiği yerlerden uzak; sahada 4+ bot varsa iki defans; savunmacı geride açık pas yolunda). Oyuncu değiştirme (`swap`, `swapControl`) yalnızca `settings.allowSwitch` ile (yerel maçlar); kontrol topa en yakın bot arkadaşa geçer, ad ve numara da geçer; takım başına 20 tick bekleme.

## Ayarlanabilir değerler

| Sabit | Ne yapar |
|---|---|
| `P_ACC`, `P_DAMP` | Oyuncu ivmesi ve sürtünmesi (azami hız ≈ `P_ACC / (1 - P_DAMP)`) |
| `B_DAMP`, `WALL_REST` | Topun yavaşlaması ve duvardan sekme oranı |
| `KICK`, `KICK_RANGE` | Şut gücü ve vuruş mesafesi |
| `CHARGE_TICKS`, `KICK_MIN`, `KICK_MAX` | Şut güç barı: dolma süresi (tick) ve `KICK` çarpanı aralığı (kısa dokunuş .. tam bar). Botlar `AI_KICK_POWER` ile tam `KICK` gücünde vurur |
| `PR`, `BR` | Oyuncu ve top yarıçapı |
| `SHOTS[*].cd` | Özel şutların bekleme süresi (tick) |
| `SHOT_CONE`, `SHOT_CONE_WIDE`, `SHOT_RANGE` | Şut yardımının açısı (ortak tuş / şut tuşu) ve en uzak mesafesi |
| `PASS_CONE`, `PASS_ARRIVE`, `PASS_POWER_MIX`, `SHOT_OVERRIDE` | Pas yardımı: kilitlenme açısı, topun arkadaşa varış hızı, güç barının etkisi, kaleye güçlü vuruşun şut sayılma eşiği |
| `SLIDE_*`, `DIFF[].slide` | Kayma hızı, süresi, menzili, top itme hızı, bekleme ve yerden kalkma süreleri; botların kayma sıklığı |
| `SHOT_PHYS`, `COMBO_WAIT` | Özel şut ve kombo fiziği (hız çarpanı, havaya kalkış, falso, alev süresi); kombo için ikinci tuşu bekleme süresi |
| `DIFF[]` | Bot zorlukları: hız, nişan, pas eğilimi, müdahale sıklığı, depar kullanımı |
| `SPRINT_DRAIN`, `SPRINT_DRAIN_BALL` | Depar süresi: tick başına dayanıklılık harcaması (topsuz ~4 sn, topla ~3,3 sn) |
| `shared/sim.js` → `step()` içindeki depar çarpanları | Depar hızı (`1.38`), yorgun hız (`.72`), dayanıklılık dolma hızları |
| `server/index.js` başı | `SNAP_EVERY`, `RECONNECT_MS`, `BETWEEN_MS`, `MAX_ROOMS`, mesaj sınırları |
| `client/net.js` → `INTERP_TICKS`, `MAX_DELAY_TICKS`, `LATE_WINDOW_MS` | Çevrimiçi çizim gecikmesinin alt/üst sınırı ve ölçüm penceresi (yumuşaklık ↔ tepki süresi) |

## Test

`npm test` üç dosyayı paralel çalıştırır (birkaç saniye): simülasyon, turnuva/ağ serileştirme ve gerçek sunucuya Socket.IO ile bağlanan entegrasyon testi (sunucuyu rastgele bir portta kendisi başlatır).

**Tarayıcı testleri (Playwright):** sayfayı `?debug` ile açınca `window.__S` (çizilen durum), `window.__G` (istemci durumu), `window.__fx` (efektler) ve `window.__net` (bağlantı) okunabilir. Çevrimiçi senaryolar için `npm start` ile sunucuyu açıp iki ayrı tarayıcı bağlamı (context) kullanın; aynı bağlamdaki sekmeler aynı oturum anahtarını paylaşır.

Faydalı senaryolar: pas isteme başarı oranı, botların pas sayısı ve tamamlanma oranı, müdahale başarısı, uzun bot maçında gol ve konsol hatası, iki istemcide hareketin karşı tarafta görünmesi, kopma/geri dönme, turnuvanın sonuna kadar ilerlemesi.

## Bilinen kısıtlar

- Çevrimiçinde yalnızca kendi oyuncunun hareketi tahmin edilir; vuruş, top kapma ve top hâlâ sunucudan, gecikmeyle gelir.
- Çevrimiçi turnuvada oyuncusuz maçlar sunucuda senkron simüle edilir (maç başına ~200 ms); bu sırada diğer odaların döngüsü kısa süre bekler. Çok odalı yoğun kullanımda worker'a taşınmalı.
- Sunucu durumu bellekte; yeniden başlatınca odalar ve oturumlar kaybolur.
- Aynı tohum aynı JS motorunda aynı maçı verir; farklı motorlar arasında bit düzeyinde aynılık garanti değil (sunucu otoriteli yapıda sorun değil).
- Bot dengesi elle ayarlandı. Büyük sahada (12–16 maçlık ölçüm, 2 dk 3’e 3) Zor botlar maç başına ~5,4 gol, Orta botlar ~3,7 gol buluyor (kafa/vole/rövaşata eklendikten sonra; öncesinde 4,5 ve 3,1) (eski sahada ~4,3); pas tamamlama %64–72.
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
- Telifli karakter, logo ya da marka kullanılmıyor; bot adları özgün. İstisna: oyun kendi aramızda oynanıyor (yayınlanmıyor), bu yüzden kullanıcının isteğiyle üç kulüp forması adıyla ve armasıyla var (Fenerbahçe, Galatasaray, Beşiktaş; `KITS[].crest`, canvas ile çizilen `drawCrest`). Pano reklamlarındaki marka adları (Pepsi, Cola Turka) da aynı istisnayla. Oyun herkese açık yayınlanacaksa bunlar kaldırılmalı.
