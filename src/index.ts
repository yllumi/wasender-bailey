import { Hono } from 'hono'
import makeWASocket, { 
  DisconnectReason, 
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from 'baileys'
import { Boom } from '@hapi/boom'
import * as QRCode from 'qrcode'
import { randomBytes } from 'crypto'
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'

const app = new Hono()

// Session data structure
interface SessionData {
  sock: any
  qrCode: string
  isConnected: boolean
  isReconnecting: boolean
  phoneNumber?: string
  authFolder: string
  createdAt: Date
  lastActivity: Date
  reconnectTimeout?: NodeJS.Timeout
}

// Session registry
const sessions = new Map<string, SessionData>()
const SESSIONS_REGISTRY_FILE = 'sessions_registry.json'
const AUTH_BASE_DIR = 'auth_info_baileys/sessions'
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || '15')

let currentAppKey: string = process.env.APP_KEY || ''

// Ensure base auth directory exists
if (!existsSync(AUTH_BASE_DIR)) {
  mkdirSync(AUTH_BASE_DIR, { recursive: true })
}

// Function to generate random app key
function generateAppKey(): string {
  return randomBytes(32).toString('hex')
}

// Get process memory usage
function getProcessMemory() {
  const usage = process.memoryUsage()
  return {
    rss: Math.round(usage.rss / 1024 / 1024), // MB
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024), // MB
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024), // MB
    external: Math.round(usage.external / 1024 / 1024) // MB
  }
}

// Validate session name (lowercase letters and numbers only)
function isValidSessionName(name: string): boolean {
  return /^[a-z0-9]+$/.test(name)
}

// Save sessions registry to disk
function saveSessionsRegistry() {
  const registry = Array.from(sessions.entries()).map(([name, data]) => ({
    name,
    phoneNumber: data.phoneNumber,
    isConnected: data.isConnected,
    authFolder: data.authFolder,
    createdAt: data.createdAt,
    lastActivity: data.lastActivity
  }))
  writeFileSync(SESSIONS_REGISTRY_FILE, JSON.stringify(registry, null, 2))
}

// Load sessions registry from disk
function loadSessionsRegistry() {
  try {
    if (existsSync(SESSIONS_REGISTRY_FILE)) {
      const data = JSON.parse(readFileSync(SESSIONS_REGISTRY_FILE, 'utf-8'))
      console.log(`Found ${data.length} saved sessions, attempting to restore...`)
      
      for (const session of data) {
        if (existsSync(session.authFolder)) {
          sessions.set(session.name, {
            sock: null,
            qrCode: '',
            isConnected: false,
            isReconnecting: false,
            phoneNumber: session.phoneNumber,
            authFolder: session.authFolder,
            createdAt: new Date(session.createdAt),
            lastActivity: new Date(session.lastActivity)
          })
          
          connectSession(session.name).catch(err => {
            console.error(`Failed to restore session ${session.name}:`, err.message)
          })
        }
      }
    } else {
      // Create empty registry file if it doesn't exist
      writeFileSync(SESSIONS_REGISTRY_FILE, JSON.stringify([], null, 2))
      console.log('Created new sessions registry file')
    }
  } catch (error) {
    console.error('Error loading sessions registry:', error)
    // Create empty registry file on error
    writeFileSync(SESSIONS_REGISTRY_FILE, JSON.stringify([], null, 2))
  }
}

