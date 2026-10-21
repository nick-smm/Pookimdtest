// plugins/mention.js
const fs = require('fs');
const path = require('path');
const { cmd } = require('../command');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'mention.json');
const COOLDOWN_MS = 5000; // Minimum gap between replies in the same chat

const DEFAULTS = {
    image: 'https://xenocdn.xenocdn.workers.dev/265d504c.jpeg',
    song: 'https://xenocdn.xenocdn.workers.dev/bb407cc9.opus',
    text: '🌿 NICK XD MD 🌿',
    body: 'ʙᴏᴛ ɴᴀᴍᴇ : NICK XD MD\nsᴛᴀᴛᴜs : Online ✅',
    link: ''
};

const lastReply = new Map();

// ---------- Storage ----------
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

// ---------- Helpers ----------
function runtime(seconds) {
    seconds = Number(seconds);
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor(seconds % (3600 * 24) / 3600);
    const m = Math.floor(seconds % 3600 / 60);
    const s = Math.floor(seconds % 60);
    return `${d}d ${h}h ${m}m ${s}s`;
}

// Only bot owner or group admins/superadmins can edit settings
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

// Get contextInfo regardless of message type (ephemeral, view-once, etc.)
function getContextInfo(message) {
    if (!message) return {};
    const inner = message.ephemeralMessage?.message || message.viewOnceMessage?.message || message;
    const type = Object.keys(inner).find(k => inner[k] && inner[k].contextInfo);
    return type ? inner[type].contextInfo : {};
}

function isBotMentioned(conn, mek, body) {
    const botNum = conn.user.id.split(':')[0];
    const ctx = getContextInfo(mek.message);
    const mentioned = ctx.mentionedJid || [];
    const byJid = mentioned.some(j => j.split('@')[0].split(':')[0] === botNum);
    const byText = (body || '').includes('@' + botNum);
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

// ---------- 1) Mention trigger (works in every chat) ----------
cmd({
    on: 'body',
    filename: __filename
},
async (conn, mek, m, { from, pushname, body }) => {
    try {
        if (mek.key.fromMe) return; // Ignore messages sent by the bot itself
        if (!isBotMentioned(conn, mek, body)) return;

        const now = Date.now();
        const last = lastReply.get(from) || 0;
        if (now - last < COOLDOWN_MS) return; // Anti-spam
        lastReply.set(from, now);

        await sendAlive(conn, from, mek, pushname);
    } catch (e) {
        console.error('Mention reply error:', e);
    }
});

// ---------- 2) Admin/owner-only editor ----------
// .setalive image <url>
// .setalive song <url>      (direct .opus / .mp3 link)
// .setalive text <text>
// .setalive body <text>     (use \n for a new line)
// .setalive link <url|none>
// .setalive show
cmd({
    pattern: 'setalive',
    desc: 'Edit the mention reply (admin only)',
    category: 'main',
    react: '⚙️',
    filename: __filename
},
async (conn, mek, m, { from, sender, args, pushname, isOwner, reply }) => {
    try {
        if (!(await canChange(conn, from, sender, isOwner))) {
            return reply('❌ Only group admins can use this
