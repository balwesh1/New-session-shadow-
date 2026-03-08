import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';

const router = express.Router();

function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
        return true;
    } catch (e) {
        console.error('Error removing file:', e);
        return false;
    }
}

router.get('/', async (req, res) => {
    const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const dirs = `./qr_sessions/session_${sessionId}`;

    if (!fs.existsSync('./qr_sessions')) fs.mkdirSync('./qr_sessions', { recursive: true });
    if (!fs.existsSync(dirs)) fs.mkdirSync(dirs, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(dirs);

    try {
        const { version } = await fetchLatestBaileysVersion();
        let qrGenerated = false;
        let responseSent = false;

        const handleQRCode = async (qr) => {
            if (qrGenerated || responseSent) return;
            qrGenerated = true;

            const qrDataURL = await QRCode.toDataURL(qr, {
                errorCorrectionLevel: 'M',
                type: 'image/png',
                quality: 0.92,
                margin: 1,
                color: { dark: '#000000', light: '#FFFFFF' }
            });

            if (!responseSent) {
                responseSent = true;
                res.send({
                    qr: qrDataURL,
                    message: 'QR Code Generated! Scan with WhatsApp app.',
                    instructions: [
                        '1. Open WhatsApp on your phone',
                        '2. Go to Settings > Linked Devices',
                        '3. Tap "Link a Device"',
                        '4. Scan the QR code above'
                    ]
                });
            }
        };

        const sock = makeWASocket({
            version,
            logger: pino({ level: 'silent' }),
            browser: Browsers.windows('Chrome'),
            auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'fatal' })) },
            markOnlineOnConnect: false,
            generateHighQualityLinkPreview: false
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            console.log(`🔄 Connection update: ${connection || 'undefined'}`);

            if (qr && !qrGenerated) await handleQRCode(qr);

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                if (statusCode === 401) {
                    console.log('🔐 Logged out - need new QR code');
                    removeFile(dirs);
                }
            }
        });

        sock.ev.on('creds.update', saveCreds);

        setTimeout(() => {
            if (!responseSent) {
                responseSent = true;
                res.status(408).send({ code: 'QR generation timeout' });
                removeFile(dirs);
            }
        }, 30000);

    } catch (err) {
        console.error('Error initializing session:', err);
        if (!res.headersSent) res.status(503).send({ code: 'Service Unavailable' });
        removeFile(dirs);
    }
});

process.on('uncaughtException', (err) => {
    const ignore = [
        'conflict', 'not-authorized', 'Socket connection timeout', 'rate-overlimit',
        'Connection Closed', 'Timed Out', 'Value not found', 'Stream Errored',
        'statusCode: 515', 'statusCode: 503'
    ];
    if (ignore.some(term => String(err).includes(term))) return;
    console.log('Caught exception: ', err);
});

export default router;