// Connect specific session to WhatsApp
async function connectSession(sessionName: string) {
  const sessionData = sessions.get(sessionName)
  if (!sessionData) {
    throw new Error('Session not found')
  }

  // Prevent multiple simultaneous connections
  if (sessionData.isReconnecting) {
    console.log(`[${sessionName}] Already reconnecting, skipping...`)
    return
  }

  sessionData.isReconnecting = true

  // Clear any existing reconnect timeout
  if (sessionData.reconnectTimeout) {
    clearTimeout(sessionData.reconnectTimeout)
    sessionData.reconnectTimeout = undefined
  }

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionData.authFolder)
    const { version } = await fetchLatestBaileysVersion()
    
    const sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false
    })

    sock.ev.on('creds.update', saveCreds)

    sock.ev.on('connection.update', (update: any) => {
      const { connection, lastDisconnect, qr } = update
      
      if (qr) {
        sessionData.qrCode = qr
        console.log(`[${sessionName}] QR code generated`)
      }

      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut
        console.log(`[${sessionName}] Connection closed, reconnecting:`, shouldReconnect)
        
        sessionData.isConnected = false
        sessionData.isReconnecting = false
        sessionData.sock = null
        
        if (shouldReconnect) {
          // Schedule reconnect with delay to avoid rapid reconnection
          sessionData.reconnectTimeout = setTimeout(() => {
            console.log(`[${sessionName}] Attempting scheduled reconnection...`)
            connectSession(sessionName).catch(err => {
              console.error(`[${sessionName}] Scheduled reconnection failed:`, err.message)
              sessionData.isReconnecting = false
            })
          }, 3000)
        }
        
        saveSessionsRegistry()
      } else if (connection === 'open') {
        console.log(`[${sessionName}] WhatsApp connection opened`)
        sessionData.isConnected = true
        sessionData.isReconnecting = false
        sessionData.qrCode = ''
        sessionData.lastActivity = new Date()
        
        // Get phone number info
        if (sock.user?.id) {
          sessionData.phoneNumber = sock.user.id.split(':')[0]
        }
        
        saveSessionsRegistry()
      }
    })

    sessionData.sock = sock
    sessions.set(sessionName, sessionData)
  } catch (error) {
    console.error(`[${sessionName}] Error in connectSession:`, error)
    sessionData.isReconnecting = false
    throw error
  }
}

// Send message with typing simulation for natural feel
async function sendMessageWithTyping(sock: any, jid: string, message: string, sessionName: string) {
  try {
    // 1. Subscribe to contact's presence
    await sock.presenceSubscribe(jid)

    // 2. Show typing status
    await sock.sendPresenceUpdate('composing', jid)
    
    // 3. Simulate typing delay based on message length (1s per 5 words + random 1-3s)
    const wordCount = message.split(/\s+/).filter(Boolean).length
    const baseDelay = Math.max(500, (wordCount / 5) * 1000) // at least 500ms
    await new Promise(resolve => setTimeout(resolve, baseDelay))

    await sock.sendPresenceUpdate('paused', jid)
    const randomDelay = 1000 + Math.random() * 2000
    await new Promise(resolve => setTimeout(resolve, randomDelay))
    
    await sock.sendPresenceUpdate('composing', jid)
    await new Promise(resolve => setTimeout(resolve, randomDelay))

    // 4. Send the message
    await sock.sendMessage(jid, { text: message })

    // 5. Stop typing status
    await sock.sendPresenceUpdate('paused', jid)

    console.log(`[${sessionName}] Message sent with typing simulation to ${jid.split('@')[0]}`)
  } catch (error) {
    console.error(`[${sessionName}] Error in sendMessageWithTyping:`, error)
    // Fallback: try sending directly without typing simulation
    await sock.sendMessage(jid, { text: message })
  }
}

