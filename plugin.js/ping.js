const config = require('../config');
const { cmd } = require('../command');

// Ee list-il ninte photo links itt kodukkuka (direct image links - .jpg/.png).
// Ping adikkumbol ithil ninnu randomly oru photo edukkum.
const PING_IMAGES = [
    "https://xenocdn.xenocdn.workers.dev/ed7fc3db.jpeg",
    "https://xenocdn.xenocdn.workers.dev/06c26174.jpeg",
    "https://xenocdn.xenocdn.workers.dev/dfb328c2.jpeg",
    "https://xenocdn.xenocdn.workers.dev/d3ba8e19.jpeg"
];

// Card click cheyyumbol open aakunna link
const LINK_URL = "https://instagram.com/whoiss.nick?exln=MjdiZjcydjU2a2Ni";

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
        const startTime = Date.now();
        const message = await conn.sendMessage(from, { text: 'Ping...' });
        const endTime = Date.now();
        const ping = endTime - startTime;

        // Ping adikkumbol automatic aayi photo maarum
        const randomImage = PING_IMAGES[Math.floor(Math.random() * PING_IMAGES.length)];

        const pingText =
`↩ ʙᴏᴛ sᴘᴇᴇᴅ ☁️ : ${ping} ᴍs

⚡𝑳𝜺𝝂𝜾⃮⃯⃔𝜶𝜼𝝄♪`;

        try {
            // "Ping..." message delete cheythittu card message ayakkunnu
            await conn.sendMessage(from, { delete: message.key }).catch(() => {});

            await conn.sendMessage(from, {
                text: pingText,
                contextInfo: {
                    externalAdReply: {
                        title: "➥ Ping ⚡",
                        body: "View details",
                        thumbnailUrl: randomImage,
                        sourceUrl: LINK_URL,
                        mediaType: 1,
                        renderLargerThumbnail: false,
                        showAdAttribution: false
                    }
                }
            }, { quoted: mek });
        } catch {
            await reply(pingText);
        }

    } catch (e) {
        console.error("Ping Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});
