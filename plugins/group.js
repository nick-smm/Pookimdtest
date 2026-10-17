const config = require('../config');
const { cmd } = require('../command');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname, '../db');
const welcomeDbPath = path.join(dbDir, 'welcome.json');


function getWelcomeDb() {
    try {
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        if (!fs.existsSync(welcomeDbPath)) fs.writeFileSync(welcomeDbPath, '{}');
        return JSON.parse(fs.readFileSync(welcomeDbPath, 'utf-8'));
    } catch {
        return {};
    }
}


function saveWelcomeDb(data) {
    try {
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        fs.writeFileSync(welcomeDbPath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Save welcome DB error:", e);
    }
}

function getTargetUser(m, q) {
    if (m.quoted && m.quoted.sender) {
        return m.quoted.sender;
    }
    if (m.mentionUser && m.mentionUser.length > 0) {
        return m.mentionUser[0];
    }
    if (m.msg?.contextInfo?.mentionedJid && m.msg.contextInfo.mentionedJid.length > 0) {
        return m.msg.contextInfo.mentionedJid[0];
    }
    if (q) {
        const cleaned = q.replace(/[^0-9]/g, '');
        if (cleaned.length >= 7) {
            return `${cleaned}@s.whatsapp.net`;
        }
    }
    return null;
}


cmd({
    pattern: "promote",
    alias: ["admin"],
    desc: "Promote a member to admin.",
    category: "group",
    react: "👑",
    filename: __filename
},
async (conn, mek, m, { from, q, isGroup, isBotAdmins, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isBotAdmins) return await reply(" I need to be an Admin to promote members.");
        if (!isAdmins && !isOwner) return await reply(" Only group Admins can use this command.");

        const user = getTargetUser(m, q);
        if (!user) return await reply(" Please tag, reply to, or provide the number of the user to promote.");

        await conn.groupParticipantsUpdate(from, [user], 'promote');
        await conn.sendMessage(from, {
            text: `@${user.split('@')[0]} has been promoted to admin! `,
            mentions: [user]
        }, { quoted: mek });
    } catch (e) {
        console.error("Promote Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});


cmd({
    pattern: "demote",
    alias: ["unadmin"],
    desc: "Demote an admin to member.",
    category: "group",
    react: "🔽",
    filename: __filename
},
async (conn, mek, m, { from, q, isGroup, isBotAdmins, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isBotAdmins) return await reply("I need to be an Admin to demote members.");
        if (!isAdmins && !isOwner) return await reply("Only group Admins can use this command.");

        const user = getTargetUser(m, q);
        if (!user) return await reply(" Please tag, reply to, or provide the number of the user to demote.");

        await conn.groupParticipantsUpdate(from, [user], 'demote');
        await conn.sendMessage(from, {
            text: `@${user.split('@')[0]} has been demoted to member.`,
            mentions: [user]
        }, { quoted: mek });
    } catch (e) {
        console.error("Demote Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// ------------------- REMOVE / KICK -------------------
cmd({
    pattern: "remove",
    alias: ["kick"],
    desc: "Remove a member from the group.",
    category: "group",
    react: "🚫",
    filename: __filename
},
async (conn, mek, m, { from, q, isGroup, isBotAdmins, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isBotAdmins) return await reply("I need to be an Admin to remove members.");
        if (!isAdmins && !isOwner) return await reply(" Only group Admins can use this command.");

        const user = getTargetUser(m, q);
        if (!user) return await reply(" Please tag, reply to, or provide the number of the user to remove.");

        await conn.groupParticipantsUpdate(from, [user], 'remove');
        await conn.sendMessage(from, {
            text: `@${user.split('@')[0]} has been removed from the group.`,
            mentions: [user]
        }, { quoted: mek });
    } catch (e) {
        console.error("Remove Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// ------------------- ADD -------------------
cmd({
    pattern: "add",
    desc: "Add a member to the group.",
    category: "group",
    react: "➕",
    filename: __filename
},
async (conn, mek, m, { from, q, isGroup, isBotAdmins, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isBotAdmins) return await reply(" I need to be an Admin to add members.");
        if (!isAdmins && !isOwner) return await reply(" Only group Admins can use this command.");

        const user = getTargetUser(m, q);
        if (!user) return await reply("Please provide a valid phone number to add (e.g. .add 919876543210).");

        const res = await conn.groupParticipantsUpdate(from, [user], 'add');
        const status = res?.[0]?.status;

        if (status === "403" || status === "408") {
            return await reply("Cannot add user directly due to their privacy settings. Please send an invite link instead.");
        } else if (status === "409") {
            return await reply(" User is already in this group.");
        }

        await conn.sendMessage(from, {
            text: `@${user.split('@')[0]} has been added to the group!`,
            mentions: [user]
        }, { quoted: mek });
    } catch (e) {
        console.error("Add Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// ------------------- MUTE / UNMUTE GROUP -------------------
cmd({
    pattern: "mute",
    alias: ["close"],
    desc: "Mute the group so only admins can send messages.",
    category: "group",
    react: "🔒",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, isBotAdmins, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isBotAdmins) return await reply(" I need to be an Admin to change group settings.");
        if (!isAdmins && !isOwner) return await reply(" Only group Admins can use this command.");

        await conn.groupSettingUpdate(from, 'announcement');
        await reply("🔒 Group has been muted (Only admins can send messages).");
    } catch (e) {
        console.error("Mute Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

cmd({
    pattern: "unmute",
    alias: ["open"],
    desc: "Unmute the group so all members can send messages.",
    category: "group",
    react: "🔓",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, isBotAdmins, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isBotAdmins) return await reply(" I need to be an Admin to change group settings.");
        if (!isAdmins && !isOwner) return await reply(" Only group Admins can use this command.");

        await conn.groupSettingUpdate(from, 'not_announcement');
        await reply(" Group has been unmuted (All members can send messages).");
    } catch (e) {
        console.error("Unmute Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// ------------------- TAG ALL -------------------
cmd({
    pattern: "tagall",
    alias: ["everyone", "all"],
    desc: "Tag all members in the group.",
    category: "group",
    react: "📢",
    filename: __filename
},
async (conn, mek, m, { from, q, isGroup, isAdmins, isOwner, participants, groupName, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isAdmins && !isOwner) return await reply(" Only group Admins can use this command.");
        if (!participants || participants.length === 0) return await reply(" Could not fetch participants.");

        let msg = `Attention Everyone!\n`;
        if (groupName) msg += ` Group: ${groupName}\n`;
        if (q) msg += `Message: ${q}\n`;
        msg += `\n`;

        const mentions = [];
        for (const mem of participants) {
            mentions.push(mem.id);
            msg += `֍ @${mem.id.split('@')[0]}\n`;
        }

        await conn.sendMessage(from, { text: msg.trim(), mentions }, { quoted: mek });
    } catch (e) {
        console.error("Tagall Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// ------------------- GROUP INVITE LINK -------------------
cmd({
    pattern: "link",
    alias: ["grouplink", "glink"],
    desc: "Get the group invite link.",
    category: "group",
    react: "🔗",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, isBotAdmins, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isBotAdmins) return await reply(" I need to be an Admin to fetch the invite link.");
        if (!isAdmins && !isOwner) return await reply(" Only group Admins can use this command.");

        const code = await conn.groupInviteCode(from);
        if (!code) return await reply(" Failed to get group invite link.");

        await reply(`https://chat.whatsapp.com/${code}`);
    } catch (e) {
        console.error("Link Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// ------------------- REVOKE LINK -------------------
cmd({
    pattern: "revoke",
    alias: ["resetlink"],
    desc: "Reset the group invite link.",
    category: "group",
    react: "🔄",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, isBotAdmins, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isBotAdmins) return await reply(" I need to be an Admin to reset the invite link.");
        if (!isAdmins && !isOwner) return await reply(" Only group Admins can use this command.");

        await conn.groupRevokeInvite(from);
        await reply(" Group invite link has been reset successfully.");
    } catch (e) {
        console.error("Revoke Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// ------------------- GET GROUP PROFILE PIC -------------------
cmd({
    pattern: "getpic",
    alias: ["gpic", "grouppic"],
    desc: "Get the group profile picture.",
    category: "group",
    react: "🖼️",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, reply, groupName }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in a group.");

        let groupPic;
        try {
            groupPic = await conn.profilePictureUrl(from, 'image');
        } catch {
            return await reply("This group does not have a profile picture.");
        }

        if (!groupPic) {
            return await reply("Could not retrieve group profile picture.");
        }

        await conn.sendMessage(from, {
            image: { url: groupPic },
            caption: `🖼️ *Profile Picture:* ${groupName || "Group"}`
        }, { quoted: mek });
    } catch (e) {
        console.error("Getpic Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// ------------------- WELCOME / GOODBYE -------------------
cmd({
    pattern: "setwelcome",
    desc: "Set the welcome message for this group.",
    category: "group",
    react: "👋",
    filename: __filename
},
async (conn, mek, m, { from, q, isGroup, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isAdmins && !isOwner) return await reply(" Only group Admins can use this command.");

        if (!q) return await reply("Please provide a welcome message (or use 'off' to disable).");

        const db = await getWelcomeDb();
        if (q.toLowerCase() === "off") {
            if (db[from]) delete db[from].welcome;
            await saveWelcomeDb(db);
            return await reply(" Welcome message disabled for this group.");
        }

        if (!db[from]) db[from] = {};
        db[from].welcome = q;
        await saveWelcomeDb(db);
        await reply(` Welcome message saved:\n\n${q}`);
    } catch (e) {
        console.error("Setwelcome Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

cmd({
    pattern: "setgoodbye",
    desc: "Set the goodbye message for this group.",
    category: "group",
    react: "👋",
    filename: __filename
},
async (conn, mek, m, { from, q, isGroup, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isAdmins && !isOwner) return await reply(" Only group Admins can use this command.");

        if (!q) return await reply("Please provide a goodbye message (or use 'off' to disable).");

        const db = await getWelcomeDb();
        if (q.toLowerCase() === "off") {
            if (db[from]) delete db[from].goodbye;
            await saveWelcomeDb(db);
            return await reply(" Goodbye message disabled for this group.");
        }

        if (!db[from]) db[from] = {};
        db[from].goodbye = q;
        await saveWelcomeDb(db);
        await reply(` Goodbye message saved:\n\n${q}`);
    } catch (e) {
        console.error("Setgoodbye Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// ------------------- ANTILINK -------------------
const antilinkDbPath = path.join(dbDir, 'antilink.json');

function getAntilinkDb() {
    try {
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        if (!fs.existsSync(antilinkDbPath)) fs.writeFileSync(antilinkDbPath, '{}');
        return JSON.parse(fs.readFileSync(antilinkDbPath, 'utf-8'));
    } catch {
        return {};
    }
}

function saveAntilinkDb(data) {
    try {
        if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
        fs.writeFileSync(antilinkDbPath, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error("Save antilink DB error:", e);
    }
}

const linkRegex = /(https?:\/\/\S+|www\.\S+|chat\.whatsapp\.com\/\S+|wa\.me\/\S+|t\.me\/\S+)/i;

cmd({
    pattern: "antilink",
    desc: "Turn antilink on/off for this group.",
    category: "group",
    react: "🚫",
    filename: __filename
},
async (conn, mek, m, { from, q, isGroup, isBotAdmins, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isBotAdmins) return await reply("I need to be an Admin to delete messages.");
        if (!isAdmins && !isOwner) return await reply("Only group Admins can use this command.");

        const arg = (q || "").trim().toLowerCase();
        const db = getAntilinkDb();

        // .antilink (no argument) = toggle ON <-> OFF
        if (arg === "on" || (arg === "" && !db[from])) {
            db[from] = true;
            saveAntilinkDb(db);
            return await reply("✅ Antilink is now *ON*. Links sent by members will be deleted.");
        } else if (arg === "off" || (arg === "" && db[from])) {
            delete db[from];
            saveAntilinkDb(db);
            return await reply("❌ Antilink is now *OFF*.");
        }
        await reply(`Usage:\n.antilink on\n.antilink off\n.antilink (toggle)\nCurrent status: *${db[from] ? "ON" : "OFF"}*`);
    } catch (e) {
        console.error("Antilink Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// Separate shortcut commands: .antilinkon / .antilinkoff
cmd({
    pattern: "antilinkon",
    desc: "Turn antilink ON for this group.",
    category: "group",
    react: "✅",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, isBotAdmins, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isBotAdmins) return await reply("I need to be an Admin to delete messages.");
        if (!isAdmins && !isOwner) return await reply("Only group Admins can use this command.");

        const db = getAntilinkDb();
        db[from] = true;
        saveAntilinkDb(db);
        await reply("✅ Antilink is now *ON*. Links sent by members will be deleted.");
    } catch (e) {
        console.error("Antilinkon Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

cmd({
    pattern: "antilinkoff",
    desc: "Turn antilink OFF for this group.",
    category: "group",
    react: "❌",
    filename: __filename
},
async (conn, mek, m, { from, isGroup, isAdmins, isOwner, reply }) => {
    try {
        if (!isGroup) return await reply("This command can only be used in groups.");
        if (!isAdmins && !isOwner) return await reply("Only group Admins can use this command.");

        const db = getAntilinkDb();
        delete db[from];
        saveAntilinkDb(db);
        await reply("❌ Antilink is now *OFF*.");
    } catch (e) {
        console.error("Antilinkoff Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// Auto delete links when antilink is ON
cmd({
    on: "body"
},
async (conn, mek, m, { from, body, isGroup, isBotAdmins, isAdmins, isOwner, sender }) => {
    try {
        if (!isGroup) return;
        if (mek.key?.fromMe) return;

        const db = getAntilinkDb();
        if (!db[from]) return;
        if (!isBotAdmins) return;
        if (isAdmins || isOwner) return; // admins & owner are allowed to send links

        const text = body || m.body || "";
        if (!linkRegex.test(text)) return;

        const user = sender || m.sender;

        // delete the message
        await conn.sendMessage(from, { delete: mek.key });

        // warn the user with mention
        await conn.sendMessage(from, {
            text: `⚠️ *WARNING* ⚠️\n\n@${user.split('@')[0]}, sending links is not allowed in this group!\nYour message has been deleted.`,
            mentions: [user]
        });
    } catch (e) {
        console.error("Antilink Listener Error:", e);
    }
});
