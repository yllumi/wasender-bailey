# WhatsApp Multi-Session API with Baileys

WhatsApp API dengan dukungan multi-session menggunakan Hono framework dan Baileys library untuk mengirim pesan WhatsApp melalui HTTP endpoint.

![contoh-dashboard-wasender.png](https://image.web.id/images/contoh-dashboard-wasender.png)

## 🚀 Fitur

- ✅ **Multi-session support** - Kelola banyak akun WhatsApp dalam satu aplikasi
- ✅ **Web Management Interface** - Dashboard untuk create, view, dan delete sessions
- ✅ Koneksi WhatsApp via QR Code dengan tampilan web
- ✅ Kirim pesan WhatsApp via API
- ✅ Auto-reconnect jika koneksi terputus
- ✅ Session persistence (tidak perlu scan QR berulang)
- ✅ API Key authentication
- ✅ HTTP Basic Auth untuk management endpoints
- ✅ Auto-format nomor telepon Indonesia
- ✅ Health monitoring (memory, uptime, sessions)
- ✅ Session limits untuk resource management

## 📋 Prerequisites

- [Bun](https://bun.sh) runtime
- WhatsApp account untuk di-link

## 🛠️ Instalasi

1. Clone atau download project ini

2. Install dependencies:
```bash
bun install
```

3. Salin file contoh `.env.example` menjadi `.env`, lalu sesuaikan nilainya:
```bash
cp .env.example .env
```

```env
# App Key untuk autentikasi API
APP_KEY=your-secret-app-key-here

# HTTP Basic Auth untuk akses management endpoints
HTTP_AUTH_USERNAME=admin
HTTP_AUTH_PASSWORD=your-secure-password

# Session Limits (sesuaikan dengan RAM server)
MAX_SESSIONS=15
```

**Rekomendasi MAX_SESSIONS berdasarkan RAM:**
- 1 GB RAM: 10-15 sessions
- 2 GB RAM: 30-40 sessions
- 4 GB RAM: 80-100 sessions

## 🚀 Menjalankan Aplikasi

```bash
bun run src/index.ts
```

Saat development, gunakan mode hot reload:

```bash
bun run dev
```

Server akan berjalan di `http://localhost:8990`. Port bersifat statis dan di-hardcode di
`src/index.ts`, jadi tidak diatur lewat `.env`.

## 🐳 Menjalankan dengan Docker

Tersedia `Dockerfile` dan `docker-compose.yml` di root repo.

### Menjalankan

Tidak ada prasyarat. `docker compose up` tetap berhasil walau `.env` dan folder `data/`
belum ada: konfigurasi dibaca dari `environment:` (bisa diisi lewat `.env`, bisa juga
di-inject oleh platform deploy), dan seluruh state runtime disimpan di named volume.

```bash
docker compose up -d --build
```

Cek status, health, dan log:

```bash
docker compose ps
docker compose logs -f
```

Health check otomatis memanggil `GET /health`, jadi container ditandai `healthy` setelah
endpoint itu membalas OK.

### Konfigurasi

Compose memakai interpolasi `${VAR:-}`, dan Compose otomatis membaca `.env` di root repo bila
file itu ada. Jadi konfigurasi bisa diisi lewat `.env`, atau langsung lewat `environment:`
(yang dipakai platform deploy).

| Variabel | Default bila kosong |
| --- | --- |
| `APP_KEY` | `''` |
| `HTTP_AUTH_USERNAME` | `admin` |
| `HTTP_AUTH_PASSWORD` | `admin` |
| `MAX_SESSIONS` | `15` |

Untuk produksi, pastikan `HTTP_AUTH_PASSWORD` di-set — jangan biarkan default `admin`.

### Data yang persisten

State runtime disimpan di named volume `wabaileys-data` (di-mount ke `/app/data`):

```
/app/data/app_key                             # hasil rotasi /generate-appkey
/app/data/sessions_registry.json              # daftar session
/app/data/auth_info_baileys/sessions/<nama>/  # kredensial WhatsApp
```

Named volume dipilih supaya Docker yang mengatur ownership (uid 1000 = user `bun`), sehingga
tidak ada file atau direktori di host yang perlu dibuat lebih dulu. Inilah yang membuat
`docker compose up` tidak lagi gagal karena path belum ada.

Backup dan inspeksi:

```bash
# backup isi volume ke tar.gz di root repo
docker run --rm -v wabaileys_wabaileys-data:/data -v "$PWD:/backup" alpine \
  tar czf /backup/wabaileys-data.tar.gz -C /data .

# lihat isi volume
docker compose exec wabaileys ls -la /app/data
```

Bila lebih suka data terlihat di host, ganti bagian `volumes:` menjadi `- ./data:/app/data`.
Syaratnya folder `data/` di host dimiliki uid 1000 (user `bun` di dalam container), karena
folder yang dibuat otomatis oleh Docker dimiliki `root` dan app akan gagal menulis.

### Berhenti dan memperbarui

```bash
docker compose down            # stop + hapus container (volume tetap aman)
docker compose up -d --build   # rebuild setelah mengubah kode
docker compose down -v         # stop dan HAPUS volume (semua session hilang)
```

### Catatan penting

- **Port statis 8990.** Hentikan dulu `bun run dev` bila sedang berjalan di port 8990.
  App selalu listen di 8990; untuk mengekspos di port host lain, ubah mapping menjadi
  mis. `"9000:8990"` di `docker-compose.yml`.
- **Jangan menjalankan dua instance sekaligus** terhadap data yang sama. Dua proses dengan
  kredensial yang sama bisa membuat sesi WhatsApp saling bentrok. Ingat bahwa `bun run dev`
  memakai folder `data/` di host, sedangkan container memakai named volume — keduanya
  terpisah.
- Folder `data/` (native) dan isi volume (Docker) **tidak** ikut ke dalam image, lihat
  `.dockerignore`.
- Container berjalan sebagai user non-root `bun` (uid 1000).
- Port dipublikasikan di semua interface. Awali dengan `127.0.0.1:` di `docker-compose.yml`
  bila hanya ingin diakses dari mesin ini sendiri.

## 🌐 Web Management Interface

Buka browser dan akses: `http://localhost:8990`

Interface ini memungkinkan Anda untuk:
- ✅ Melihat semua sessions yang aktif
- ✅ Monitor status koneksi setiap session
- ✅ Create session baru
- ✅ Hapus session yang tidak digunakan
- ✅ Akses QR code untuk setiap session
- ✅ Monitor health status (memory, uptime, sessions)
- ✅ Lihat dokumentasi API dengan contoh kode

**Authentication:** Masukkan username dan password dari `.env` saat diminta.

## 📱 Menghubungkan WhatsApp

### Cara 1: Melalui Web Interface

1. Buka `http://localhost:8990`
2. Login dengan credentials dari `.env`
3. Buat session baru (misal: `akun1`, `customer01`)
4. Klik tombol "📱 QR Code" pada session yang dibuat
5. Scan QR code dengan WhatsApp di ponsel Anda
6. Tunggu hingga status berubah menjadi "Connected"

### Cara 2: Langsung ke URL QR

1. Buat session terlebih dahulu (lihat API Endpoints)
2. Akses: `http://localhost:8990/{session_name}/qr`
3. Scan QR code yang muncul dengan WhatsApp:
   - Buka WhatsApp → **Settings** → **Linked Devices** → **Link a Device**
4. Tunggu hingga status berubah menjadi "WhatsApp Connected"

**Note:** Session akan tersimpan di folder `data/auth_info_baileys/sessions/{session_name}` (di dalam volume bernama bila dijalankan lewat Docker), jadi Anda tidak perlu scan QR code setiap kali restart aplikasi.

## 🎯 Session Names

Session name harus memenuhi kriteria:
- ✅ Hanya lowercase letters (a-z)
- ✅ Hanya angka (0-9)
- ❌ Tidak boleh ada spasi, underscore, atau karakter spesial
- ✅ Contoh valid: `akun1`, `customer01`, `tokoofficial`
- ❌ Contoh invalid: `Akun1`, `toko_official`, `akun-1`

## 🔑 Setup App Key

### Generate App Key Baru

**Authentication:** HTTP Basic Auth

```bash
curl http://localhost:8990/generate-appkey \
  -u admin:your-secure-password
```

Response:
```json
{
  "success": true,
  "message": "App key generated and saved to data/app_key.",
  "app_key": "b5a4e372a4ec0c15683ff08e132e7042ebd5b363d338cfd864ba6f826d95dd90",
  "persisted": true,
  "env_override": false
}
```

App key baru **langsung aktif** (tidak perlu restart) dan disimpan ke `data/app_key`, jadi
tetap berlaku setelah aplikasi dijalankan ulang.

**Prioritas:** bila `APP_KEY` di-set di environment (mis. lewat `environment:` di compose,
atau `.env` yang dimuat Bun saat startup), nilai itu **menang** dan dipakai lagi setelah
restart. Respons menandainya dengan `"env_override": true`. Untuk memakai key hasil rotasi
secara permanen, perbarui `APP_KEY` di environment Anda, atau kosongkan `APP_KEY` di sana
agar app memakai `data/app_key`.

### Cek App Key yang Terdaftar

Jika lupa app key, Anda bisa cek dengan HTTP Basic Auth:

```bash
curl http://localhost:8990/appkey \
  -u admin:your-secure-password
```

Response:
```json
{
  "success": true,
  "message": "Your current app key:",
  "app_key": "b5a4e372a4ec0c15683ff08e132e7042ebd5b363d338cfd864ba6f826d95dd90"
}
```

## 📡 API Endpoints

### 1. GET `/`
Web Management Interface untuk kelola sessions.

**Authentication:** HTTP Basic Auth

**Response:** HTML dashboard

---

### 2. GET `/health`
Health check dan monitoring aplikasi.

**Request:**
```bash
curl http://localhost:8990/health
```

**Response:**
```json
{
  "success": true,
  "status": "running",
  "uptime": 3600.5,
  "memory": {
    "rss_mb": 145,
    "heap_used_mb": 78,
    "heap_total_mb": 120,
    "external_mb": 5
  },
  "sessions": {
    "total": 3,
    "connected": 2,
    "disconnected": 1,
    "reconnecting": 0,
    "max_sessions": 15,
    "available_slots": 12
  }
}
```

---

### 3. GET `/sessions`
List semua sessions yang terdaftar.

**Authentication:** HTTP Basic Auth

**Request:**
```bash
curl http://localhost:8990/sessions \
  -u admin:password
```

**Response:**
```json
{
  "success": true,
  "count": 2,
  "sessions": [
    {
      "name": "akun1",
      "isConnected": true,
      "phoneNumber": "628123456789",
      "createdAt": "2026-01-15T10:00:00.000Z",
      "lastActivity": "2026-01-15T11:30:00.000Z"
    },
    {
      "name": "customer01",
      "isConnected": false,
      "phoneNumber": "Not connected yet",
      "createdAt": "2026-01-15T11:00:00.000Z",
      "lastActivity": "2026-01-15T11:00:00.000Z"
    }
  ]
}
```

---

### 4. POST `/sessions/:name`
Membuat session baru.

**Authentication:** HTTP Basic Auth

**Request:**
```bash
curl -X POST http://localhost:8990/sessions/akun1 \
  -u admin:password
```

**Response:**
```json
{
  "success": true,
  "message": "Session created successfully",
  "session": {
    "name": "akun1",
    "qr_url": "/akun1/qr"
  }
}
```

**Error Response (Session Limit Reached):**
```json
{
  "success": false,
  "message": "Maximum sessions limit (15) reached. Please delete unused sessions first.",
  "current_sessions": 15,
  "max_sessions": 15
}
```

---

### 5. DELETE `/:session_name`
Menghapus session.

**Authentication:** HTTP Basic Auth

**Request:**
```bash
curl -X DELETE http://localhost:8990/akun1 \
  -u admin:password
```

**Response:**
```json
{
  "success": true,
  "message": "Session \"akun1\" deleted successfully"
}
```

---

### 6. GET `/:session_name/qr`
Menampilkan QR code untuk menghubungkan WhatsApp pada session tertentu.

**Authentication:** HTTP Basic Auth

**Response:** HTML page dengan QR code

**Akses via browser:** `http://localhost:8990/akun1/qr`

Browser meminta username dan password Basic Auth satu kali, lalu memakai kredensial tersebut
untuk refresh otomatis setiap 5 detik. Karena halaman dashboard juga dilindungi Basic Auth,
kredensial biasanya sudah tersimpan di browser saat QR dibuka dari dashboard.

---

### 7. POST `/:session_name/send`
Mengirim pesan WhatsApp melalui session tertentu.

**Authentication:** App Key (via header atau query parameter)

**Body Parameters:**
- `number` (string, required): Nomor WhatsApp tujuan
- `message` (string, required): Pesan yang akan dikirim

**Headers:**
- `Content-Type: application/json`
- `X-App-Key: your-app-key` (atau gunakan query parameter)

**Request Example:**
```bash
curl -X POST "http://localhost:8990/akun1/send?app_key=YOUR_APP_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "number": "628986818780",
    "message": "Hello from WhatsApp API!"
  }'
```

**Response Success:**
```json
{
  "success": true,
  "message": "Message sent successfully",
  "session": "akun1",
  "to": "628986818780"
}
```

**Response Error:**
```json
{
  "success": false,
  "message": "Session \"akun1\" is not connected. Please scan QR code first at /akun1/qr or wait for reconnection."
}
```

---

### 8. GET `/generate-appkey`
Generate app key baru, langsung mengaktifkannya, dan menyimpannya ke `data/app_key`.

**Authentication:** HTTP Basic Auth

**Request:**
```bash
curl http://localhost:8990/generate-appkey \
  -u admin:password
```

**Response:**
```json
{
  "success": true,
  "message": "App key generated and saved to data/app_key.",
  "app_key": "b5a4e372a4ec0c15683ff08e132e7042ebd5b363d338cfd864ba6f826d95dd90",
  "persisted": true,
  "env_override": false
}
```

Bila `APP_KEY` di-set di environment, respons berisi `"env_override": true` dan nilai
environment akan berlaku lagi setelah restart.

---

### 9. GET `/appkey`
Cek app key yang terdaftar.

**Authentication:** HTTP Basic Auth

**Request:**
```bash
curl http://localhost:8990/appkey \
  -u admin:password
```

**Response:**
```json
{
  "success": true,
  "message": "Your current app key:",
  "app_key": "b5a4e372a4ec0c15683ff08e132e7042ebd5b363d338cfd864ba6f826d95dd90"
}
```

## 📝 Format Nomor Telepon

API otomatis memformat nomor telepon Indonesia:
- `081234567890` → `628123456890`
- `628123456890` → `628123456890` (sudah benar)
- `8123456890` → `628123456890`

Untuk nomor internasional, gunakan format lengkap dengan kode negara.

## 💻 Contoh Kode Integrasi

### PHP

```php
<?php
$url = 'http://localhost:8990/akun1/send?app_key=YOUR_APP_KEY';

$data = [
    'number' => '628986818780',
    'message' => 'Hello from WhatsApp API!'
];

$options = [
    'http' => [
        'header'  => "Content-Type: application/json\r\n",
        'method'  => 'POST',
        'content' => json_encode($data)
    ]
];

$context  = stream_context_create($options);
$result = file_get_contents($url, false, $context);

if ($result === FALSE) {
    die('Error sending message');
}

$response = json_decode($result, true);
print_r($response);
?>
```

### JavaScript (Fetch API)

```javascript
async function sendWhatsAppMessage(sessionName, phoneNumber, message) {
  const url = `http://localhost:8990/${sessionName}/send?app_key=YOUR_APP_KEY`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        number: phoneNumber,
        message: message
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      console.log('Message sent successfully!');
      return data;
    } else {
      console.error('Error:', data.message);
      throw new Error(data.message);
    }
  } catch (error) {
    console.error('Failed to send message:', error);
    throw error;
  }
}

