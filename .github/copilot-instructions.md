# Copilot Instructions — `wabaileys`

Panduan untuk AI agent yang bekerja di repository ini. Baca ini sebelum mengubah kode.

---

## 1. Ringkasan Project

`wabaileys` adalah **WhatsApp Multi-Session API** — satu proses Bun yang mengelola banyak akun WhatsApp
secara bersamaan, lalu mengeksposnya lewat HTTP endpoint untuk kirim pesan.

- Di balik layar memakai **Baileys** (`^7.0.0-rc.9`) untuk protokol WhatsApp Web.
- HTTP layer memakai **Hono**, dijalankan oleh **Bun**.
- Setiap session punya kredensial tersendiri di disk, jadi tidak perlu scan QR ulang setelah restart.
- Ada dashboard web sederhana (`public/index.html`) untuk kelola session + lihat QR.
- Dokumentasi pengguna lengkap ada di `README.md` (Bahasa Indonesia).

---

## 2. Stack & Perintah

| Item | Nilai |
| --- | --- |
| Runtime | **Bun** (bukan Node.js — jangan sarankan `npm`/`ts-node`) |
| Bahasa | TypeScript, `strict: true` |
| Framework HTTP | Hono 4 |
| WhatsApp client | Baileys 7 (release candidate) |
| QR render | `qrcode` |
| Error helper | `@hapi/boom` |

```bash
bun install                      # install dependencies
bun run dev                      # dev server, hot reload -> bun run --hot src/index.ts
bun run src/index.ts             # jalankan tanpa hot reload

docker compose up -d --build     # jalankan di container
docker compose logs -f           # ikuti log container
docker compose down              # stop + hapus container
```

Tidak ada test suite, linter, formatter, atau CI di repo ini. Jangan mengklaim "tests pass" —
verifikasi manual lewat endpoint `/health` atau file `simulate.http` (butuh ekstensi REST Client).

---

## 3. Struktur File

```
src/index.ts          # SELURUH backend: setup socket, session registry, semua route Hono
public/index.html     # dashboard web (CSS + JS inline, di-inject nilai app key & base URL)
simulate.http         # contoh request manual (REST Client)
data/                 # SELURUH state runtime, gitignored (lihat bagian State Runtime)
.env.example          # template konfigurasi; opsional, salin ke .env bila perlu
Dockerfile            # image runtime (oven/bun:1-alpine, multi-stage)
docker-compose.yml    # orkestrasi container + named volume untuk data/
tsconfig.json         # hanya strict + jsx hono
```

**Penting:** `src/index.ts` adalah file monolitik (~760 baris) dan berisi seluruh aplikasi.
Tidak ada folder `routes/`, `services/`, atau `middleware/`. Untuk perubahan kecil,
edit langsung di `src/index.ts` dan ikuti pola yang sudah ada — jangan refactor jadi
banyak modul kecuali diminta secara eksplisit.

### State Runtime

Semua state yang bisa berubah berada di satu direktori relatif `data/`. Path diturunkan dari
konstanta di `src/index.ts` — jangan menulis path absolut atau menyebar state ke root repo:

```
data/app_key                             # app key hasil rotasi, dipakai sebagai fallback
data/sessions_registry.json              # daftar session (berisi nomor telepon)
data/auth_info_baileys/sessions/<nama>/  # kredensial Baileys per session
```

`loadSessionsRegistry()` selalu menurunkan `authFolder` dari `AUTH_BASE_DIR` + nama session,
**bukan** dari field `authFolder` di registry. Ini yang membuat registry tetap valid setelah
`data/` dipindahkan. Pertahankan sifat itu.

### Docker

`docker-compose.yml` memakai named volume `wabaileys-data` yang di-mount ke `/app/data`.
Jangan menggantinya dengan bind mount ke file di host: `create_host_path` akan membuat
**direktori** bila file belum ada, lalu app gagal menulis. Named volume juga membuat Docker
yang mengatur ownership, sehingga `docker compose up` tidak butuh file apa pun di host
(termasuk `.env`).

Konfigurasi **tidak** memakai `env_file` — dulu itu sumber kegagalan `docker compose up` pada
deployment yang menyuntik env lewat `environment:`. Compose memakai interpolasi `${VAR:-}`,
sehingga `.env` di root repo otomatis terpakai bila ada dan tetap valid bila tidak ada.

