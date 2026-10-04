const config = require('../config')
const { cmd, commands } = require('../command')

cmd({
    pattern: "ping",
    desc: "Check bot's response time.",
    category: "main",
    react: "⚡",
    filename: __filename
},
async (conn, mek, m, { from, quoted, body, isCmd, command, args, q, isGroup, sender, senderNumber, botNumber2, botNumber, pushname, isMe, isOwner, groupMetadata, groupName, participants, groupAdmins, isBotAdmins, isAdmins, reply }) => {
    try {
        const startTime = Date.now()
        
        const message = await conn.sendMessage(from, { text: '```⚡ Checking Latency...
```' })
        
        const endTime = Date.now()
        const ping = endTime - startTime
        
        const premiumPing = `*╭───────────────⚡*
*│ ɴɪᴄᴋ-ᴍᴅ sᴘᴇᴇᴅ ᴛᴇsᴛ*
*├───────────────*
*│ 🚀 sᴘᴇᴇᴅ :* \`${ping}ms\`
*│ sᴛᴀᴛᴜs :* \`Online\`
*╰───────────────🍁*`

        await conn.sendMessage(from, { text: premiumPing, edit: message.key })

    } catch (e) {
        console.log(e)
        reply(`${e}`)
    }
})
