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

## Kullanım (Web Arayüzü)

Herhangi bir derleme veya kurulum gerektirmez. `index.html` dosyasını tarayıcıda açmanız veya GitHub Pages / dahili statik sunucu üzerinden yayınlamanız yeterlidir.

## Yapay Zeka (MCP Server) Entegrasyonu

**Astrava Converter**, yapay zeka ajanlarının (Antigravity, Claude Desktop, Cursor vb.) doğrudan görsel dönüştürme ve MB düşürme işlemlerini otonom yapabilmesi için yerleşik bir **MCP (Model Context Protocol)** sunucusu (`mcp/index.js`) içerir.

### MCP Araçları (Tools)
1. **`astrava_convert_image`**: Herhangi bir görseli (`jpg`, `png`, `webp`, `avif`, `heic`, `svg`, `gif`, `bmp`, `ico`, `tiff`) hedef formata (`webp`, `jpg`, `png`, `avif`, `bmp`, `ico`, `svg`, `pdf`, `tiff`, `gif`) dönüştürür, yeniden boyutlandırır ve sıkıştırır.
2. **`astrava_compress_to_target_size`**: Görseli belirtilen maksimum `target_size_kb` veya `target_size_mb` sınırının altına indirene kadar ikili arama (binary search) ve çözünürlük ölçekleme ile optimize eder.
3. **`astrava_batch_convert`**: Bir klasördeki tüm görselleri topluca dönüştürür ve boyutlarını küçültür.
4. **`astrava_inspect_image`**: Görselin piksel çözünürlüğünü, dosya boyutunu, renk uzayını ve şeffaflık (alpha) kanalını analiz eder.

### MCP Kurulumu (`mcp_config.json`)
```bash
npm install
```
```json
{
  "mcpServers": {
    "astrava-converter": {
      "command": "node",
      "args": ["C:/Users/Kaan/Desktop/Converter/mcp/index.js"]
    }
  }
}
```


