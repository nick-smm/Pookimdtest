const { cmd } = require('../command');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

cmd({
    pattern: 'fd',
    alias: [],
    desc: 'Send replied audio to a JID or channel',
    category: 'downloader',
    react: '🎙️',
    filename: __filename
}, async (conn, mek, m, { from, q, args, reply }) => {
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

        await reply('⏳ Downloading & sending audio...');

        const audioBuffer = await downloadMediaMessage(
            quotedFull,
            'buffer',
            {},
            { logger: console, reuploadRequest: conn.updateMediaMessage }
        );
        if (!audioBuffer || !audioBuffer.length) throw new Error('Audio download failed');

        const isNewsletter = targetJid.endsWith('@newsletter');

        // Newsletter/Channel-il PTT work aavilla, normal audio aayi send cheyyanam
        await conn.sendMessage(targetJid, {
            audio: audioBuffer,
            mimetype: quotedMsg.audioMessage?.mimetype || 'audio/mp4',
            ptt: !isNewsletter
        });

        await reply('✅ Audio successfully sent!');
    } catch (e) {
        console.log(e);
        reply(`❌ Failed: ${String(e.message || e).slice(0, 180)}`);
    }
});
