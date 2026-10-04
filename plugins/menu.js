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
        let prefix = config.PREFIX || "."
        let botName = config.BOT_NAME || "NICK MD"
        let userName = pushname || "User"

        let menu = `╭━━━〔 🪀 ${botName.toUpperCase()} MENU 〕━━━⬣\n`
        menu += `┃ 👋 Hello ${userName}\n`
        menu += `┃ ⚡ Prefix : ${prefix}\n`
        menu += `┃ 📦 Commands : ${commands.length}\n`
        menu += `╰━━━━━━━━━━━━━━⬣\n\n`

        let categories = {}

        commands.forEach(command => {
            // Category ഇല്ലെങ്കിൽ 'MAIN' എന്ന് ഓട്ടോമാറ്റിക് എടുക്കും
            let cat = command.category ? command.category.toString().toUpperCase() : "MAIN"

            if (!categories[cat]) categories[cat] = []
            if (command.pattern) {
                categories[cat].push(command.pattern)
            }
        })

        for (let cat in categories) {
            menu += `╭───〔 ${cat} 〕───⬣\n`

            categories[cat].forEach(command => {
                menu += `┃ ➤ ${prefix}${command}\n`
            })

            menu += `╰────────────⬣\n\n`
        }

        // വീഡിയോ ലിങ്ക് ഉണ്ടെങ്കിൽ വീഡിയോ അയക്കും, ഇല്ലെങ്കിൽ വെറും ടെക്സ്റ്റ് അയക്കും
        if (config.MENU_VIDEO) {
            await conn.sendMessage(
                from,
                {
                    video: { url: config.MENU_VIDEO.toString() },
                    caption: menu,
                    gifPlayback: false
                },
                { quoted: mek }
            )
        } else {
            await conn.sendMessage(
                from,
                { text: menu },
                { quoted: mek }
            )
        }

    } catch (e) {
        console.log(e)
        reply(`❌ Error: ${e.message || e}`)
    }
})
