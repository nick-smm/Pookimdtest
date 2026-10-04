const { cmd } = require('../command')

cmd({
    pattern: "alive",
    desc: "Check bot status",
    category: "main",
    react: "🤖",
    filename: __filename
},
async (conn, mek, m, {
    from,
    pushname,
    reply
}) => {
    try {

        const aliveMsg = `
╭━━━〔 🤖 BOT ALIVE 〕━━━⬣
┃ 👤 User : ${pushname}
┃ ⚡ Status : Online
┃ 🚀 Bot : Nick MD
┃ 💚 Mode : Working
╰━━━━━━━━━━━━━━⬣
`;

        await conn.sendMessage(
            from,
            {
                image: {
                    url: "https://xenocdn.xenocdn.workers.dev/265d504c.jpeg"
                },
                caption: aliveMsg
            },
            { quoted: mek }
        );

    } catch (e) {
        console.log(e)
        reply(`${e}`)
    }
})