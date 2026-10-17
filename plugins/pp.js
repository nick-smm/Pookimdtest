const config = require('../config');
const { cmd } = require('../command');

// Try both common Baileys package names
let baileys;
try { baileys = require('@whiskeysockets/baileys'); }
catch { baileys = require('baileys'); }
const { downloadContentFromMessage, jidNormalizedUser } = baileys;
const S_WHATSAPP_NET = baileys.S_WHATSAPP_NET || '@s.whatsapp.net';

// Jimp is optional. Only used as a fallback if the original upload is rejected.
let Jimp = null;
let isV1 = false;
try {
    const j = require('jimp');
    isV1 = !!j.Jimp;
    Jimp = j.Jimp || j;
} catch {}

// Get the image from the replied message or from the message itself
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

// Upload the image exactly as it is: no crop, no resize, no padding.
// FIX: the iq must be sent "to" s.whatsapp.net with "target" = own jid.
// (Before it was "to: jid", so WhatsApp ignored it and the DP never changed.)
async function uploadOriginal(conn, buffer) {
    const jid = jidNormalizedUser(conn.user.id);
    const res = await conn.query({
        tag: 'iq',
        attrs: {
            target: jid,
            to: S_WHATSAPP_NET,
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
    console.log("PP upload response:", JSON.stringify(res)?.slice(0, 500));
    return res;
}

// Fallback only: shrink very large photos but keep the same aspect ratio
async function downscaleKeepRatio(buffer, max = 1280) {
    if (!Jimp) throw new Error("Upload rejected and 'jimp' is not installed for the fallback.");
    const img = await Jimp.read(buffer);
    const w = img.bitmap.width;
    const h = img.bitmap.height;
    if (Math.max(w, h) > max) {
        if (isV1) {
            w >= h ? img.resize({ w: max }) : img.resize({ h: max });
        } else {
            w >= h ? img.resize(max, Jimp.AUTO) : img.resize(Jimp.AUTO, max);
        }
    }
    return isV1
        ? await img.getBuffer('image/jpeg', { quality: 95 })
        : await img.getBufferAsync(Jimp.MIME_JPEG);
}

cmd({
    pattern: "pp",
    alias: ["setpp", "setdp", "fullpp"],
    desc: "Set the bot's profile picture exactly as sent (Owner only).",
    category: "owner",
    react: "🖼️",
    filename: __filename
},
async (conn, mek, m, { from, reply, isOwner }) => {
    try {
        if (!isOwner) return reply("❌ This command can only be used by the owner.");

        const imageMessage = getImageMessage(mek);
        if (!imageMessage) {
            return reply("📸 Reply to a photo with *.fullpp*, or send a photo with *.fullpp* as the caption.");
        }

        const original = await downloadImage(imageMessage);

        try {
            // 1) Upload the original image untouched
            await uploadOriginal(conn, original);
        } catch (e) {
            // 2) Fallback: same aspect ratio, only smaller in size
            console.error("Original upload failed, trying fallback:", e.message);
            const smaller = await downscaleKeepRatio(original);
            await uploadOriginal(conn, smaller);
        }

        // Verify: fetch the DP that WhatsApp really has now
        await new Promise(r => setTimeout(r, 3000));
        const myJid = jidNormalizedUser(conn.user.id);
        let url = null;
        try { url = await conn.profilePictureUrl(myJid, 'image'); } catch (e) {
            console.error("Could not read back DP:", e.message);
        }
        if (url) {
            await conn.sendMessage(from, {
                image: { url },
                caption: `Upload sent: ${original.length} bytes.\nThis is the DP WhatsApp has now (check if it changed).`
            }, { quoted: mek });
        } else {
            await conn.sendMessage(from, {
                text: "⚠️ Upload went through but I could not read the DP back. Check console log."
            }, { quoted: mek });
        }

    } catch (e) {
        console.error("PP Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});
