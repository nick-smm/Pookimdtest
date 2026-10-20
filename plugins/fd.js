const { cmd } = require('../command');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const { downloadMediaMessage } = require('baileys');

cmd({
    pattern: 'fd',
    alias: [],
    desc: 'Send replied audio as voice note to a JID/channel',
    category: 'downloader',
    react: '🎙️',
    filename: __filename
}, async (conn, mek, m, { from, q, args, reply }) => {
    let tempDir;
    try {
        const targetJid = String(q || args.join(' ') || '').trim().split(/\s+/)[0];
        if (!targetJid || !/^[0-9]+@(s\.whatsapp\.net|g\.us|newsletter)$/.test(targetJid)) {
            return reply('Usage: reply to an audio and type .fd <jid>');
        }

        const context = mek.message?.extendedTextMessage?.contextInfo;
        const quotedMsg = context?.quotedMessage;
        if (!quotedMsg || !(quotedMsg.audioMessage || quotedMsg.documentMessage?.mimetype?.startsWith('audio/'))) {
            return reply('❌ Oru audio/voice note-inu reply cheythu .fd <jid> kodukkuka.');
        }

        const quotedFull = {
            key: { remoteJid: from, id: context.stanzaId, participant: context.participant },
            message: quotedMsg
        };

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fd-'));
        await reply('🎙️ Converting & sending voice note...');

        const audioBuffer = await downloadMediaMessage(
            quotedFull,
            'buffer',
            {},
            { logger: console, reuploadRequest: conn.updateMediaMessage }
        );
        if (!audioBuffer || !audioBuffer.length) throw new Error('Audio download failed');

        const inputFile = path.join(tempDir, 'input-audio');
        const outputFile = path.join(tempDir, 'output.ogg');
        fs.writeFileSync(inputFile, audioBuffer);

        await execFileAsync('ffmpeg', [
            '-y', '-i', inputFile,
            '-vn', '-map_metadata', '-1',
            '-c:a', 'libopus', '-b:a', '128k',
            '-vbr', 'on', '-compression_level', '10',
            '-ar', '48000', '-ac', '1',
            '-f', 'ogg', outputFile
        ], { timeout: 180000 });

        const buf = fs.readFileSync(outputFile);
        await conn.sendMessage(targetJid, {
            audio: buf,
            mimetype: 'audio/ogg; codecs=opus',
            ptt: true
        });

        await reply('✅ Voice note successfully sent!');
    } catch (e) {
        console.log(e);
        reply(`❌ Failed: ${String(e.message || e).slice(0, 180)}`);
    } finally {
        if (tempDir) { try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {} }
    }
});
