const fs = require('fs');
const path = require('path');
const { cmd } = require('../command');

const DB = path.join(__dirname, '..', 'data', 'mention.json');
const DEFAULTS = { head: 'WhatsApp Bot', body: 'Powered by Bot', img: '', url: '', audio: '' };

// key -> field name
const FIELDS = {
    head: 'head', title: 'head',
    body: 'body',
    img: 'img', image: 'img',
    url: 'url', link: 'url',
    audio: 'audio'
};
const URL_FIELDS = ['img', 'url', 'audio'];

function readDb() {
    try { return JSON.parse(fs.readFileSync(DB, 'utf8')); } catch { return {}; }
}
function writeDb(data) {
    fs.mkdirSync(path.dirname(DB), { recursive: true });
    fs.writeFileSync(DB, JSON.stringify(data, null, 2));
}
function getUser(id) {
    return { ...DEFAULTS, ...(readDb()[id] || {}) };
}

// .mset <head|body|img|url|audio> <value>   |   .mset reset
cmd({
    pattern: 'mset',
    desc: 'Set your own mention card settings',
    category: 'main',
    react: '✏️',
    filename: __filename
}, async (conn, mek, m, { sender, args, reply }) => {
    try {
        const key = (args[0] || '').toLowerCase();
        const value = args.slice(1).join(' ').trim();

        if (!key) {
            return reply('Usage:\n.mset head <title>\n.mset body <text>\n.mset img <https://...>\n.mset url <https://...>\n.mset audio <https://...>\n.mset reset');
        }
        if (key === 'reset') {
            const db = readDb();
            delete db[sender];
            writeDb(db);
            return reply('Settings reset ✅');
        }

        const field = FIELDS[key];
        if (!field) return reply('Unknown field. Use: head, body, img, url, or audio.');
        if (!value) return reply(`No value given. Example: .mset ${key} ...`);
        if (URL_FIELDS.includes(field) && !/^https?:\/\//i.test(value)) {
            return reply('The link must start with https://');
        }

        const db = readDb();
        db[sender] = { ...(db[sender] || {}), [field]: value };
        writeDb(db);
        reply(`✅ ${field} set`);
    } catch (e) {
        console.log(e);
        reply(`Error: ${e.message}`);
    }
});

// .mshow : show current settings
cmd({
    pattern: 'mshow',
    desc: 'Show your current mention settings',
    category: 'main',
    react: '👀',
    filename: __filename
}, async (conn, mek, m, { sender, reply }) => {
    try {
        const s = getUser(sender);
        reply(`*Head:* ${s.head}\n*Body:* ${s.body}\n*Image:* ${s.img || '-'}\n*Link:* ${s.url || '-'}\n*Audio:* ${s.audio || '-'}`);
    } catch (e) {
        console.log(e);
        reply(`Error: ${e.message}`);
    }
});

// .mention [text] : sends the card and audio
cmd({
    pattern: 'mention',
    alias: ['tag'],
    desc: 'Send a link card using your own settings',
    category: 'main',
    react: '📌',
    filename: __filename
}, async (conn, mek, m, { from, sender, q, reply }) => {
    try {
        const s = getUser(sender);
        const text = q && q.trim() ? q.trim() : s.body;

        await conn.sendMessage(from, {
            text,
            contextInfo: {
                externalAdReply: {
                    title: s.head,
                    body: s.body,
                    mediaType: 1,
                    thumbnailUrl: s.img || undefined,
                    sourceUrl: s.url || undefined,
                    renderLargerThumbnail: true,
                    showAdAttribution: false
                }
            }
        }, { quoted: mek });

        if (s.audio) {
            await conn.sendMessage(from, {
                audio: { url: s.audio },
                mimetype: 'audio/mpeg',
                ptt: true
            }, { quoted: mek });
        }
    } catch (e) {
        console.log(e);
        reply(`Error: ${e.message}`);
    }
});