// Ensure specific session connection is active
async function ensureSessionConnection(sessionName: string): Promise<boolean> {
  const sessionData = sessions.get(sessionName)
  if (!sessionData) {
    return false
  }

  if (sessionData.isConnected && sessionData.sock) {
    return true
  }
  
  // If already reconnecting, wait for it to complete
  if (sessionData.isReconnecting) {
    console.log(`[${sessionName}] Already reconnecting, waiting...`)
    let attempts = 0
    while (sessionData.isReconnecting && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
      
      // Check if reconnection succeeded
      if (sessionData.isConnected && sessionData.sock) {
        return true
      }
    }
    
    // If still reconnecting after timeout, it failed
    if (sessionData.isReconnecting) {
      console.log(`[${sessionName}] Reconnection timeout, resetting state`)
      sessionData.isReconnecting = false
      return false
    }
  }
  
  console.log(`[${sessionName}] Connection not active, attempting to reconnect...`)
  
  // If socket exists but disconnected, close it first
  if (sessionData.sock && !sessionData.isConnected) {
    try {
      console.log(`[${sessionName}] Closing existing disconnected socket...`)
      await sessionData.sock.end()
      sessionData.sock = null
    } catch (error) {
      console.log(`[${sessionName}] Error closing socket:`, error)
      sessionData.sock = null
    }
  }
  
  // Reconnect
  try {
    await connectSession(sessionName)
    
    // Wait for connection with timeout
    let attempts = 0
    while (!sessionData.isConnected && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      attempts++
      
      // Check if session still exists
      if (!sessions.has(sessionName)) {
        console.log(`[${sessionName}] Session was deleted during reconnection`)
        return false
      }
    }
    
    if (!sessionData.isConnected) {
      console.log(`[${sessionName}] Reconnection timeout after 30 seconds`)
      sessionData.isReconnecting = false
      return false
    }
    
    console.log(`[${sessionName}] Reconnection successful`)
    return true
  } catch (error) {
    console.error(`[${sessionName}] Error during reconnection:`, error)
    sessionData.isReconnecting = false
    return false
  }
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

// Initialize sessions on startup
loadSessionsRegistry()

app.get('/', (c) => {
  try {
    const htmlPath = join(process.cwd(), 'public', 'index.html')
    if (existsSync(htmlPath)) {
      let htmlContent = readFileSync(htmlPath, 'utf-8')
      
      // Inject actual values into HTML
      const host = c.req.header('host') || 'localhost:8990'
      const proto = c.req.header('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https')
      const serverUrl = `${proto}://${host}`
      
      htmlContent = htmlContent.replace(/YOUR_APP_KEY/g, currentAppKey || 'YOUR_APP_KEY')
      htmlContent = htmlContent.replace(/http:\/\/your-server:8990/g, serverUrl)
      htmlContent = htmlContent.replace(/https:\/\/your-server:8990/g, serverUrl)
      htmlContent = htmlContent.replace(/your-server:8990/g, host)
      
      return c.html(htmlContent)
    } else {
      return c.json({ 
        success: false,
        message: 'Management interface not found. Please ensure public/index.html exists.'
      }, 404)
    }
  } catch (error) {
    return c.json({ 
      success: false,
      message: 'Error loading management interface',
      error: String(error)
    }, 500)
  }
})

// List all sessions
app.get('/sessions', validateBasicAuth, (c) => {
  const sessionList = Array.from(sessions.entries()).map(([name, data]) => ({
    name,
    isConnected: data.isConnected,
    phoneNumber: data.phoneNumber || 'Not connected yet',
    createdAt: data.createdAt,
    lastActivity: data.lastActivity
  }))
  
  return c.json({
    success: true,
    count: sessionList.length,
    sessions: sessionList
  })
})

// Create new session
app.post('/sessions/:name', validateBasicAuth, async (c) => {
  const sessionName = c.req.param('name')
  
  // Validate session name
  if (!isValidSessionName(sessionName)) {
    return c.json({
      success: false,
      message: 'Invalid session name. Only lowercase letters and numbers are allowed.'
    }, 400)
  }
  
  // Check if session already exists
  if (sessions.has(sessionName)) {
    return c.json({
      success: false,
      message: 'Session already exists'
    }, 409)
  }
  
  // Check maximum sessions limit
  if (sessions.size >= MAX_SESSIONS) {
    return c.json({
      success: false,
      message: `Maximum sessions limit (${MAX_SESSIONS}) reached. Please delete unused sessions first.`,
      current_sessions: sessions.size,
      max_sessions: MAX_SESSIONS
    }, 429)
  }
  
  try {
    const authFolder = join(AUTH_BASE_DIR, sessionName)
    
    // Create session data
    const sessionData: SessionData = {
      sock: null,
      qrCode: '',
      isConnected: false,
      isReconnecting: false,
      authFolder,
      createdAt: new Date(),
      lastActivity: new Date()
    }
    
    sessions.set(sessionName, sessionData)
    
    // Create auth folder
    if (!existsSync(authFolder)) {
      mkdirSync(authFolder, { recursive: true })
    }
    
    // Connect to WhatsApp
    await connectSession(sessionName)
    
    saveSessionsRegistry()
    
    return c.json({
      success: true,
      message: 'Session created successfully',
      session: {
        name: sessionName,
        qr_url: `/${sessionName}/qr`
      }
    })
  } catch (error) {
    console.error(`Error creating session ${sessionName}:`, error)
    sessions.delete(sessionName)
    
    return c.json({
      success: false,
      message: 'Failed to create session',
      error: String(error)
    }, 500)
  }
})

// Get QR code for specific session
app.get('/:session_name/qr', async (c) => {
  const sessionName = c.req.param('session_name')
  const sessionData = sessions.get(sessionName)
  
  if (!sessionData) {
    return c.html(`
      <html>
        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif;">
          <h2 style="color: red;">❌ Session Not Found</h2>
          <p>Session "${sessionName}" does not exist.</p>
          <a href="/sessions" style="padding: 10px 20px; background: #25D366; color: white; text-decoration: none; border-radius: 5px;">View All Sessions</a>
        </body>
      </html>
    `)
  }
  
  try {
    if (sessionData.isConnected) {
      return c.html(`
        <html>
          <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif;">
            <h2 style="color: green;">✓ WhatsApp Connected</h2>
            <p>Session <strong>${sessionName}</strong> is already connected.</p>
            <p>Phone: <strong>${sessionData.phoneNumber || 'Unknown'}</strong></p>
          </body>
        </html>
      `)
    }

    if (!sessionData.sock) {
      await connectSession(sessionName)
      
      let attempts = 0
      while (!sessionData.qrCode && attempts < 20) {
        await new Promise(resolve => setTimeout(resolve, 500))
        attempts++
      }
    }

    if (!sessionData.qrCode) {
      return c.html(`
        <html>
          <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif;">
            <h2 style="color: orange;">⏳ QR Code Not Ready</h2>
            <p>Please wait a moment and refresh this page.</p>
            <button onclick="location.reload()" style="padding: 10px 20px; cursor: pointer; background: #25D366; color: white; border: none; border-radius: 5px; font-size: 16px;">Refresh</button>
          </body>
        </html>
      `)
    }

    const qrImage = await QRCode.toDataURL(sessionData.qrCode)
    
    return c.html(`
      <html>
        <head>
          <meta http-equiv="refresh" content="5">
        </head>
        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
          <div style="background: white; padding: 30px; border-radius: 20px; box-shadow: 0 10px 40px rgba(0,0,0,0.2); text-align: center;">
            <h1 style="margin-top: 0; color: #333;">📱 Scan QR Code</h1>
            <p style="color: #666;">Session: <strong>${sessionName}</strong></p>
            <p style="color: #666; margin-bottom: 20px;">Open WhatsApp on your phone and scan this QR code</p>
            <img src="${qrImage}" alt="QR Code" style="width: 300px; height: 300px; border: 3px solid #25D366; border-radius: 10px;" />
            <p style="color: #999; margin-top: 20px; font-size: 14px;">Page auto-refreshes every 5 seconds</p>
          </div>
        </body>
      </html>
    `)
  } catch (error) {
    console.error(`Error generating QR for ${sessionName}:`, error)
    return c.html(`
      <html>
        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: Arial, sans-serif;">
          <h2 style="color: red;">❌ Error</h2>
          <p>Failed to generate QR code: ${String(error)}</p>
          <button onclick="location.reload()" style="padding: 10px 20px; cursor: pointer; background: #25D366; color: white; border: none; border-radius: 5px; font-size: 16px;">Try Again</button>
        </body>
      </html>
    `)
  }
})

// Send message via specific session
app.post('/:session_name/send', validateAppKey, async (c) => {
  const sessionName = c.req.param('session_name')
  const sessionData = sessions.get(sessionName)
  
  if (!sessionData) {
    return c.json({
      success: false,
      message: `Session "${sessionName}" not found`
    }, 404)
  }
  
  try {
    const { number, message } = await c.req.json()

    if (!number || !message) {
      return c.json({ 
        success: false, 
        message: 'Parameters "number" and "message" are required' 
      }, 400)
    }

    console.log(`[${sessionName}] Ensuring connection before sending message...`)
    
    const connectionReady = await ensureSessionConnection(sessionName)
    
    if (!connectionReady) {
      return c.json({ 
        success: false, 
        message: `Session "${sessionName}" is not connected. Please scan QR code first at /${sessionName}/qr or wait for reconnection.` 
      }, 400)
    }

    // Clear reconnect timeout
    if (sessionData.reconnectTimeout) {
      clearTimeout(sessionData.reconnectTimeout)
    }
    
    // Format phone number
    let formattedNumber = number.replace(/\D/g, '')
    
    if (!formattedNumber.startsWith('62')) {
      if (formattedNumber.startsWith('0')) {
        formattedNumber = '62' + formattedNumber.substring(1)
      } else {
        formattedNumber = '62' + formattedNumber
      }
    }

    const jid = `${formattedNumber}@s.whatsapp.net`

    console.log(`[${sessionName}] Sending message to ${formattedNumber} with typing simulation...`)
    await sendMessageWithTyping(sessionData.sock, jid, message, sessionName)
    
    sessionData.lastActivity = new Date()
    saveSessionsRegistry()

    console.log(`[${sessionName}] Message sent successfully`)
    return c.json({
      success: true,
      message: 'Message sent successfully',
      session: sessionName,
      to: formattedNumber
    })
  } catch (error) {
    console.error(`Error sending message via ${sessionName}:`, error)
    return c.json({ 
      success: false, 
      message: 'Failed to send message',
      error: String(error)
    }, 500)
  }
})

// Delete session
app.delete('/:session_name', validateBasicAuth, async (c) => {
  const sessionName = c.req.param('session_name')
  const sessionData = sessions.get(sessionName)
  
  if (!sessionData) {
    return c.json({
      success: false,
      message: 'Session not found'
    }, 404)
  }
  
  try {
    // Close socket connection
    if (sessionData.sock) {
      await sessionData.sock.logout()
    }
    
    // Delete auth folder
    if (existsSync(sessionData.authFolder)) {
      rmSync(sessionData.authFolder, { recursive: true, force: true })
    }
    
    // Remove from registry
    sessions.delete(sessionName)
    saveSessionsRegistry()
    
    return c.json({
      success: true,
      message: `Session "${sessionName}" deleted successfully`
    })
  } catch (error) {
    console.error(`Error deleting session ${sessionName}:`, error)
    return c.json({
      success: false,
      message: 'Failed to delete session',
      error: String(error)
    }, 500)
  }
})

// Get app key endpoint
app.get('/appkey', validateBasicAuth, async (c) => {
  try {
    const appKey = process.env.APP_KEY || ''
    let notes = ''
    if(!appKey) {
      notes = 'App key not set in .env'
    } else {
      notes = 'Your current app key:'
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
      message: 'Failed to get app key',
      error: String(error)
    }, 500)
  }
})

