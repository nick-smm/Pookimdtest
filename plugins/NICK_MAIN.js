const config = require('../config');
const { cmd } = require('../command');

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

        const pingText = `*ɴɪᴄᴋ-ᴍᴅ sᴘᴇᴇᴅ :* \`${ping}ms\``;

        try {
            await conn.sendMessage(from, { text: pingText, edit: message.key });
        } catch {
            await reply(pingText);
        }

    } catch (e) {
        console.error("Ping Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});