Saat menambah state runtime baru: taruh di bawah `data/`, tambahkan ke `.dockerignore`, dan
tambahkan ke daftar di atas.

---

## 4. Konfigurasi Environment

Dibaca dari `process.env` (Bun memuat `.env` otomatis):

| Variabel | Default | Catatan |
| --- | --- | --- |
| `APP_KEY` | `''` | Dipakai untuk `validateAppKey`. Menang atas `data/app_key`. Dibaca sekali saat startup ke `currentAppKey`. |
| `HTTP_AUTH_USERNAME` | `admin` | Basic Auth management endpoint. |
| `HTTP_AUTH_PASSWORD` | `admin` | Basic Auth management endpoint. |
| `MAX_SESSIONS` | `15` | Batas jumlah session in-memory. |

**Port statis.** Port sengaja **tidak** dibaca dari environment. Nilainya di-hardcode di
`const PORT = 8990` (`src/index.ts`) dan dipakai oleh `serve()` serta fallback host dashboard.
Jangan mengembalikan `process.env.PORT` tanpa diminta; untuk mengekspos di port host lain,
ubah mapping di `docker-compose.yml` (mis. `"9000:8990"`).

Template ada di `.env.example`. `.env` bersifat **opsional** — tanpa file itu app memakai
default di tabel atas. Bun memuat `.env` otomatis bila ada, dan file itu gitignored sehingga
tidak boleh di-commit atau dicetak isinya.

**Prioritas app key:** `process.env.APP_KEY` menang; bila kosong, app membaca `data/app_key`
lewat `readAppKeyFile()`. `/generate-appkey` memperbarui `currentAppKey` seketika, menulis
`data/app_key` lewat `saveAppKeyToFile()`, dan menandai respons dengan `env_override` bila
environment akan menimpa key tersebut setelah restart.

---

## 5. Permukaan API

| Method | Path | Auth | Fungsi |
| --- | --- | --- | --- |
| GET | `/` | Basic Auth | Dashboard `public/index.html` |
| GET | `/health` | — | Uptime, memory, statistik session |
| GET | `/sessions` | Basic Auth | List semua session |
| POST | `/sessions/:name` | Basic Auth | Buat session baru + mulai connect |
| GET | `/:session_name/qr` | Basic Auth | Halaman HTML berisi QR (auto-refresh 5 detik) |
| POST | `/:session_name/send` | App Key | Kirim pesan |
| DELETE | `/:session_name` | Basic Auth | Logout + hapus folder auth |
| GET | `/appkey` | Basic Auth | Lihat app key aktif |
| GET | `/generate-appkey` | Basic Auth | Generate app key baru, langsung aktif + ditulis ke `.env` |

### Dua mekanisme auth — jangan tertukar

- `validateAppKey`: membaca `X-App-Key` header **atau** query `?app_key=`. Dipakai untuk endpoint
  operasional (kirim pesan). Ini yang dipakai integrasi eksternal.
- `validateBasicAuth`: HTTP Basic via header `Authorization: Basic ...`. Dipakai untuk endpoint
  manajemen. Gagal auth → set `WWW-Authenticate: Basic realm="App Key Management"` lalu 401.

Hanya `GET /health` yang benar-benar publik; `POST /:session_name/send` memakai App Key.

Dashboard tidak menyimpan kredensial. Ia memakai probe `fetch('/sessions')` untuk memanfaatkan
kredensial Basic Auth yang sudah di-cache browser, dan `getCredentials()` hanya sebagai fallback.
Jangan menghapus mekanisme itu tanpa memastikan cache kredensial browser tetap bekerja, dan
jangan mengirim header `Authorization` kosong (akan menimpa kredensial cache dan berujung 401).

Saat menambah endpoint baru, pilih middleware yang konsisten dengan tetangganya di tabel di atas.

### Urutan route itu penting (Hono)

Route statis didaftarkan **sebelum** route dinamis satu-segmen (`DELETE /:session_name`).
Jika menambah route dinamis satu segmen baru, taruh setelah route statis, atau route statis
bisa tertelan/ter-shadow.

---

## 6. Aturan Domain (wajib dipatuhi)

**Nama session** divalidasi dengan `/^[a-z0-9]+$/`.
Karena itu hanya huruf kecil dan angka — **tanpa** spasi, underscore, tanda hubung, atau huruf besar.
Contoh valid: `md`, `akun1`, `customer01`. Invalid: `Akun1`, `toko_official`, `akun-1`.

