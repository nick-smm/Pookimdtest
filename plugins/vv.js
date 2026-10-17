const config = require('../config');
const { cmd } = require('../command');

// Baileys package ethaanu use cheyyunnath ennu nokki load cheyyum
let downloadContentFromMessage;
try {
    ({ downloadContentFromMessage } = require('@whiskeysockets/baileys'));
} catch (e1) {
    try {
        ({ downloadContentFromMessage } = require('@adiwajshing/baileys'));
    } catch (e2) {
        ({ downloadContentFromMessage } = require('baileys'));
    }
}

// Once (view once) wrapper maatti ull message edukkum
function unwrapViewOnce(quoted) {
    if (!quoted) return null;
    const inner =
        quoted.viewOnceMessageV2?.message ||
        quoted.viewOnceMessageV2Extension?.message ||
        quoted.viewOnceMessage?.message ||
        quoted;
    return inner;
}

async function toBuffer(stream) {
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

cmd({
    pattern: "vv",
    alias: ["viewonce", "retrive"],
    desc: "View once photo/video/audio normal aakki tharum.",
    category: "main",
    react: "👁️",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    try {
        // Reply cheytha message (quoted) edukkunnu
        const contextInfo =
            mek.message?.extendedTextMessage?.contextInfo ||
            mek.message?.conversation?.contextInfo ||
            null;
        const quotedRaw = contextInfo?.quotedMessage;

        if (!quotedRaw) {
            return reply("⚠️ Once photo/video-nte reply aayi *.vv* adikku.");
        }

        const inner = unwrapViewOnce(quotedRaw);

        const imageMsg = inner.imageMessage;
        const videoMsg = inner.videoMessage;
        const audioMsg = inner.audioMessage;

        let mediaMsg, type;
        if (imageMsg) { mediaMsg = imageMsg; type = 'image'; }
        else if (videoMsg) { mediaMsg = videoMsg; type = 'video'; }
        else if (audioMsg) { mediaMsg = audioMsg; type = 'audio'; }
        else {
            return reply("⚠️ Ithu once photo/video/audio alla.");
        }

        // Media download cheyyunnu
        const stream = await downloadContentFromMessage(mediaMsg, type);
        const buffer = await toBuffer(stream);

        if (!buffer || !buffer.length) {
            return reply("❌ Media download cheyyaan pattiyilla (expire aayirikkaam).");
        }

        // Normal (once alla) message aayi veendum ayakkunnu
        if (type === 'image') {
            await conn.sendMessage(from, {
                image: buffer,
                caption: mediaMsg.caption || ''
            }, { quoted: mek });
        } else if (type === 'video') {
            await conn.sendMessage(from, {
                video: buffer,
                caption: mediaMsg.caption || '',
                mimetype: mediaMsg.mimetype || 'video/mp4'
            }, { quoted: mek });
        } else if (type === 'audio') {
            await conn.sendMessage(from, {
                audio: buffer,
                mimetype: mediaMsg.mimetype || 'audio/mpeg',
                ptt: mediaMsg.ptt || false
            }, { quoted: mek });
        }

    } catch (e) {
        console.error("VV Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});
