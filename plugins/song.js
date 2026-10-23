const { cmd } = require('../command');
const axios = require('axios');

const BOT_NAME = "𝑳𝜺𝝂𝜾⃮⃯⃔𝜶𝜼𝝄♪";
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' };

// Your API, format unchanged: /api/ytmp3dl?url=<youtube link>
const DL_API = "https://xenosirapis.zone.id/api/ytmp3dl";
const MAX_BYTES = 60 * 1024 * 1024;

const YT_ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

// ---------- helpers ----------
function findDownloadUrl(o, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 4) return null;
    const keys = ['downloadUrl', 'download_url', 'download', 'dl', 'dl_url', 'link', 'audio', 'mp3', 'url'];
    for (const k of keys) {
        const v = o[k];
        if (typeof v === 'string' && /^https?:\/\//i.test(v)) {
            if (k === 'url' && /youtube\.com|youtu\.be/i.test(v)) continue;
            return v;
        }
        if (v && typeof v === 'object') {
            const r = findDownloadUrl(v, depth + 1);
            if (r) return r;
        }
    }
    for (const k of ['result', 'data', 'results', 'response']) {
        const r = findDownloadUrl(o[k], depth + 1);
        if (r) return r;
    }
    return null;
}

const findTitle = o => o?.title || o?.result?.title || o?.data?.title || null;

function getBuffer(url) {
    return axios.get(url, {
        responseType: 'arraybuffer',
        headers: UA,
        timeout: 90000,
        maxRedirects: 5,
        maxContentLength: MAX_BYTES,
        maxBodyLength: MAX_BYTES,
    });
}

// ---------- search ----------
async function searchVideo(query) {
    try {
        const { data } = await axios.get(
            `https://xenosirapis.zone.id/api/ytsearch?query=${encodeURIComponent(query)}`,
            { headers: UA, timeout: 15000 }
        );
        const list = data?.results || data?.result || data?.data;
        const first = Array.isArray(list) ? list[0] : null;
        if (first) {
            const url = first.url || (first.videoId ? `https://www.youtube.com/watch?v=${first.videoId}` : null);
            if (url) return { url, title: first.title || query, thumbnail: first.thumbnail || first.image || "" };
        }
    } catch (e) { console.warn("API search failed:", e.message); }

    try {
        const yts = require('yt-search');
        const r = await yts(query);
        const v = r?.videos?.[0];
        if (v) return { url: v.url, title: v.title, thumbnail: v.thumbnail || "" };
    } catch (e) { console.warn("yt-search failed:", e.message); }

    return null;
}

// ---------- download (your API) ----------
async function downloadFromApi(videoUrl) {
    const apiUrl = `${DL_API}?url=${videoUrl}`;

    for (let attempt = 1; attempt <= 2; attempt++) {
        try {
            const res = await getBuffer(apiUrl);
            const type = String(res.headers['content-type'] || '').toLowerCase();
            let buf = Buffer.from(res.data);
            let title = null;
            let link = null;

            // API answered with JSON containing the download link
            if (type.includes('json') || type.includes('text')) {
                const json = JSON.parse(buf.toString('utf8'));
                link = findDownloadUrl(json);
                if (!link) throw new Error("No download link in API response: " + buf.toString('utf8').slice(0, 200));
                title = findTitle(json);
                const file = await getBuffer(link);
                buf = Buffer.from(file.data);
            }
            // otherwise the API streamed the audio directly

            if (buf.length < 10 * 1024) throw new Error("File too small, probably an error page");
            return { buffer: buf, link, title };
        } catch (e) {
            console.warn(`API download attempt ${attempt} failed:`, e.message);
            await new Promise(r => setTimeout(r, 1500));
        }
    }
    return null;
}

// ---------- command ----------
cmd({
    pattern: "song",
    alias: ["play", "mp3", "music"],
    desc: "Download song / audio from YouTube by title or link.",
    category: "downloader",
    react: "🎶",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix }) => {
    const react = emoji => conn.sendMessage(from, { react: { text: emoji, key: mek.key } }).catch(() => {});
    try {
        if (!q) {
            return await conn.sendMessage(from, {
                text: `*Please provide a song name or YouTube link!*\n\n*Example:* ${prefix || '.'}song Faded\n*Example:* ${prefix || '.'}song https://youtu.be/xxxxx`
            }, { quoted: mek });
        }

        await react("🔍");

        const query = q.trim();
        const idMatch = query.match(YT_ID);
        let videoUrl, title = "Song", thumbnail = "";

        if (idMatch) {
            videoUrl = `https://www.youtube.com/watch?v=${idMatch[1]}`;
            thumbnail = `https://i.ytimg.com/vi/${idMatch[1]}/hqdefault.jpg`;
        } else {
            const found = await searchVideo(query);
            if (!found) {
                await react("❌");
                return await conn.sendMessage(from, { text: "No song results found for your search." }, { quoted: mek });
            }
            ({ url: videoUrl, title, thumbnail } = found);
            const id = videoUrl.match(YT_ID)?.[1];
            if (id) videoUrl = `https://www.youtube.com/watch?v=${id}`;
        }

        await react("📥");
        const caption = `*Downloading :* ${title}\n\n> ${BOT_NAME}`;
        try {
            if (thumbnail) await conn.sendMessage(from, { image: { url: thumbnail }, caption }, { quoted: mek });
            else await conn.sendMessage(from, { text: caption }, { quoted: mek });
        } catch {
            await conn.sendMessage(from, { text: caption }, { quoted: mek }).catch(() => {});
        }

        const result = await downloadFromApi(videoUrl);
        if (!result) {
            await react("❌");
            return await conn.sendMessage(from, {
                text: "Failed to download. The server is busy or blocked, try again in a moment."
            }, { quoted: mek });
        }

        if (title === "Song" && result.title) title = result.title;
        const safeName = title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || "song";

        try {
            await conn.sendMessage(from, {
                audio: result.buffer,
                mimetype: "audio/mpeg",
                fileName: `${safeName}.mp3`,
                ptt: false,
            }, { quoted: mek });
        } catch (sendErr) {
            console.warn("Audio send failed, sending as document:", sendErr.message);
            await conn.sendMessage(from, {
                document: result.buffer,
                mimetype: "audio/mpeg",
                fileName: `${safeName}.mp3`,
            }, { quoted: mek });
        }

        await react("✅");

    } catch (e) {
        console.error("Song Command Error:", e);
        await react("❌");
        await conn.sendMessage(from, { text: `❌ Error: ${e.message || e}` }, { quoted: mek }).catch(() => {});
    }
});
