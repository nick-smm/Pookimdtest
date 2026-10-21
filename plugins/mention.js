// plugins/mention.js
const fs = require('fs');
const path = require('path');
const { cmd } = require('../command');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'mention.json');
const COOLDOWN_MS = 5000;

const DEFAULTS = {
    image: 'https://xenocdn.xenocdn.workers.dev/265d504c.jpeg',
    song: 'https://xenocdn.xenocdn.workers.dev/bb407cc9.opus',
    text: '🌿 NICK XD MD 🌿',
    body: 'ʙᴏᴛ ɴᴀᴍᴇ : NICK XD MD\nsᴛᴀᴛᴜs : Online ✅',
    link: ''
};

const lastReply = new Map();

function loadSettings() {
    try {
        if (!fs.existsSync(DATA_FILE)) return { ...DEFAULTS };
        return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
    } catch {
        return { ...DEFAULTS };
    }
}

function saveSettings(settings) {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(settings, null, 2));
}

function runtime(seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
}

async function canChange(conn, from, sender, isOwner) {
    if (isOwner) return true;
    if (!from.endsWith('@g.us')) return false;
    try {
        const meta = await conn.groupMetadata(from);
        const p = meta.participants.find(x => x.id === sender);
        return !!p && (p.admin === 'admin' || p.admin === 'superadmin');
    } catch {
        return false;
    }
}

function getContextInfo(message) {
    if (!message) return {};
    const inner = message.ephemeralMessage?.message || message.viewOnceMessage?.message || message;
    const type = Object.keys(inner).find(k => inner[k] && inner[k].contextInfo);
    return type ? inner[type].contextInfo : {};
}

function isBotMentioned(conn, mek, body) {
    const ids = [conn.user.id, conn.user.lid]
        .filter(Boolean)
        .map(j => j.split(':')[0].split('@')[0]);

    const ctx = getContextInfo(mek.message);
    const mentioned = ctx.mentionedJid || [];

    const byJid = mentioned.some(j => ids.includes(j.split(':')[0].split('@')[0]));
    const byText = ids.some(id => (body || '').includes('@' + id));

    return byJid || byText;
}

async function sendAlive(conn, from, mek, pushname) {
    const s = loadSettings();
    const botJid = conn.user.id.split(':')[0] + '@s.whatsapp.net';
    const mode = (global.mode || 'Public').toUpperCase() === 'PRIVATE' ? 'Private' : 'Public';

    const caption = `
╭━━━〔 ${s.text} 〕━━━⬣

${s.body}

ツ *ᴜsᴇʀ* : ${pushname || 'User'}
ツ *ᴜᴘᴛɪᴍᴇ* : ${runtime(process.uptime())}
ツ *ᴏᴡɴᴇʀ* : @${botJid.split('@')[0]}
ツ *ᴍᴏᴅᴇ* : ${mode}
${s.link ? `\nʟɪɴᴋ : ${s.link}` : ''}
╰━━━━━━━━━━━━━━━━⬣`;

    await conn.sendMessage(from, {
        image: { url: s.image },
        caption,
        contextInfo: { mentionedJid: [botJid] }
    }, { quoted: mek });

    const res = await fetch(s.song, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`Song download failed: ${res.status}`);
    const audio = Buffer.from(await res.arrayBuffer());

    await conn.sendMessage(from, {
        audio,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true
    }, { quoted: mek });
}

cmd({
    on: 'body',
    filename: __filename
},
async (conn, mek, m, { from, pushname, body }) => {
    console.log('[mention] from:', from, 'mentioned:', JSON.stringify(getContextInfo(mek.message).mentionedJid), 'bot:', conn.user.id);
    try {
        if (mek.key.fromMe) return;
        if (!isBotMentioned(conn, mek, body)) return;

        const now = Date.now();
        const last = lastReply.get(from) || 0;
        if (now - last < COOLDOWN_MS) return;
        lastReply.set(from, now);

        await sendAlive(conn, from, mek, pushname);
    } catch (e) {
        console.error('Mention reply error:', e);
    }
});

cmd({
    pattern: 'setmention',
    desc: 'Edit the mention reply (admin only)',
    category: 'main',
    react: '⚙️',
    filename: __filename
},
async (conn, mek, m, { from, sender, args, pushname, isOwner, reply }) => {
    try {
        if (!(await canChange(conn, from, sender, isOwner))) {
            return reply('Only group admins can use this command.');
        }

        const key = (args[0] || '').toLowerCase();
        const value = args.slice(1).join(' ').trim();
        const valid = ['image', 'song', 'text', 'body', 'link', 'show'];

        if (!valid.includes(key)) {
            return reply(
                '*Usage:*\n' +
                '.setmention image <url>\n' +
                '.setmention song <url>\n' +
                '.setmention text <text>\n' +
                '.setmention body <text>\n' +
                '.setmention link <url|none>\n' +
                '.setmention show'
            );
        }

        if (key === 'show') {
            return await sendAlive(conn, from, mek, pushname);
        }

        if (!value) return reply(`Please provide a value for ${key}.`);

        if ((key === 'image' || key === 'song' || key === 'link') &&
            value.toLowerCase() !== 'none' && !/^https?:\/\//i.test(value)) {
            return reply('Please provide a valid URL (http/https).');
        }

        const s = loadSettings();
        if (key === 'link') {
            s.link = value.toLowerCase() === 'none' ? '' : value;
        } else if (key === 'body') {
            s.body = value.replace(/\\n/g, '\n');
        } else {
            s[key] = value;
        }

        saveSettings(s);
        return reply(`${key} updated. The next mention will show the new card.`);
    } catch (e) {
        console.error('setmention error:', e);
        return reply(`Error: ${e.message}`);
    }
});
