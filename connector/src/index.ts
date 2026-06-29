import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  isJidGroup,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import express, { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import pino from 'pino';
import path from 'path';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const qrcode = require('qrcode-terminal') as { generate: (qr: string, opts: { small: boolean }) => void };

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty' }
    : undefined,
});

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
const CONNECTOR_SECRET = process.env.CONNECTOR_SECRET;
const PORT = parseInt(process.env.CONNECTOR_PORT || '3002', 10);
const AUTH_DIR = path.join(process.cwd(), 'auth');

if (!N8N_WEBHOOK_URL || !CONNECTOR_SECRET) {
  logger.error('N8N_WEBHOOK_URL and CONNECTOR_SECRET must be set');
  process.exit(1);
}

let sock: ReturnType<typeof makeWASocket> | null = null;
let isConnected = false;
let reconnectAttempts = 0;

async function connectToWhatsApp(): Promise<void> {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  let version: [number, number, number];
  try {
    const result = await fetchLatestBaileysVersion();
    version = result.version;
    logger.info({ version }, 'Using Baileys version');
  } catch {
    version = [2, 3000, 1023561582];
    logger.warn('Could not fetch latest version, using fallback');
  }

  sock = makeWASocket({
    version,
    auth: state,
    logger: logger.child({ module: 'baileys' }) as any,
    markOnlineOnConnect: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('Scan the QR code below to link your WhatsApp number:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      isConnected = false;
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      logger.warn({ statusCode, attempt: reconnectAttempts }, 'Connection closed');

      if (shouldReconnect) {
        reconnectAttempts++;
        const delay = Math.min(5000 * reconnectAttempts, 60000);
        logger.info({ delayMs: delay }, 'Reconnecting...');
        setTimeout(connectToWhatsApp, delay);
      } else {
        logger.error('Logged out — delete the auth volume and restart to re-pair');
      }
    } else if (connection === 'open') {
      isConnected = true;
      reconnectAttempts = 0;
      logger.info({ user: sock?.user?.id }, 'WhatsApp connected');
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const jid = msg.key.remoteJid;
      if (!jid || !isJidGroup(jid)) continue;
      if (msg.key.fromMe) continue;

      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';

      if (!body.trim()) continue;

      const timestamp = msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString();

      const payload = {
        event: 'message.upsert',
        group_jid: jid,
        wa_message_id: msg.key.id || '',
        sender_jid: msg.key.participant || jid,
        sender_name: msg.pushName || '',
        body,
        timestamp,
      };

      try {
        await axios.post(N8N_WEBHOOK_URL!, payload, {
          headers: { 'x-connector-secret': CONNECTOR_SECRET },
          timeout: 15000,
        });
        logger.debug({ id: msg.key.id, group: jid }, 'Forwarded to n8n');
      } catch (err: any) {
        logger.error(
          { err: err.message, id: msg.key.id },
          'Failed to forward message to n8n',
        );
      }
    }
  });
}

// ─── HTTP server ────────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

function requireSecret(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-connector-secret'] !== CONNECTOR_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

app.post('/send', requireSecret, async (req: Request, res: Response): Promise<void> => {
  const { to, text } = req.body as { to?: string; text?: string };
  if (!to || !text) {
    res.status(400).json({ error: 'Missing to or text' });
    return;
  }
  if (!sock || !isConnected) {
    res.status(503).json({ error: 'WhatsApp not connected' });
    return;
  }
  try {
    // Small random delay — behave like a human
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 1500));
    await sock.sendMessage(to, { text });
    logger.info({ to }, 'Sent message');
    res.json({ ok: true });
  } catch (err: any) {
    logger.error({ err: err.message, to }, 'Failed to send message');
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Returns all WhatsApp groups the bot account is currently a member of
app.get('/groups', requireSecret, async (_req: Request, res: Response): Promise<void> => {
  if (!sock || !isConnected) {
    res.status(503).json({ error: 'WhatsApp not connected' });
    return;
  }
  try {
    const groups = await sock.groupFetchAllParticipating();
    const list = Object.values(groups).map((g) => ({
      jid: g.id,
      name: g.subject,
      participants: g.participants?.length ?? 0,
    }));
    list.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ count: list.length, groups: list });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to fetch groups');
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

app.get('/health', (_req: Request, res: Response): void => {
  res.json({
    ok: true,
    connected: isConnected,
    user: sock?.user?.id ?? null,
    timestamp: new Date().toISOString(),
  });
});

app.listen(PORT, () => {
  logger.info({ port: PORT }, 'Connector HTTP server listening');
});

connectToWhatsApp().catch((err) => {
  logger.error({ err: err.message }, 'Fatal: WhatsApp connection failed');
  process.exit(1);
});
