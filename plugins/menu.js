const config = require('../config');
const { cmd, commands } = require('../command');

function runtime(seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const dDisplay = d > 0 ? `${d}d ` : '';
    const hDisplay = h > 0 ? `${h}h ` : '';
    const mDisplay = m > 0 ? `${m}m ` : '';
    const sDisplay = s > 0 ? `${s}s` : '';
    return (dDisplay + hDisplay + mDisplay + sDisplay).trim() || '0s';
}

cmd({
    pattern: "menu",
    alias: ["help", "list", "commands"],
    desc: "Show all commands",
    category: "main",
    filename: __filename
},
async (conn, mek, m, { from, pushname, reply }) => {
    try {
        const prefix = config.PREFIX || ".";
        const botName = config.botName || config.BOT_NAME || "NICK MD MINI";
        const userName = pushname || "User";

        let menu = `╭━━━〔 ֍ *${botName.toUpperCase()}* ֍ 〕━━━⬣\n`;
        menu += `┃ ֍ *ᴜsᴇʀ* : ${userName}\n`;
        menu += `┃ ֍ *ᴘʀᴇғɪx* : [ ${prefix} ]\n`;
        menu += `┃ ֍ *ᴜᴘᴛɪᴍᴇ* : ${runtime(process.uptime())}\n`;
        menu += `┃ ֍ *ᴄᴏᴍᴍᴀɴᴅs* : ${commands.length}\n`;
        const currentMode = (global.mode || config.MODE || "Public").toUpperCase() === "PRIVATE" ? "Private" : "Public";
        menu += `┃ ֍ *ᴍᴏᴅᴇ* : ${currentMode}\n`;
        menu += `╰━━━━━━━━━━━━━━━━━━━━━━⬣\n\n`;

        let categories = {};

        commands.forEach(command => {
            if (command.dontAddCommandList) return;
            const cat = command.category ? command.category.toString().toUpperCase() : "MAIN";

            if (!categories[cat]) categories[cat] = [];
            if (command.pattern && !categories[cat].includes(command.pattern)) {
                categories[cat].push(command.pattern);
            }
        });

        for (const cat in categories) {
            menu += `╭───〔 ֍ *${cat}* ֍ 〕───⬣\n`;
            categories[cat].forEach(cmdName => {
                menu += `┃ ֍ ${prefix}${cmdName}\n`;
            });
            menu += `╰─────────────────────⬣\n\n`;
        }

        if (config.footer) {
            menu += `${config.footer}\n`;
        }

        // Send with video if MENU_VIDEO is set, otherwise send text
        if (config.MENU_VIDEO) {
            await conn.sendMessage(
                from,
                {
                    video: { url: config.MENU_VIDEO.toString() },
                    caption: menu.trim(),
                    gifPlayback: false
                },
                { quoted: mek }
            );
        } else {
            await conn.sendMessage(
                from,
                { text: menu.trim() },
                { quoted: mek }
            );
        }

    } catch (e) {
        console.error("Menu Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});
