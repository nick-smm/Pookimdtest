const { cmd } = require('../command');
const axios = require('axios');

const BOT_NAME = "𝑳𝜺𝝂𝜾⃮⃯⃔𝜶𝜼𝝄♪";
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36' };
const MAX_BYTES = 60 * 1024 * 1024; // 60MB

const YT_ID = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

// ---------- helpers ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Find a download link in whatever shape an API returns
function findDownloadUrl(o, depth = 0) {
    if (!o || typeof o !== 'object' || depth > 4) return null;
    const keys = ['downloadUrl', 'download_url', 'download', 'dl', 'dl_url', 'link', 'audio', 'mp3', 'url'];
    for (const k of keys) {
        const v = o[k];
        if (typeof v === 'string' && /^https?:\/\//i.test(v)) {
            if (k === 'url' && /youtube\.com|youtu\.be/i.test(v)) continue; // that's the source, not the file
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

function findTitle(o) {
    return o?.title || o?.result?.title || o?.data?.title || null;
}

// ---------- search ----------
async function searchVideo(query) {
    // 1) API
    try {
        const { data } = await axios.get(
            `https://xenosirapis.zone.id/api/ytsearch?query=${encodeURIComponent(query)}`,
            { headers: UA, timeout: 15000 }
        );
        const list = data?.results || data?.result || data?.data;
        const first = Array.isArray(list) ? list[0] : null;
        if (first) {
            const url = first.url || (first.videoId ? `https://www.youtube.com/watch?v=${first.videoId}` : null);
            if (url) return {
                url,
                title: first.title || query,
                thumbnail: first.thumbnail || first.image || "",
            };
        }
    } catch (e) { console.warn("API search failed:", e.message); }

    // 2) local yt-search (no API needed)
    try {
        const yts = require('yt-search');
        const r = await yts(query);
        const v = r?.videos?.[0];
        if (v) return { url: v.url, title: v.title, thumbnail: v.thumbnail || "" };
    } catch (e) { console.warn("yt-search failed:", e.message); }

    return null;
}

// ---------- download ----------
async function fetchBuffer(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: UA,
        timeout: 90000,
        maxRedirects: 5,
        maxContentLength: MAX_BYTES,
        maxBodyLength: MAX_BYTES,
    });
    const buf = Buffer.from(res.data);
    if (buf.length < 10 * 1024) throw new Error("Downloaded file too small (probably an error page)");
    return buf;
}

// API providers: add more here, they are tried in order
const PROVIDERS = [
    v => `https://xenosirapis.zone.id/api/ytmp3dl?url=${encodeURIComponent(v)}`,
    v => `https://xenosirapis.zone.id/api/ytmp3dl?url=${encodeURIComponent(v)}&format=mp3`,
];

async function downloadViaApis(videoUrl) {
    for (const build of PROVIDERS) {
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                const { data } = await axios.get(build(videoUrl), { headers: UA, timeout: 30000 });
                const link = findDownloadUrl(data);
                if (!link) throw new Error("No download link in response");
                const buffer = await fetchBuffer(link);
                return { buffer, mimetype: "audio/mpeg", title: findTitle(data) };
            } catch (e) {
                console.warn("API download failed:", e.message);
                await sleep(1000);
            }
        }
    }
    return null;
}

async function downloadViaYtdl(videoUrl) {
    try {
        const ytdl = require('@distube/ytdl-core');
        const info = await ytdl.getInfo(videoUrl);
        const format = ytdl.chooseFormat(info.formats, {
            quality: 'highestaudio',
            filter: f => f.hasAudio && !f.hasVideo && f.container === 'mp4',
        });
        const chunks = [];
        let size = 0;
        await new Promise((resolve, reject) => {
            const stream = ytdl.downloadFromInfo(info, { format });
            stream.on('data', c => {
                size += c.length;
                if (size > MAX_BYTES) { stream.destroy(); return reject(new Error("File too large")); }
                chunks.push(c);
            });
            stream.on('end', resolve);
            stream.on('error', reject);
        });
        return { buffer: Buffer.concat(chunks), mimetype: "audio/mp4", title: info.videoDetails?.title };
    } catch (e) {
        console.warn("ytdl fallback failed:", e.message);
        return null;
    }
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
        }

        await react("📥");
        const caption = `*Downloading :* ${title}\n\n> ${BOT_NAME}`;
        try {
            if (thumbnail) await conn.sendMessage(from, { image: { url: thumbnail }, caption }, { quoted: mek });
            else await conn.sendMessage(from, { text: caption }, { quoted: mek });
        } catch {
            await conn.sendMessage(from, { text: caption }, { quoted: mek }).catch(() => {});
        }

        // Try APIs first, then local ytdl
        const result = (await downloadViaApis(videoUrl)) || (await downloadViaYtdl(videoUrl));

        if (!result) {
            await react("❌");
            return await conn.sendMessage(from, {
                text: "Failed to download the audio. All servers are busy or blocked, try again in a moment."
            }, { quoted: mek });
        }

        if (title === "Song" && result.title) title = result.title;
        const safeName = title.replace(/[\\/:*?"<>|]/g, '').slice(0, 80) || "song";
        const ext = result.mimetype === "audio/mp4" ? "m4a" : "mp3";

        await conn.sendMessage(from, {
            audio: result.buffer,
            mimetype: result.mimetype,
            fileName: `${safeName}.${ext}`,
            ptt: false,
        }, { quoted: mek });

        await react("✅");

    } catch (e) {
        console.error("Song Command Error:", e);
        await react("❌");
        await conn.sendMessage(from, { text: `❌ Error: ${e.message || e}` }, { quoted: mek }).catch(() => {});
    }
});
