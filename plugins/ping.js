const config = require('../config');
const { cmd } = require('../command');
const axios = require('axios');
const mongoose = require('mongoose');

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

// ---------- MongoDB: ഓരോ ബോട്ട് നമ്പറിനും ഒരു document ----------
const Ping2Schema = new mongoose.Schema({
    number: { type: String, required: true, unique: true },
    images: { type: [String], default: undefined },
    link: String,
    title: String,
    body: String,
    footer: String
});
const Ping2 = mongoose.models.Ping2Settings || mongoose.model('Ping2Settings', Ping2Schema);

function getBotNumber(conn) {
    return (conn.user?.id || '').split(':')[0].split('@')[0];
}

async function load(num) {
    const mine = (await Ping2.findOne({ number: num }).lean()) || {};
    return {
        images: [...(mine.images && mine.images.length ? mine.images : DEFAULTS.images)],
        link: mine.link || DEFAULTS.link,
        title: mine.title || DEFAULTS.title,
        body: mine.body || DEFAULTS.body,
        footer: mine.footer || DEFAULTS.footer
    };
}

async function save(num, data) {
    await Ping2.findOneAndUpdate(
        { number: num },
        { $set: { number: num, ...data } },
        { upsert: true, new: true }
    );
}

async function resetUser(num) {
    await Ping2.deleteOne({ number: num });
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

// ---------- .ping2 : image card ping (ഈ ബോട്ട് നമ്പറിന്റെ settings) ----------
cmd({
    pattern: "ping2",
    desc: "Ping with image card.",
    category: "main",
    react: "⚡",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    try {
        let v;
        try {
            v = await load(getBotNumber(conn));
        } catch (e) {
            console.error("Ping2 DB load failed:", e.message);
            v = { ...DEFAULTS, images: [...DEFAULTS.images] };
        }

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

// ---------- .setping2 : ഓരോ ബോട്ട് നമ്പറും സ്വന്തം ping മാത്രം മാറ്റും ----------
cmd({
    pattern: "setping2",
    desc: "Change your own ping2 look (bot number only).",
    category: "owner",
    filename: __filename
},
async (conn, mek, m, { from, args, reply }) => {
    try {
        const botNumber = getBotNumber(conn);
        const sender = (mek.key.participant || mek.key.remoteJid || '')
            .split('@')[0].split(':')[0];

        const isBot = mek.key.fromMe || sender === botNumber;
        if (!isBot) return reply("ബോട്ട് നമ്പറിൽ നിന്ന് മാത്രം! 🚫");

        const v = await load(botNumber);
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
            await save(botNumber, v);
            return reply(`✅ ${field} = ${value}`);
        }

        if (field === 'addimg') {
            if (!/^https?:\/\//.test(value)) return reply("Valid image URL kodukku.");
            v.images.push(value);
            await save(botNumber, v);
            return reply(`✅ Image add cheythu (ആകെ ${v.images.length})`);
        }

        if (field === 'delimg') {
            const i = parseInt(value) - 1;
            if (isNaN(i) || i < 0 || i >= v.images.length) return reply("Number thettanu. .setping2 images nokku.");
            if (v.images.length === 1) return reply("Oru image enkilum venam.");
            v.images.splice(i, 1);
            await save(botNumber, v);
            return reply("✅ Image remove cheythu");
        }

        if (field === 'images') {
            return reply(v.images.map((u, i) => `${i + 1}. ${u}`).join('\n'));
        }

        if (field === 'reset') {
            await resetUser(botNumber);
            return reply("✅ Default aakki");
        }

        reply(help);
    } catch (e) {
        console.error("SetPing2 Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});
