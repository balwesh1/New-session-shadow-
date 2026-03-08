import express from 'express';
import fs from 'fs';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion, delay } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';

const router = express.Router();

// Remove file/directory helper
function removeFile(FilePath) {
    try {
        if (!fs.existsSync(FilePath)) return false;
        fs.rmSync(FilePath, { recursive: true, force: true });
    } catch (e) {
        console.error('Error removing file:', e);
    }
}

router.get('/', async (req, res) => {
    let num = req.query.number;
    const dirs = './' + (num || `session`);

    await removeFile(dirs);

    num = num.replace(/[^0-9]/g, '');
    const phone = pn('+' + num);

    if (!phone.isValid()) {
        if (!res.headersSent) {
            return res.status(400).send({ code: 'Invalid phone number. Use full international format without +.' });
        }
        return;
    }

    num = phone.getNumber('e164').replace('+', '');

    async function initiateSession() {
        const { state, saveCreds } = await useMultiFileAuthState(dirs);

        try {
            const { version } = await fetchLatestBaileysVersion();

            let KnightBot = makeWASocket({
                version,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }),
                browser: Browsers.windows('Chrome'),
                markOnlineOnConnect: false
            });

            KnightBot.ev.on('connection.update', async (update) => {
                const { connection, isNewLogin, isOnline } = update;

                if (connection === 'open') {
                    console.log('✅ Connected successfully!');
                }
                if (isNewLogin) console.log('🔐 New login via pair code');
                if (isOnline) console.log('🟢 Client is online');
            });

            if (!KnightBot.authState.creds.registered) {
                await delay(3000);
                try {
                    let code = await KnightBot.requestPairingCode(num);
                    code = code?.match(/.{1,4}/g)?.join('-') || code;
                    if (!res.headersSent) {
                        console.log({ num, code });
                        res.send({ code });
                    }
                } catch (error) {
                    console.error('Error requesting pairing code:', error);
                    if (!res.headersSent) res.status(503).send({ code: 'Failed to get pairing code' });
                }
            }

            KnightBot.ev.on('creds.update', saveCreds);

        } catch (err) {
            console.error('Error initializing session:', err);
            if (!res.headersSent) res.status(503).send({ code: 'Service Unavailable' });
        }
    }

    await initiateSession();
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