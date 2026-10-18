const config = require('../config');
const { cmd } = require('../command');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'ping2.json');

const DEFAULTS = {
    images: [
        "https://xenocdn.xenocdn.workers.dev/ed7fc3db.jpeg",
        "https://xenocdn.xenocdn.workers.dev/06c26174.jpeg",
        "https://xenocdn.xenocdn.workers.dev/dfb328c2.jpeg",
        "https://xenocdn.xenocdn.workers.dev/d3ba8e19.jpeg"
    ],
    link: "https://instagram.com/whoiss.nick?exln=MjdiZjcydjU2a2Ni",
    title: "➥ Ping ⚡",
    body: "View details",
    footer: "⚡𝑳𝜺𝝂𝜾⃮⃯⃔𝜶𝜼𝝄♪"
};

function load() {
    try {
        return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(FILE, 'utf8')) };
    } catch {
        return { ...DEFAULTS };
    }
}

function save(data) {
    fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

async function getThumbnail(images) {
    const shuffled = [...images].sort(() => Math.random() - 0.5);
    for (const url of shuffled) {
        try {
            const res = await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 10000,
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            return { buffer: Buffer.from(res.data), url };
        } catch (e) {
            console.error("Ping image failed:", url, e.message);
        }
    }
    return { buffer: null, url: shuffled[0] };
}

// ---------- .ping : normal ping ----------
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
        const start = Date.now();
        const sent = await conn.sendMessage(from, { text: "Pinging..." }, { quoted: mek });
        const ms = Date.now() - start;
        await conn.sendMessage(from, { text: `🏓 Pong! ${ms} ms`, edit: sent.key });
    } catch (e) {
        console.error("Ping Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// ---------- .ping2 : image card ping ----------
cmd({
    pattern: "ping2",
    desc: "Ping with image card.",
    category: "main",
    react: "⚡",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    try {
        const v = load();
        const startTime = Date.now();
        await conn.sendPresenceUpdate('composing', from).catch(() => {});
        const ping = Date.now() - startTime;

        const { buffer, url } = await getThumbnail(v.images);

        const pingText =
`↩ ʙᴏᴛ sᴘᴇᴇᴅ ☁️ : ${ping} ᴍs

${v.footer}`;

        const adReply = {
            title: v.title,
            body: v.body,
            thumbnailUrl: url,
            sourceUrl: v.link,
            mediaType: 1,
            renderLargerThumbnail: false,
            showAdAttribution: false
        };
        if (buffer) adReply.thumbnail = buffer;

        await conn.sendMessage(from, {
            text: pingText,
            contextInfo: { externalAdReply: adReply }
        }, { quoted: mek });
    } catch (e) {
        console.error("Ping2 Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});

// ---------- .setping2 : bot number only ----------
cmd({
    pattern: "setping2",
    desc: "Change ping2 look (bot number only).",
    category: "owner",
    filename: __filename
},
async (conn, mek, m, { from, args, reply }) => {
    try {
        // ബോട്ട് ഓടുന്ന നമ്പർ മാത്രം
        const botNumber = (conn.user?.id || '').split(':')[0].split('@')[0];
        const sender = (mek.key.participant || mek.key.remoteJid || '')
            .split('@')[0].split(':')[0];

        const isBot = mek.key.fromMe || sender === botNumber;
        if (!isBot) return reply("ADMIN ONLY CHANGE ! 🚫");

        const v = load();
        const field = (args[0] || '').toLowerCase();
        const value = args.slice(1).join(' ').trim();

        const help =
`*Ping2 settings*
.setping2 link <url>
.setping2 title <text>
.setping2 body <text>
.setping2 footer <text>
.setping2 addimg <url>
.setping2 delimg <number>
.setping2 images
.setping2 reset`;

        if (!field) return reply(help);

        if (['link', 'title', 'body', 'footer'].includes(field)) {
            if (!value) return reply("Value kodukku.");
            v[field] = value;
            save(v);
            return reply(`✅ ${field} = ${value}`);
        }

        if (field === 'addimg') {
            if (!/^https?:\/\//.test(value)) return reply("Valid image URL kodukku.");
            v.images.push(value);
            save(v);
            return reply(`✅ Image added (ആകെ ${v.images.length})`);
        }

        if (field === 'delimg') {
            const i = parseInt(value) - 1;
            if (isNaN(i) || i < 0 || i >= v.images.length) return reply("Number thettanu. .setping2 images nokku.");
            if (v.images.length === 1) return reply("Oru image enkilum venam.");
            v.images.splice(i, 1);
            save(v);
            return reply("✅ Image removed");
        }

        if (field === 'images') {
            return reply(v.images.map((u, i) => `${i + 1}. ${u}`).join('\n'));
        }

        if (field === 'reset') {
            save({ ...DEFAULTS });
            return reply("✅ Default aakki");
        }

        reply(help);
    } catch (e) {
        console.error("SetPing2 Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});
