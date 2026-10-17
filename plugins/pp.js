const config = require('../config');
const { cmd } = require('../command');

// Try both common Baileys package names
let baileys;
try { baileys = require('@whiskeysockets/baileys'); }
catch { baileys = require('baileys'); }
const { downloadContentFromMessage, jidNormalizedUser } = baileys;
const S_WHATSAPP_NET = baileys.S_WHATSAPP_NET || '@s.whatsapp.net';

// Jimp: used for the fallback and for the .sqpp test command
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

// TEST ONLY (.sqpp): whole photo inside a square, blurred background.
async function makeFullSquare(buffer, size = 720) {
    if (!Jimp) throw new Error("'jimp' is not installed. Run: npm i jimp");
    const fg = await Jimp.read(buffer);
    const bg = await Jimp.read(buffer);
    const w = fg.bitmap.width;
    const h = fg.bitmap.height;
    const scale = size / Math.max(w, h);
    const nw = Math.max(1, Math.round(w * scale));
    const nh = Math.max(1, Math.round(h * scale));
    const x = Math.round((size - nw) / 2);
    const y = Math.round((size - nh) / 2);
    if (isV1) {
        bg.cover({ w: size, h: size });
        bg.blur(25);
        fg.resize({ w: nw, h: nh });
        bg.composite(fg, x, y);
        return await bg.getBuffer('image/jpeg', { quality: 95 });
    }
    bg.cover(size, size);
    bg.blur(25);
    fg.resize(nw, nh);
    bg.composite(fg, x, y);
    bg.quality(95);
    return await bg.getBufferAsync(Jimp.MIME_JPEG);
}

function summarize(res) {
    try {
        if (!res) return 'no response';
        const attrs = res.attrs ? JSON.stringify(res.attrs) : '';
        return `${res.tag || 'node'} ${attrs}`.slice(0, 300);
    } catch { return 'unreadable'; }
}

async function handle(conn, mek, { from, reply, isOwner }, square) {
    try {
        if (!isOwner) return reply("❌ This command can only be used by the owner.");

        const imageMessage = getImageMessage(mek);
        if (!imageMessage) {
            return reply("📸 Reply to a photo with *.fullpp*, or send a photo with *.fullpp* as the caption.");
        }

        let toUpload = await downloadImage(imageMessage);
        const origBytes = toUpload.length;
        if (square) toUpload = await makeFullSquare(toUpload, 720);

        let upRes;
        let note = '';
        try {
            upRes = await uploadOriginal(conn, toUpload);
        } catch (e) {
            console.error("Upload failed, trying fallback:", e.message);
            note = `First upload error: ${e.message || e}\n`;
            const smaller = await downscaleKeepRatio(toUpload);
            upRes = await uploadOriginal(conn, smaller);
        }

        // Verify: fetch the DP that WhatsApp really has now
        await new Promise(r => setTimeout(r, 3000));
        const myJid = jidNormalizedUser(conn.user.id);
        let url = null;
        let readErr = '';
        for (const type of ['image', 'preview']) {
            try {
                url = await conn.profilePictureUrl(myJid, type);
                if (url) break;
            } catch (e) {
                readErr += `${type}: ${e.message || e}\n`;
                console.error("Could not read back DP:", type, e.message);
            }
        }

        const report =
            `Mode: ${square ? 'square (test)' : 'original'}\n` +
            `Photo: ${origBytes} bytes\n` +
            `Sent: ${toUpload.length} bytes\n` +
            note +
            `Server reply: ${summarize(upRes)}`;

        if (url) {
            await conn.sendMessage(from, {
                image: { url },
                caption: `${report}\n\nThis is the DP WhatsApp has now.`
            }, { quoted: mek });
        } else {
            await conn.sendMessage(from, {
                text: `⚠️ Could not read the DP back.\n${report}\nRead error:\n${readErr || 'none'}`
            }, { quoted: mek });
        }

    } catch (e) {
        console.error("PP Error:", e);
        reply(`Error: ${e.message || e}`);
    }
}

cmd({
    pattern: "pp",
    alias: ["setpp", "setdp", "fullpp"],
    desc: "Set the bot's profile picture exactly as sent (Owner only).",
    category: "owner",
    react: "🖼️",
    filename: __filename
},
async (conn, mek, m, ctx) => handle(conn, mek, ctx, false));

cmd({
    pattern: "sqpp",
    desc: "TEST: set DP with the whole photo inside a square (Owner only).",
    category: "owner",
    react: "🖼️",
    filename: __filename
},
async (conn, mek, m, ctx) => handle(conn, mek, ctx, true));
