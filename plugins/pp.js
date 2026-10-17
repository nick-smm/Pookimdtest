const config = require('../config');
const { cmd } = require('../command');

// Baileys package name project anusarichu maarum, randum try cheyyum
let baileys;
try { baileys = require('@whiskeysockets/baileys'); }
catch { baileys = require('baileys'); }
const { downloadContentFromMessage, jidNormalizedUser } = baileys;

// Jimp optional aanu (illengil original photo thanne upload cheyyum)
let JimpLib = null;
try {
    const j = require('jimp');
    JimpLib = j.Jimp || j;
} catch {}

// Replied / sent image-nte raw message edukkum
function getImageMessage(mek) {
    const msg = mek.message || {};
    if (msg.imageMessage) return msg.imageMessage;

    const ctx =
        msg.extendedTextMessage?.contextInfo ||
        msg.imageMessage?.contextInfo ||
        null;
    const quoted = ctx?.quotedMessage;
    if (!quoted) return null;

    return (
        quoted.imageMessage ||
        quoted.viewOnceMessage?.message?.imageMessage ||
        quoted.viewOnceMessageV2?.message?.imageMessage ||
        null
    );
}

async function downloadImage(imageMessage) {
    const stream = await downloadContentFromMessage(imageMessage, 'image');
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
        buffer = Buffer.concat([buffer, chunk]);
    }
    return buffer;
}

// Crop illathe, full photo (aspect ratio maattathe) - max 1080px side
async function prepareFullImage(buffer) {
    if (!JimpLib) return buffer;
    try {
        const img = await JimpLib.read(buffer);
        const w = img.bitmap.width;
        const h = img.bitmap.height;
        const max = 1080;
        if (Math.max(w, h) > max) {
            if (w >= h) img.resize({ w: max });      // jimp v1
            else img.resize({ h: max });
        }
        return await img.getBuffer('image/jpeg');    // jimp v1
    } catch (e1) {
        try {
            const img = await JimpLib.read(buffer);  // jimp v0.x
            const w = img.bitmap.width;
            const h = img.bitmap.height;
            const max = 1080;
            if (Math.max(w, h) > max) {
                if (w >= h) img.resize(max, JimpLib.AUTO);
                else img.resize(JimpLib.AUTO, max);
            }
            return await img.getBufferAsync('image/jpeg');
        } catch (e2) {
            console.error("Jimp resize failed, using original:", e2.message);
            return buffer;
        }
    }
}

// Baileys-nte updateProfilePicture 640x640-il crop cheyyum,
// athu ozhivaakkan direct query ayakkunnu
async function setFullProfilePicture(conn, buffer) {
    const jid = jidNormalizedUser(conn.user.id);
    await conn.query({
        tag: 'iq',
        attrs: {
            to: jid,
            type: 'set',
            xmlns: 'w:profile:picture'
        },
        content: [
            {
                tag: 'picture',
                attrs: { type: 'image' },
                content: buffer
            }
        ]
    });
}

cmd({
    pattern: "pp",
    alias: ["setpp", "setdp", "fullpp"],
    desc: "Set bot's profile picture in full size (Owner only).",
    category: "owner",
    react: "🖼️",
    filename: __filename
},
async (conn, mek, m, { from, reply, isOwner }) => {
    try {
        // Owner mathram
        if (!isOwner) return reply("❌ Ee command owner-inu mathram use cheyyam.");

        const imageMessage = getImageMessage(mek);
        if (!imageMessage) {
            return reply("📸 Oru photo-ye reply cheythu *.pp* ennu ayakkuka (allenkil photo-yude caption-il *.pp* iduka).");
        }

        const original = await downloadImage(imageMessage);
        const finalImage = await prepareFullImage(original);

        await setFullProfilePicture(conn, finalImage);

        await conn.sendMessage(from, {
            text: "✅ Profile picture full size-il update cheythu."
        }, { quoted: mek });

    } catch (e) {
        console.error("PP Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});
