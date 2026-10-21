const { cmd } = require('../command');
const axios = require('axios');
const FormData = require('form-data');
const mimeTypes = require('mime-types');

const UPLOAD_API = 'https://xenocdn.xenocdn.workers.dev/upload';

// Returns true if the word looks like a file extension, e.g. "html", "json", ".txt"
const isExtension = (word) => {
    if (!word) return false;
    return word.startsWith('.') || !!mimeTypes.lookup(word.replace(/^\./, ''));
};

// Normalizes an extension: lowercase and without the leading dot
const cleanExtension = (word) => word.toLowerCase().replace(/^\./, '');

// Uploads a file buffer to the CDN and returns the direct URL
async function uploadBuffer(buffer, filename, contentType) {
    const form = new FormData();
    form.append('file', buffer, { filename, contentType });

    const { data } = await axios.post(UPLOAD_API, form, {
        headers: form.getHeaders(),
        timeout: 60000
    });

    if (data?.status === 'success' && data.url) return data.url;
    if (typeof data === 'string' && data.trim()) return data.trim();
    throw new Error(data?.error || 'Upload failed');
}

// Asks the CDN to fetch a remote URL and returns the new direct URL
async function uploadFromUrl(targetUrl) {
    const { data } = await axios.get(`${UPLOAD_API}?url=${encodeURIComponent(targetUrl)}`, {
        timeout: 60000
    });

    if (data?.status === 'success' && data.url) return data.url;
    throw new Error(data?.error || 'Upload from URL failed');
}

cmd({
    pattern: "url",
    alias: ["tourl", "upload", "cdn", "telegraph", "imgbb"],
    desc: "Convert any media, file, text or URL into a direct link.",
    category: "tools",
    react: "🔗",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix, reply }) => {
    try {
        // Use the quoted message if the user replied to one, otherwise the current message
        const target = m.quoted ? m.quoted : m;
        const msg = target.msg || target;
        const mime = msg.mimetype || '';

        const args = q ? q.trim().split(/\s+/) : [];
        const text = q || m.quoted?.text || '';
        const urlMatch = text.match(/https?:\/\/[^\s]+/);

        let ext = 'txt';
        let content = '';
        let hasCustomExt = false;

        if (m.quoted?.text) {
            // Replying to a text message: the first argument can optionally be an extension
            content = m.quoted.text;
            if (args[0] && isExtension(args[0])) {
                ext = cleanExtension(args[0]);
                hasCustomExt = true;
            }
        } else if (args.length) {
            // Direct text: "<ext> <content>" if the first word is an extension, otherwise plain text
            if (args.length >= 2 && isExtension(args[0])) {
                ext = cleanExtension(args[0]);
                content = args.slice(1).join(' ');
                hasCustomExt = true;
            } else {
                content = args.join(' ');
            }
        }

        // Only treat the text as a URL when no custom extension is given,
        // so that URLs can still be uploaded as plain text when an extension is provided
        const finalUrlMatch = hasCustomExt ? null : urlMatch;

        if (!mime && !finalUrlMatch && !content) {
            return await reply(
                `*Please reply to any media, or provide text/URL.*\n\n` +
                `*Example:* ${prefix}url (reply to media/text)\n` +
                `*Example:* ${prefix}url html <h1>Hi</h1>\n` +
                `*Example:* ${prefix}url hello world\n` +
                `*Example:* ${prefix}url https://example.com/image.png`
            );
        }

        await conn.sendMessage(from, { react: { text: "⏳", key: mek.key } });
        const pMsg = await conn.sendMessage(from, { text: "Uploading..." }, { quoted: mek });

        let directUrl = '';

        try {
            if (mime) {
                // Media upload (image, video, audio, document, etc.)
                const buffer = await target.download();
                if (!buffer) throw new Error("Failed to download media.");

                const extension = mimeTypes.extension(mime) || mime.split('/')[1] || 'bin';
                const filename = `xeno_${Date.now()}.${extension}`;
                directUrl = await uploadBuffer(buffer, filename, mime);

            } else if (content) {
                // Text / code upload
                const buffer = Buffer.from(content, 'utf-8');
                const filename = `xeno_${Date.now()}.${ext}`;
                const contentType = mimeTypes.lookup(ext) || 'text/plain';
                directUrl = await uploadBuffer(buffer, filename, contentType);

            } else if (finalUrlMatch) {
                // Remote URL upload
                directUrl = await uploadFromUrl(finalUrlMatch[0]);
            }

            if (!directUrl) throw new Error("Nothing to upload.");

            await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
            await conn.sendMessage(from, { text: directUrl, edit: pMsg.key });

        } catch (err) {
            console.error("URL conversion error:", err);
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            await conn.sendMessage(from, {
                text: `*UPLOAD FAILED*\n\nReason: ${err.message || "Unknown error"}`,
                edit: pMsg.key
            });
        }

    } catch (e) {
        console.error("URL Command Error:", e);
        await reply(`Error: ${e.message || e}`);
    }
});