**Nomor telepon** dinormalisasi otomatis ke format Indonesia sebelum dipakai sebagai JID:

```ts
'0812345678'  -> '62812345678'
'812345678'   -> '62812345678'
'62812345678' -> '62812345678'
```

Aturannya: buang semua non-digit → kalau belum diawali `62`, ganti `0` di depan dengan `62`,
atau tambahkan `62` di depan. JID akhir: `${formattedNumber}@s.whatsapp.net`.

**State session** ada di `const sessions = new Map<string, SessionData>()` (in-memory).
Field penting: `sock`, `qrCode`, `isConnected`, `isReconnecting`, `phoneNumber`, `authFolder`,
`createdAt`, `lastActivity`, `reconnectTimeout`. Setiap perubahan state yang berarti harus
diikuti `saveSessionsRegistry()` supaya `sessions_registry.json` sinkron.

**Lifecycle & reconnect** — pahami sebelum menyentuh `connectSession` / `ensureSessionConnection`:

- `isReconnecting` adalah guard agar tidak ada dua koneksi bersamaan. Selalu reset ke `false`
  di semua jalur keluar (sukses, gagal, timeout), kalau tidak session akan macet.
- Putus koneksi → reconnect terjadwal setelah **3 detik**, kecuali `DisconnectReason.loggedOut`.
- `ensureSessionConnection` menunggu maksimal **30 detik** (30 × 1 detik) sebelum menyerah.
- Socket yang mati harus di-`end()` dulu sebelum reconnect.
- `sendMessageWithTyping` mensimulasikan status "typing" (delay berbasis jumlah kata + jitter acak)
  agar terlihat natural. Ada fallback kirim langsung tanpa simulasi bila gagal.

---

## 7. Konvensi Kode

Ikuti gaya yang sudah ada di `src/index.ts`:

- **Tanpa semicolon**, indentasi 2 spasi, string single quote.
- Fungsi bantuan dideklarasikan sebagai `function` di bagian atas file, bukan arrow function.
- `interface SessionData` diperluas saat ada field session baru — jangan pakai objek bebas.
- Handler Hono bertipe longgar: `(c: any)` / `(c: any, next: any)`. Pertahankan gaya ini untuk
  konsistensi; jangan mengubah ke generic `Context` tanpa diminta.
- Nama melibatkan WhatsApp memakai istilah asli library: `sock`, `jid`, `creds`, `sock.user.id`.
- Komentar dan pesan user-facing bercampur Indonesia + Inggris. Pesan error API dalam Inggris,
  penjelasan/komentar boleh Indonesia. Ikuti pola yang ada.
- Logging pakai `console.log`/`console.error` dengan prefix `[${sessionName}]`.

### Bentuk respons JSON

Semua endpoint JSON mengembalikan objek dengan `success: boolean`. Sukses biasanya menambahkan
`message`, gagal menambahkan `message` + `error: String(error)`.

```json
{ "success": true, "message": "Message sent successfully", "session": "md", "to": "628..." }
{ "success": false, "message": "Session not found" }
{ "success": false, "message": "Failed to send message", "error": "..." }
```

Status code yang dipakai: `400` validasi, `401` auth, `404` session tidak ada, `409` session
sudah ada, `429` limit session tercapai, `500` error internal. Pakai yang sudah ada, jangan
menambah kode baru tanpa alasan.

---

## 8. Keamanan & Rahasia

**Jangan pernah** commit atau mencetak isi dari:

- `auth_info_baileys/` — kredensial login WhatsApp, setara sesi aplikasi.
- `.env` — app key dan password Basic Auth.
- `sessions_registry.json` — data runtime berisi nomor telepon.

Saat menambah logging, jangan echo `app_key`, password, atau isi `creds.json`.
Perhatikan juga bahwa nilai rahasia tidak boleh di-hardcode di `public/index.html`;
nilai `YOUR_APP_KEY` dan `http://your-server:8990` di-inject saat runtime oleh handler `GET /`.

Jangan hapus entri `data`, `.env`, dan entri runtime lain dari `.dockerignore` — tanpa itu
kredensial WhatsApp dan data nomor telepon ikut ter-bake ke dalam image. Jangan pula
menjalankan `docker compose config` tanpa `--quiet`: perintah itu mengekspansi nilai `.env`
dan mencetak `APP_KEY` serta password ke terminal.

