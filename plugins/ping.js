const config = require('../config');
const { cmd } = require('../command');
const axios = require('axios');

// Ping adikkumbol ithil ninnu randomly oru photo edukkum.
const PING_IMAGES = [
    "https://xenocdn.xenocdn.workers.dev/ed7fc3db.jpeg",
    "https://xenocdn.xenocdn.workers.dev/06c26174.jpeg",
    "https://xenocdn.xenocdn.workers.dev/dfb328c2.jpeg",
    "https://xenocdn.xenocdn.workers.dev/d3ba8e19.jpeg"
];

// Card click cheyyumbol open aakunna link
const LINK_URL = "https://instagram.com/whoiss.nick?exln=MjdiZjcydjU2a2Ni";

// Image download cheythu buffer aakki edukkum (thumbnailUrl maathram kodukkumbol photo varaarilla)
async function getThumbnail() {
    const shuffled = [...PING_IMAGES].sort(() => Math.random() - 0.5);
    for (const url of shuffled) {
        try {
            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            return { buffer: Buffer.from(res.data), url };
        } catch (e) {
            console.error("Ping image failed:", url, e.message);
        }
    }
    return { buffer: null, url: shuffled[0] };
}

cmd({
    pattern: "ping",
    alias: ["speed"],
    desc: "Check bot's response time.",
    category: "main",
    react: "⚡",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    try {
        // Visible message illathe ping alakkunnu
        const startTime = Date.now();
        await conn.sendPresenceUpdate('composing', from).catch(() => {});
        const ping = Date.now() - startTime;

        const { buffer, url } = await getThumbnail();

        const pingText =
`↩ ʙᴏᴛ sᴘᴇᴇᴅ ☁️ : ${ping} ᴍs

⚡𝑳𝜺𝝂𝜾⃮⃯⃔𝜶𝜼𝝄♪`;

        const adReply = {
            title: "➥ Ping ⚡",
            body: "View details",
            thumbnailUrl: url,
            sourceUrl: LINK_URL,
            mediaType: 1,
            renderLargerThumbnail: false,
            showAdAttribution: false
        };
        if (buffer) adReply.thumbnail = buffer;

        await conn.sendMessage(from, {
            text: pingText,
            contextInfo: { externalAdReply: adReply }
        }, { quoted: mek });

    } catch (e) {
        console.error("Ping Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});
