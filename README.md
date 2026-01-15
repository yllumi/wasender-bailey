# WhatsApp API with Baileys

WhatsApp API sederhana menggunakan Hono framework dan Baileys library untuk mengirim pesan WhatsApp melalui HTTP endpoint.

## 🚀 Fitur

- ✅ Koneksi WhatsApp via QR Code dengan tampilan web
- ✅ Kirim pesan WhatsApp via API
- ✅ Auto-reconnect jika koneksi terputus
- ✅ Session tersimpan (tidak perlu scan QR berulang)
- ✅ API Key authentication
- ✅ HTTP Basic Auth untuk management endpoint
- ✅ Auto-format nomor telepon Indonesia

## 📋 Prerequisites

- [Bun](https://bun.sh) runtime
- WhatsApp account untuk di-link

## 🛠️ Instalasi

1. Clone atau download project ini

2. Install dependencies:
```bash
bun install
```

3. Copy dan edit file environment:
```bash
cp .env.example .env
```

4. Edit file `.env` sesuai kebutuhan:
```env
PORT=8990

# App Key untuk autentikasi API
APP_KEY=your-secret-app-key-here

# HTTP Basic Auth untuk endpoint /appkey
HTTP_AUTH_USERNAME=admin
HTTP_AUTH_PASSWORD=your-secure-password
```

## 🚀 Menjalankan Aplikasi

```bash
bun run src/index.ts
```

Server akan berjalan di `http://localhost:8990` (atau port yang Anda set di `.env`)

## 📱 Menghubungkan WhatsApp

1. Buka browser dan akses: `http://localhost:8990/qr`
2. Scan QR code dengan WhatsApp di ponsel Anda:
   - Buka WhatsApp → **Settings** → **Linked Devices** → **Link a Device**
3. Scan QR code yang muncul di browser
4. Tunggu hingga status berubah menjadi "WhatsApp Sudah Terkoneksi"

**Note:** Session akan tersimpan di folder `auth_info_baileys`, jadi Anda tidak perlu scan QR code setiap kali restart aplikasi.

## 🔑 Generate App Key

Sebelum mengirim pesan, Anda perlu generate App Key terlebih dahulu:

```bash
curl -X POST http://localhost:8990/appkey \
  -u admin:your-secure-password
```

Response:
```json
{
  "success": true,
  "message": "App key berhasil di-generate",
  "app_key": "b5a4e372a4ec0c15683ff08e132e7042ebd5b363d338cfd864ba6f826d95dd90",
  "note": "Simpan app key ini dengan aman..."
}
```

**Simpan App Key** yang didapat untuk digunakan pada endpoint `/send`.

## 📡 API Endpoints

### 1. GET `/qr`
Menampilkan QR code untuk menghubungkan WhatsApp.

**Response:** HTML page dengan QR code

**Akses via browser:** `http://localhost:8990/qr`

---

### 2. POST `/appkey`
Generate atau regenerate App Key baru.

**Authentication:** HTTP Basic Auth

**Request:**
```bash
curl -X POST http://localhost:8990/appkey \
  -u admin:password
```

**Response:**
```json
{
  "success": true,
  "app_key": "..."
}
```

---

### 3. POST `/send`
Mengirim pesan WhatsApp ke nomor tujuan.

**Authentication:** App Key (via header atau query parameter)

**Body Parameters:**
- `number` (string, required): Nomor WhatsApp tujuan
- `message` (string, required): Pesan yang akan dikirim

**Headers:**
- `Content-Type: application/json`
- `X-App-Key: your-app-key` (atau gunakan query parameter)

**Request Example (dengan Header):**
```bash
curl -X POST http://localhost:8990/send \
  -H "Content-Type: application/json" \
  -H "X-App-Key: b5a4e372a4ec0c15683ff08e132e7042ebd5b363d338cfd864ba6f826d95dd90" \
  -d '{
    "number": "081234567890",
    "message": "Halo dari WhatsApp API!"
  }'
```

**Request Example (dengan Query Parameter):**
```bash
curl -X POST "http://localhost:8990/send?app_key=YOUR_APP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "628986818780",
    "message": "Halo dari WhatsApp API!"
  }'
```

**Response Success:**
```json
{
  "success": true,
  "message": "Pesan berhasil dikirim",
  "to": "628986818780"
}
```

**Response Error:**
```json
{
  "success": false,
  "message": "Invalid or missing app key"
}
```

## 📝 Format Nomor Telepon

API otomatis memformat nomor telepon Indonesia:
- `081234567890` → `628123456890`
- `628123456890` → `628123456890` (sudah benar)
- `8123456890` → `628123456890`

Untuk nomor internasional, gunakan format lengkap dengan kode negara.

## 🔒 Keamanan

1. **Jangan commit file `.env`** ke repository (sudah ada di `.gitignore`)
2. **Backup folder `auth_info_baileys`** - berisi kredensial WhatsApp
3. **Jangan share App Key** kepada orang lain
4. **Gunakan password yang kuat** untuk HTTP Basic Auth
5. **Gunakan HTTPS** jika deploy ke production

## 📂 Struktur Folder

```
wabaileys/
├── src/
│   └── index.ts          # Main application file
├── auth_info_baileys/    # WhatsApp session files (auto-generated)
├── .env                  # Environment variables
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

## 🐛 Troubleshooting

### QR Code tidak muncul
- Pastikan aplikasi sudah running
- Refresh halaman browser
- Cek log di terminal untuk error

### Pesan gagal terkirim
- Pastikan sudah scan QR code di `/qr`
- Pastikan App Key valid
- Cek apakah nomor tujuan valid
- Pastikan koneksi internet stabil

### Session terputus setelah restart
- Session otomatis akan reconnect jika folder `auth_info_baileys` masih ada
- Jika tidak bisa reconnect, hapus folder `auth_info_baileys` dan scan QR ulang

### Error "Invalid credentials" saat akses `/appkey`
- Pastikan username dan password sesuai dengan `.env`
- Restart aplikasi setelah edit `.env`

## 📄 License

MIT

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## ⚠️ Disclaimer

Gunakan API ini dengan bijak dan sesuai dengan [Terms of Service WhatsApp](https://www.whatsapp.com/legal/terms-of-service). Penggunaan yang berlebihan atau spam dapat menyebabkan nomor WhatsApp Anda diblokir.