---

## 9. Inkonsistensi yang Sudah Diperbaiki

Kelima temuan lama sudah beres. Jangan mengembalikannya tanpa alasan kuat:

1. Default `PORT` kini `8990` — konsisten dengan README dan `.env.example`.
2. `/appkey` membaca `currentAppKey`, satu sumber kebenaran dengan `validateAppKey`.
3. `/generate-appkey` dibatasi `validateBasicAuth`, langsung memperbarui `currentAppKey`, dan
   menulis `data/app_key` lewat `saveAppKeyToFile()`. Respons memuat `persisted` + `env_override`.
4. File contoh kini bernama `.env.example`; `.env` tetap gitignored dan tidak boleh di-commit.
5. `GET /` dan `GET /:session_name/qr` sudah memakai `validateBasicAuth`. Sebelumnya `GET /`
   membocorkan app key karena meng-inject `currentAppKey` ke HTML dashboard tanpa autentikasi.
6. Seluruh state runtime dipindah ke `data/`, dan compose memakai named volume + interpolasi
   `${VAR:-}` (bukan `env_file`). Sebelumnya `docker compose up` gagal di deployment yang
   meng-inject env lewat `environment:` dan belum punya `.env` maupun `sessions_registry.json`.

### Sisa keterbatasan yang perlu diingat

- `data/` diresolusi relatif ke CWD proses. Jalankan server dari root repo (`bun run dev`)
  atau dari `/app` di dalam container, kalau tidak state akan tertulis di tempat lain.
- Setelah rotasi key, app key di dashboard baru ter-update saat halaman di-reload.
- Bila `APP_KEY` di-set di environment, nilai itu menang atas `data/app_key` setiap restart
  (respons `/generate-appkey` menandainya dengan `env_override: true`).
- Ganti app key berarti client lama langsung kena 401, karena `validateAppKey` membandingkan
  dengan `currentAppKey` secara langsung.
- `GET /` meng-inject app key ke HTML, jadi route itu wajib tetap di belakang `validateBasicAuth`.
  Jangan menambahkan varian route atau alias yang membuka akses tanpa auth.

---

## 10. Checklist Sebelum Selesai

- [ ] Perubahan ada di `src/index.ts` (atau `public/index.html` untuk UI) dan mengikuti gaya existing.
- [ ] Endpoint baru punya middleware auth yang tepat dan konsisten dengan tabel di bagian 5.
- [ ] Respons mengikuti bentuk `success` + status code yang sudah dipakai.
- [ ] Kalau menyentuh `isReconnecting` / `reconnectTimeout`, semua jalur keluar sudah reset state.
- [ ] Perubahan perilaku API → update juga `README.md` (Bahasa Indonesia) dan `simulate.http`.
- [ ] Tidak ada rahasia atau data nomor telepon yang ikut ter-commit.
- [ ] Kalau menyentuh `Dockerfile` / `docker-compose.yml`: `docker compose up -d --build`
      berhasil, container `healthy`, dan `GET /health` membalas `success: true`.
- [ ] Verifikasi dengan `bun run dev` lalu cek `GET /health`.

### Status verifikasi (pass perbaikan bagian 9)

Semua poin di atas sudah dipenuhi dan diuji manual pada server `bun run dev` (port 8990):

| Uji | Hasil |
| --- | --- |
| `GET /health` tanpa auth | `200`, `success: true` |
| `GET /`, `/sessions`, `/appkey`, `/generate-appkey`, `/:name/qr` tanpa auth | `401` |
| `GET /`, `/sessions`, `/appkey`, `/:name/qr` dengan Basic Auth | `200` |
| `GET /appkey` dibanding `APP_KEY` di `.env` | identik, panjang 64 |
| `GET /generate-appkey` dengan Basic Auth | `persisted: true`, `.env` diperbarui (tetap 1 baris `APP_KEY`), `currentAppKey` langsung aktif |
| HTML dashboard | placeholder `YOUR_APP_KEY` sudah tergantikan |
| `git status` | `.env`, `data/` ignored |
| `docker compose up -d` tanpa `.env` dan tanpa `data/` | berhasil, container `Up (healthy)` |
| Volume `wabaileys-data` | writable oleh uid 1000; sesi `toni` restore lalu `WhatsApp connection opened` |
| Isi image | hanya `data/auth_info_baileys/sessions` kosong; tanpa kredensial, registry, atau app key |