// Generate app key endpoint
app.get('/generate-appkey', async (c) => {
  try {
    const appKey = generateAppKey()

    return c.json({
      success: true,
      message: "App key generated successfully. Save it to .env file.",
      app_key: appKey,
    })
  } catch (error) {
    console.error('Error generating app key:', error)
    return c.json({ 
      success: false, 
      message: 'Failed to generate app key',
      error: String(error)
    }, 500)
  }
})

// Health check endpoint
app.get('/health', (c) => {
  const memory = getProcessMemory()
  const sessionStats = {
    total: sessions.size,
    connected: Array.from(sessions.values()).filter(s => s.isConnected).length,
    disconnected: Array.from(sessions.values()).filter(s => !s.isConnected).length,
    reconnecting: Array.from(sessions.values()).filter(s => s.isReconnecting).length,
    max_sessions: MAX_SESSIONS,
    available_slots: MAX_SESSIONS - sessions.size
  }
  
  return c.json({
    success: true,
    status: 'running',
    uptime: process.uptime(),
    memory: {
      rss_mb: memory.rss,
      heap_used_mb: memory.heapUsed,
      heap_total_mb: memory.heapTotal,
      external_mb: memory.external
    },
    sessions: sessionStats
  })
})

export default {
  port: parseInt(process.env.PORT || '3001'),
  fetch: app.fetch
}