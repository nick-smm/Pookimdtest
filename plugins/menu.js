const config = require('../config')
const { cmd, commands } = require('../command')

cmd({
    pattern: "menu",
    desc: "Show all commands",
    category: "main",
    react: "📋",
    filename: __filename
},
async (conn, mek, m, { from, pushname, reply }) => {
    try {

        let menu = `╭━━━〔 🪀 NICK MD MENU 〕━━━⬣
┃ 👋 Hello ${pushname}
┃ ⚡ Prefix : ${config.PREFIX}
┃ 📦 Commands : ${commands.length}
╰━━━━━━━━━━━━━━⬣

`

        let categories = {}

        commands.forEach(command => {
            let cat = command.category || "other"

            if (!categories[cat]) categories[cat] = []

            categories[cat].push(command.pattern)
        })

        for (let cat in categories) {
            menu += `╭───〔 ${cat.toUpperCase()} 〕───⬣\n`

            categories[cat].forEach(command => {
                menu += `┃ ➤ .${command}\n`
            })

            menu += `╰────────────⬣\n\n`
        }

        await conn.sendMessage(
            from,
            {
                video: { url: config.MENU_VIDEO },
                caption: menu,
                gifPlayback: false
            },
            { quoted: mek }
        )

    } catch (e) {
        console.log(e)
        reply(`${e}`)
    }
})