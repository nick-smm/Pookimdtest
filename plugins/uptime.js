const config = require('../config');
const { cmd } = require('../command');

// Seconds -> "1d 2h 3m 4s"
function formatUptime(totalSeconds) {
    totalSeconds = Math.floor(totalSeconds);
    const d = Math.floor(totalSeconds / 86400);
    const h = Math.floor((totalSeconds % 86400) / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    const parts = [];
    if (d) parts.push(`${d}d`);
    if (d || h) parts.push(`${h}h`);
    if (d || h || m) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

cmd({
    pattern: "uptime",
    alias: ["runtime", "up"],
    desc: "Check how long the bot has been running.",
    category: "main",
    react: "⏱️",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    try {
        const uptime = formatUptime(process.uptime());

        const uptimeText =
`↩ ʙᴏᴛ ᴜᴘᴛɪᴍᴇ ⏱️ : ${uptime}

⚡𝑳𝜺𝝂𝜾⃮⃯⃔𝜶𝜼𝝄♪`;

        await conn.sendMessage(from, { text: uptimeText }, { quoted: mek });

    } catch (e) {
        console.error("Uptime Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});
