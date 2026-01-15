import { Hono } from 'hono'
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from 'baileys'
import { Boom } from '@hapi/boom'
import * as QRCode from 'qrcode'
import { randomBytes } from 'crypto'

const app = new Hono()

let sock: any = null
let qrCodeData: string = ''
let isConnected: boolean = false
let currentAppKey: string = process.env.APP_KEY || ''

// Function to generate random app key
function generateAppKey(): string {
  return randomBytes(32).toString('hex')
}

// Middleware untuk validasi app key
async function validateAppKey(c: any, next: any) {
  const appKey = c.req.header('X-App-Key') || c.req.query('app_key')
  
  if (!appKey || appKey !== currentAppKey) {
    return c.json({ 
      success: false, 
      message: 'Invalid or missing app key' 
    }, 401)
  }
  
  await next()
}

// Middleware untuk HTTP Basic Auth
async function validateBasicAuth(c: any, next: any) {
  const authHeader = c.req.header('Authorization')
  
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    c.header('WWW-Authenticate', 'Basic realm="App Key Management"')
    return c.json({ 
      success: false, 
      message: 'Authentication required' 
    }, 401)
  }
  
  const base64Credentials = authHeader.substring(6)
  const credentials = Buffer.from(base64Credentials, 'base64').toString('utf-8')
  const [username, password] = credentials.split(':')
  
  const validUsername = process.env.HTTP_AUTH_USERNAME || 'admin'
  const validPassword = process.env.HTTP_AUTH_PASSWORD || 'admin'
  
  if (username !== validUsername || password !== validPassword) {
    c.header('WWW-Authenticate', 'Basic realm="App Key Management"')
    return c.json({ 
      success: false, 
      message: 'Invalid credentials' 
    }, 401)
  }
  
  await next()
}

async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys')
  const { version } = await fetchLatestBaileysVersion()
  
  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: true
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', (update: any) => {
    const { connection, lastDisconnect, qr } = update
    
    if (qr) {
      qrCodeData = qr
    }

    if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Connection closed due to', lastDisconnect?.error, ', reconnecting', shouldReconnect)
      
      isConnected = false
      
      if (shouldReconnect) {
        connectToWhatsApp()
      }
    } else if (connection === 'open') {
      console.log('WhatsApp connection opened')
      isConnected = true
      qrCodeData = ''
    }
  })
}

// Function to ensure WhatsApp connection is active
async function ensureConnection(): Promise<boolean> {
  if (isConnected && sock) {
    return true
  }
  
  console.log('Connection not active, attempting to reconnect...')
  
  // Try to reconnect if socket exists but not connected
  if (!sock) {
    await connectToWhatsApp()
    
    // Wait for connection with timeout
    let attempts = 0
    while (!isConnected && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
    }
  }
  
  return isConnected
}

app.get('/', (c) => {
  return c.text('Hello Hono with Baileys!')
})