// Usage example
sendWhatsAppMessage('akun1', '628986818780', 'Hello from WhatsApp API!')
  .then(result => console.log('Success:', result))
  .catch(error => console.error('Error:', error));
```

### Python

```python
import requests
import json

url = 'http://localhost:8990/akun1/send'
params = {'app_key': 'YOUR_APP_KEY'}
headers = {'Content-Type': 'application/json'}

data = {
    'number': '628986818780',
    'message': 'Hello from WhatsApp API!'
}

response = requests.post(url, params=params, headers=headers, json=data)
result = response.json()

if result['success']:
    print('Message sent successfully!')
    print(f"Sent to: {result['to']}")
else:
    print(f"Error: {result['message']}")
```

**Note:** Ganti `YOUR_APP_KEY` dengan app key dari `.env` dan `akun1` dengan nama session Anda.

## 🔒 Keamanan

1. **Jangan commit file `.env`** ke repository (sudah ada di `.gitignore`)
2. **Backup folder `auth_info_baileys`** - berisi kredensial WhatsApp sessions
3. **Jangan share App Key** kepada orang lain
4. **Gunakan password yang kuat** untuk HTTP Basic Auth
5. **Gunakan HTTPS** jika deploy ke production
6. **Jangan expose `.env` file** ke publik
7. **Monitor health endpoint** untuk resource usage
8. **Set MAX_SESSIONS** sesuai kapasitas server

## 🐛 Troubleshooting

### QR Code tidak muncul
- Pastikan session sudah dibuat via web interface atau API
- Pastikan aplikasi sudah running
- Refresh halaman browser
- Cek log di terminal untuk error

### Session tidak bisa dibuat
- Cek apakah sudah mencapai MAX_SESSIONS limit
- Pastikan nama session valid (lowercase + numbers only)
- Cek memory availability di `/health` endpoint

### Pesan gagal terkirim
- Pastikan session sudah connected (cek di web interface)
- Pastikan App Key valid
- Cek apakah nomor tujuan valid (gunakan format internasional)
- Pastikan koneksi internet stabil
- Cek status session di `/sessions` endpoint

### Session terputus setelah restart
- Session otomatis akan reconnect jika folder `auth_info_baileys/sessions/{name}` masih ada
- Jika tidak bisa reconnect, hapus session dan buat ulang
- Cek log untuk melihat error reconnection

### Error "Invalid credentials" saat akses web interface
- Pastikan username dan password sesuai dengan `.env`
- Restart aplikasi setelah edit `.env`

### Error "Maximum sessions limit reached"
- Hapus session yang tidak digunakan via web interface
- Tingkatkan MAX_SESSIONS di `.env` (sesuaikan dengan RAM)
- Restart aplikasi setelah edit `.env`

### High memory usage
- Monitor via `/health` endpoint
- Kurangi jumlah active sessions
- Hapus session yang tidak connected
- Restart aplikasi untuk clear memory

## 📄 License

MIT

## 🤝 Contributing

Contributions, issues, and feature requests are welcome!

## ⚠️ Disclaimer

Gunakan API ini dengan bijak dan sesuai dengan [Terms of Service WhatsApp](https://www.whatsapp.com/legal/terms-of-service). Penggunaan yang berlebihan atau spam dapat menyebabkan nomor WhatsApp Anda diblokir.
