# Astrava Converter

**Astrava Studios** şirket içi (internal) **Anything-to-Anything** görüntü dönüştürücü ve **MB / KB boyut düşürme** aracı.

Tamamen tarayıcı içi (**%100 Client-Side / Local**) çalışır; hiçbir görsel harici bir sunucuya yüklenmez.

## Özellikler

- **Anything to Anything Format Desteği**
  - **Girdi:** `JPG`, `PNG`, `WEBP`, `AVIF`, `HEIC / HEIF`, `SVG`, `GIF`, `BMP`, `ICO`, `TIFF`, `JFIF`
  - **Çıktı:** `WEBP`, `JPG`, `PNG`, `AVIF`, `BMP`, `ICO`, `SVG`, `PDF`
- **Gelişmiş MB / KB Düşürme**
  - **Kalite Modu (%):** `%5` – `%100` arası doğrudan sıkıştırma oranı.
  - **Hedef Boyut Modu (MB / KB):** İkili arama (binary search) ve opsiyonel otomatik çözünürlük ölçekleme ile dosyayı hedeflediğiniz boyutun (`100 KB`, `250 KB`, `500 KB`, `1 MB` vb.) altına indirir.
- **Çözünürlük ve Boyutlandırma**
  - Orijinal çözünürlüğü koruma, yüzdeye göre ölçekleme (`%10 – %100`), maksimum genişlik/yükseklik sınırı veya tam piksel (`Genişlik × Yükseklik`) belirleme.
- **Toplu İşlem & Karşılaştırma**
  - Çoklu sürükle-bırak ve `Ctrl+V` ile panodan yapıştırma desteği.
  - Öncesi / Sonrası canlı görsel ve boyut karşılaştırma modalı.
  - Tek tıkla `.ZIP` olarak toplu indirme.

## Kullanım

Herhangi bir derleme veya kurulum gerektirmez. `index.html` dosyasını tarayıcıda açmanız veya GitHub Pages / dahili statik sunucu üzerinden yayınlamanız yeterlidir.