// QR code generation endpoint
app.get('/qr', async (c) => {
  try {
    if (isConnected) {
      return c.html(`
        <html>
          <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif;">
            <h2 style="color: green;">✓ WhatsApp Sudah Terkoneksi</h2>
            <p>Device WhatsApp Anda sudah terhubung dengan server.</p>
          </body>
        </html>
      `)
    }

    if (!sock) {
      await connectToWhatsApp()
      
      // Wait for QR code to be generated
      let attempts = 0
      while (!qrCodeData && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 500))
        attempts++
      }
    }

    if (!qrCodeData) {
      return c.html(`
        <html>
          <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif;">
            <h2 style="color: orange;">⏳ QR Code Belum Tersedia</h2>
            <p>Silakan tunggu beberapa detik dan refresh halaman ini.</p>
            <button onclick="location.reload()" style="padding: 10px 20px; cursor: pointer; background: #25D366; color: white; border: none; border-radius: 5px; font-size: 16px;">Refresh</button>
          </body>
        </html>
      `)
    }

    // Generate QR code image
    const qrImage = await QRCode.toDataURL(qrCodeData)
    
    return c.html(`
      <html>
        <head>
          <meta http-equiv="refresh" content="5">
        </head>
        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
          <div style="background: white; padding: 30px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center;">
            <h1 style="margin-top: 0; color: #333;">📱 Scan QR Code</h1>
            <p style="color: #666; margin-bottom: 20px;">Buka WhatsApp di ponsel Anda dan scan QR code di bawah ini</p>
            <img src="${qrImage}" alt="QR Code" style="width: 300px; height: 300px; border: 3px solid #25D366; border-radius: 10px;" />
            <p style="color: #999; margin-top: 20px; font-size: 14px;">Halaman akan otomatis refresh setiap 5 detik</p>
          </div>
        </body>
      </html>
    `)
  } catch (error) {
    console.error('Error generating QR:', error)
    return c.html(`
      <html>
        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif;">
          <h2 style="color: red;">❌ Error</h2>
          <p>Gagal membuat QR code: ${String(error)}</p>
          <button onclick="location.reload()" style="padding: 10px 20px; cursor: pointer; background: #25D366; color: white; border: none; border-radius: 5px; font-size: 16px;">Coba Lagi</button>
        </body>
      </html>
    `)
  }
})

// Get app key endpoint
app.get('/appkey', validateBasicAuth, async (c) => {
  try {
    const appKey = process.env.APP_KEY || ''
    let notes = ''
    if(!appKey) {
      notes = 'Anda belum mengatur app key di .env'
    } else {
      notes = 'Berikut app key Anda: '
    }
    
    return c.json({
      success: true,
      message: notes,
      app_key: appKey,
    })
  } catch (error) {
    console.error('Error getting app key:', error)
    return c.json({ 
      success: false, 
      message: 'Gagal mengambil app key',
      error: String(error)
    }, 500)
  }
})

app.get('/generate-appkey', async (c) => {
  try {
    const appKey = generateAppKey()

    return c.json({
      success: true,
      message: "App key berhasil digenerate. Simpan app key di .env.",
      app_key: appKey,
    })
  } catch (error) {
    console.error('Error generating app key:', error)
    return c.json({ 
      success: false, 
      message: 'Gagal menggenerate app key',
      error: String(error)
    }, 500)
  }
})

// Send message endpoint
app.post('/send', validateAppKey, async (c) => {
  try {
    const { number, message } = await c.req.json()

    if (!number || !message) {
      return c.json({ 
        success: false, 
        message: 'Parameter number dan message harus diisi' 
      }, 400)
    }

    // Ensure connection is active, reconnect if needed
    const connectionReady = await ensureConnection()
    
    if (!connectionReady) {
      return c.json({ 
        success: false, 
        message: 'WhatsApp belum terkoneksi. Silakan scan QR code terlebih dahulu di /qr' 
      }, 400)
    }

    // Format number to WhatsApp format (remove spaces, add country code if needed)
    let formattedNumber = number.replace(/\D/g, '')
    
    // Add country code if not present (assuming Indonesia +62)
    if (!formattedNumber.startsWith('62')) {
      if (formattedNumber.startsWith('0')) {
        formattedNumber = '62' + formattedNumber.substring(1)
      } else {
        formattedNumber = '62' + formattedNumber
      }
    }

    const jid = `${formattedNumber}@s.whatsapp.net`

    await sock.sendMessage(jid, { text: message })

    return c.json({
      success: true,
      message: 'Pesan berhasil dikirim',
      to: formattedNumber
    })
  } catch (error) {
    console.error('Error sending message:', error)
    return c.json({ 
      success: false, 
      message: 'Gagal mengirim pesan',
      error: String(error)
    }, 500)
  }
})

export default {
  port: parseInt(process.env.PORT || '3001'),
  fetch: app.fetch
}
