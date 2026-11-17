# Arrow Dance 🏹

Oklara dokunarak onları tahtadan uçur — ama önündeki yol açık değilse başka bir oka çarpar ve can kaybedersin. Amaze tarzında renkli, sade ve "bir seviye daha" hissi veren bir Android bulmaca oyunu.

## Özellikler
- **Sonsuz seviye:** Her seviye numarasından türetilen sabit bir tohumla üretilir. Herkes aynı bulmacayı oynar, bu yüzden liderlik tablosu adildir. Her bulmacanın çözülebilir olduğu çözücüyle doğrulanır.
- **Giderek zorlaşır:** Tahta 3×4'ten 9×13'e kadar büyür. 6. seviyede uzun oklar (2–4 hücre), 11. seviyede taş bloklar gelir. Bağımlılık zincirleri de uzar.
- **8 tematik bölüm** (her biri 20 seviye): Başlangıç, Orman, Okyanus, Gün Batımı, Çöl, Gece, Lav, Buz. Sonrasında temalar döngüye girer.
- **3 can, 3 yıldız:** Hatasız bitirirsen 3 yıldız alırsın. Puan; seviye, yıldız ve hıza göre hesaplanır.
- **İpuçları:** Başlangıçta 3 ipucun olur. Bir seviyeyi ilk kez 3 yıldızla bitirdiğinde +1 kazanırsın.
- **Küresel liderlik tablosu** (Firebase Realtime Database, ücretsiz katman). İnternet yokken skor sıraya alınır, bağlantı gelince gönderilir.
- Ses efektleri, titreşim, konfeti, öğretici ipuçları ve Android geri tuşu desteği.

## APK nasıl derlenir (GitHub Actions)
1. GitHub'da yeni bir depo oluştur (ör. `arrow-dance`).
2. Bu klasörün içeriğini depoya yükle ve `main` dalına gönder:
   ```bash
   git init && git add . && git commit -m "Arrow Dance"
   git branch -M main
   git remote add origin https://github.com/KULLANICI/arrow-dance.git
   git push -u origin main
   ```
3. **Actions** sekmesinde "APK Derle" iş akışı kendiliğinden çalışır (~3–4 dk).
4. Bitince çalışmanın sayfasındaki **Artifacts → ArrowDance-APK** zip'ini indir. İçindeki APK'yı telefona kur.
5. Sürüm yayınlamak için bir etiket gönder: `git tag v1.0.0 && git push --tags`. APK, **Releases** sayfasına eklenir ve telefondan doğrudan indirilebilir.

## Küresel liderlik tablosunu açma (Firebase, ücretsiz)
1. https://console.firebase.google.com → **Proje ekle** (ör. `arrow-dance`).
2. **Build → Realtime Database → Veritabanı oluştur**. Konum olarak `europe-west1` seç ve **kilitli modda** başlat.
3. **Kurallar** sekmesine `firebase/database.rules.json` dosyasının içeriğini yapıştırıp **Yayınla**'ya bas.
4. Veritabanı adresini kopyala (ör. `https://arrow-dance-default-rtdb.europe-west1.firebasedatabase.app`).
5. GitHub deposunda **Settings → Secrets and variables → Actions → New repository secret**:
   - Ad: `FIREBASE_DB_URL`, Değer: kopyaladığın adres.
6. Actions'ı yeniden çalıştır. Yeni APK küresel tabloya bağlanır.

> Kurallar; isim uzunluğunu ve puan aralığını doğrular, bir oyuncunun puanının düşürülmesini de engeller. Puanlar istemcide hesaplandığı için kararlı bir hileci yine de sahte puan gönderebilir. Oyun büyürse Firebase Auth (anonim giriş) ve Cloud Functions ile sunucu tarafı doğrulama eklenebilir.

## İmzalı sürüm APK'sı (Play Store için, isteğe bağlı)
Bir anahtar oluştur:
```bash
keytool -genkey -v -keystore release.jks -keyalg RSA -keysize 2048 -validity 10000 -alias arrowdance
base64 -w0 release.jks   # çıktıyı kopyala
```
Şu GitHub secret'larını ekle: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` (`arrowdance`), `KEY_PASSWORD`. Bundan sonra iş akışı, debug APK'nın yanında imzalı bir release APK'sı da üretir.

## Proje yapısı
```
app/src/main/assets/www/   ← oyunun tamamı (HTML5 Canvas + JS)
  index.html, style.css
  levels.js       seviye üretici + çözücü
  game.js         oyun motoru, ekranlar, puanlama
  leaderboard.js  Firebase REST istemcisi
  config.js       liderlik tablosu adresi
app/src/main/java/.../MainActivity.java   ← WebView sarmalayıcı (titreşim köprüsü, geri tuşu)
.github/workflows/build-apk.yml           ← APK derleme
firebase/database.rules.json              ← veritabanı güvenlik kuralları
```

Bilgisayarda hızlı test için `app/src/main/assets/www/index.html` dosyasını tarayıcıda açman yeterli.

## Fikirler / sonraki adımlar
- Günlük bulmaca ve haftalık turnuva tablosu
- Yeni mekanikler: dönen oklar, kilitli oklar (anahtar ok çıkınca açılır), portallar
- Hamle sayısı limitli "uzman" modu
