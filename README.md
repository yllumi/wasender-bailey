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
cp env .env
```

4. Edit file `.env` sesuai kebutuhan:
```env
PORT=3000

# App Key untuk autentikasi API
APP_KEY=your-secret-app-key-here

# HTTP Basic Auth untuk akses endpoint /appkey
HTTP_AUTH_USERNAME=admin
HTTP_AUTH_PASSWORD=your-secure-password
```

## 🚀 Menjalankan Aplikasi

```bash
bun run src/index.ts
```

Server akan berjalan di `http://localhost:3000` (atau port yang Anda set di `.env`)

## 📱 Menghubungkan WhatsApp

1. Buka browser dan akses: `http://localhost:3000/qr`
2. Scan QR code dengan WhatsApp di ponsel Anda:
   - Buka WhatsApp → **Settings** → **Linked Devices** → **Link a Device**
3. Scan QR code yang muncul di browser
4. Tunggu hingga status berubah menjadi "WhatsApp Sudah Terkoneksi"

**Note:** Session akan tersimpan di folder `auth_info_baileys`, jadi Anda tidak perlu scan QR code setiap kali restart aplikasi.

## 🔑 Setup App Key

### Generate App Key Baru

Generate app key baru untuk disimpan di file `.env`:

```bash
curl -X GET http://localhost:3000/generate-appkey
```

Response:
```json
{
  "success": true,
  "message": "App key berhasil digenerate. Simpan app key di .env.",
  "app_key": "kodeappkeygeneratedkamu"
}
```

**Simpan App Key** tersebut ke file `.env`:
```env
APP_KEY=kodeappkeygeneratedkamu
```

### Cek App Key yang Terdaftar

Jika lupa app key, Anda bisa cek tanpa perlu masuk ke server:

```bash
curl -X GET http://localhost:3000/appkey \
  -u admin:your-secure-password
```

Response:
```json
{
  "success": true,
  "message": "Berikut app key Anda: ",
  "app_key": "kodeappkeygeneratedkamu"
}
```

## 📡 API Endpoints

### 1. GET `/qr`
Menampilkan QR code untuk menghubungkan WhatsApp.

**Response:** HTML page dengan QR code

**Akses via browser:** `http://localhost:3000/qr`

---

### 2. GET `/generate-appkey`
Generate app key baru untuk disimpan di file `.env`.

**Authentication:** Tidak diperlukan

**Request:**
```bash
curl -X GET http://localhost:3000/generate-appkey
```

**Response:**
```json
{
  "success": true,
  "message": "App key berhasil digenerate. Simpan app key di .env.",
  "app_key": "abc123..."
}
```

---

### 4. GET `/appkey`
Mengecek app key yang sudah terdaftar di `.env`. Berguna jika lupa app key tanpa perlu masuk ke server.

**Authentication:** HTTP Basic Auth

**Request:**
```bash
curl -X GET http://localhost:3000/appkey \
  -u admin:password
```

**Response:**
```json
{
  "success": true,
  "message": "Berikut app key Anda: ",
  "app_key": "abc123..."
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
curl -X POST http://localhost:3000/send \
  -H "Content-Type: application/json" \
  -H "X-App-Key: kodeappkeygeneratedkamu" \
  -d '{
    "number": "081234567890",
    "message": "Halo dari WhatsApp API!"
  }'
```

**Request Example (dengan Query Parameter):**
```bash
curl -X POST "http://localhost:3000/send?app_key=YOUR_APP_KEY" \
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

## 💻 Contoh Kode Integrasi

### PHP

```php
<?php
// Kirim pesan WhatsApp menggunakan PHP

$url = 'http://localhost:3000/send';
$appKey = 'kodeappkeygeneratedkamu';

$data = [
    'number' => '081234567890',
    'message' => 'Halo dari PHP!'
];

$options = [
    'http' => [
        'header'  => [
            "Content-Type: application/json",
            "X-App-Key: $appKey"
        ],
        'method'  => 'POST',
        'content' => json_encode($data)
    ]
];

$context  = stream_context_create($options);
$result = file_get_contents($url, false, $context);

if ($result === FALSE) {
    echo "Error sending message\n";
} else {
    $response = json_decode($result, true);
    echo "Success: " . $response['message'] . "\n";
    echo "Sent to: " . $response['to'] . "\n";
}
?>
```

### PHP dengan cURL

```php
<?php
// Kirim pesan WhatsApp menggunakan cURL

$url = 'http://localhost:3000/send';
$appKey = 'kodeappkeygeneratedkamu';

$data = [
    'number' => '081234567890',
    'message' => 'Halo dari PHP cURL!'
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    "X-App-Key: $appKey"
]);

$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($httpCode === 200) {
    $result = json_decode($response, true);
    echo "Success: " . $result['message'] . "\n";
    echo "Sent to: " . $result['to'] . "\n";
} else {
    echo "Error: " . $response . "\n";
}
?>
```

### JavaScript (Node.js)

```javascript
// Kirim pesan WhatsApp menggunakan Node.js dengan fetch

const appKey = 'kodeappkeygeneratedkamu';

async function sendWhatsAppMessage(number, message) {
  try {
    const response = await fetch('http://localhost:3000/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Key': appKey
      },
      body: JSON.stringify({
        number: number,
        message: message
      })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log('Success:', data.message);
      console.log('Sent to:', data.to);
    } else {
      console.error('Error:', data.message);
    }
    
    return data;
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

// Contoh penggunaan
sendWhatsAppMessage('081234567890', 'Halo dari Node.js!');
```

### JavaScript (Browser)

Perhatian: Sebaiknya tidak memanggil endpoint /send dari sisi client/browser karena appkey akan tampil ke pengguna!

```javascript
// Kirim pesan WhatsApp dari browser

const appKey = 'kodeappkeygeneratedkamu';

async function sendWhatsAppMessage(number, message) {
  try {
    const response = await fetch('http://localhost:3000/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-App-Key': appKey
      },
      body: JSON.stringify({
        number: number,
        message: message
      })
    });

    const data = await response.json();
    
    if (data.success) {
      alert('Pesan berhasil dikirim ke ' + data.to);
    } else {
      alert('Error: ' + data.message);
    }
    
    return data;
  } catch (error) {
    console.error('Error:', error);
    alert('Gagal mengirim pesan');
  }
}

// Contoh penggunaan dengan form HTML
document.getElementById('sendBtn').addEventListener('click', function() {
  const number = document.getElementById('phoneNumber').value;
  const message = document.getElementById('message').value;
  sendWhatsAppMessage(number, message);
});
```

### JavaScript (Axios)

```javascript
// Kirim pesan WhatsApp menggunakan Axios

const axios = require('axios');

const appKey = 'kodeappkeygeneratedkamu';

async function sendWhatsAppMessage(number, message) {
  try {
    const response = await axios.post('http://localhost:3000/send', {
      number: number,
      message: message
    }, {
      headers: {
        'Content-Type': 'application/json',
        'X-App-Key': appKey
      }
    });

    console.log('Success:', response.data.message);
    console.log('Sent to:', response.data.to);
    return response.data;
  } catch (error) {
    if (error.response) {
      console.error('Error:', error.response.data.message);
    } else {
      console.error('Error:', error.message);
    }
    throw error;
  }
}

// Contoh penggunaan
sendWhatsAppMessage('081234567890', 'Halo dari Axios!')
  .then(data => console.log('Done:', data))
  .catch(err => console.error('Failed:', err));
```

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
