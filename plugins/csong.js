// .csong <WhatsApp Channel Link> <Song Name> [ptt]
// Dev Xeno Exe - Updated Version

const axios = require("axios");
const { execFile, spawnSync } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const util = require("util");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const execFilePromise = util.promisify(execFile);
const config = require("../config");
const { cmd } = require("../command");

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const MAX_AUDIO_BYTES = 40 * 1024 * 1024;
const CHANNEL_LINK_RE = /^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]{10,})\/?(?:[?#].*)?$/i;

/* ───────────────────────── FFmpeg ───────────────────────── */

let cachedFfmpegBin = undefined;
function getFfmpegBinary() {
    if (cachedFfmpegBin !== undefined) return cachedFfmpegBin;

    const candidates = [];
    candidates.push(path.join(process.cwd(), "bin", "ffmpeg.exe"));
    try {
        const s = require("ffmpeg-static");
        if (s && typeof s === "string") candidates.push(s);
    } catch (e) {}
    candidates.push("ffmpeg");

    for (const bin of candidates) {
        try {
            if (bin !== "ffmpeg" && !fs.existsSync(bin)) continue;
            const res = spawnSync(bin, ["-version"], { timeout: 3000, stdio: "ignore" });
            if (res.status === 0) {
                cachedFfmpegBin = bin;
                return bin;
            }
        } catch (e) {}
    }
    cachedFfmpegBin = null;
    return null;
}

/* ───────────────────────── Parsing ───────────────────────── */

function extractYouTubeId(input) {
    if (!input || typeof input !== "string") return null;
    const patterns = [
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/
    ];
    for (const re of patterns) {
        const match = input.trim().match(re);
        if (match) return match[1];
    }
    return null;
}

function parseCsongArgs(raw) {
    const tokens = String(raw || "").trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return { error: "empty" };

    const link = tokens[0].replace(/[,|]+$/, "");
    const m = link.match(CHANNEL_LINK_RE);
    if (!m) return { error: "link" };

    let rest = tokens.slice(1);
    let ptt = false;
    if (rest.length > 1 && rest[rest.length - 1].toLowerCase() === "ptt") {
        ptt = true;
        rest = rest.slice(0, -1);
    }
    const songQuery = rest.join(" ").replace(/^[,|]\s*/, "").trim();
    return { inviteCode: m[1], songQuery, ptt };
}

/* ───────────────────────── Channel resolution ───────────────────────── */

function readViewerRole(meta) {
    const role = meta?.viewer_metadata?.role ?? meta?.viewerMetadata?.role ?? meta?.role ?? null;
    return role ? String(role).toUpperCase() : null;
}

async function resolveChannel(conn, inviteCode) {
    if (typeof conn.newsletterMetadata !== "function") {
        return { error: "This Baileys version does not support newsletterMetadata(); cannot resolve channel links." };
    }

    let meta;
    try {
        meta = await conn.newsletterMetadata("invite", inviteCode);
    } catch (err) {
        return { error: "Could not resolve channel link. Make sure the link is correct." };
    }

    const id = meta?.id;
    if (!id || !String(id).endsWith("@newsletter")) {
        return { error: "Invalid channel link." };
    }

    let role = readViewerRole(meta);
    let name = meta?.name || meta?.thread_metadata?.name?.text || "";

    if (!role) {
        try {
            const byJid = await conn.newsletterMetadata("jid", id);
            role = readViewerRole(byJid);
            name = name || byJid?.name || byJid?.thread_metadata?.name?.text || "";
        } catch (err) {}
    }

    if (role && role !== "OWNER" && role !== "ADMIN") {
        return { error: `Bot is not an admin in channel ${name ? `(${name})` : ""}. Add bot as admin.` };
    }

    return { jid: id, name, role };
}

/* ───────────────────────── Search & Download APIs ───────────────────────── */

async function ytSearch(q) {
    try {
        const { data } = await axios.get(`https://api.dreaded.site/api/ytdl/search?query=${encodeURIComponent(q)}`, { timeout: 15000 });
        if (data && data.result && data.result.length) {
            return data.result[0];
        }
    } catch(e) {}

    // Fallback search
    const { data } = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(q)}`, { timeout: 15000 });
    return data?.results?.[0] || null;
}

async function fetchAudioDownloadUrl(videoUrl) {
    const providers = [
        // Working Provider 1
        async () => {
            const { data } = await axios.get(`https://api.dreaded.site/api/ytdl/audio?url=${encodeURIComponent(videoUrl)}`, { timeout: 25000 });
            if (data?.result?.downloadUrl) return { downloadUrl: data.result.downloadUrl, title: data.result.title };
        },
        // Working Provider 2
        async () => {
            const { data } = await axios.get(`https://api.giftedtech.my.id/api/download/dlmp3?url=${encodeURIComponent(videoUrl)}`, { timeout: 25000 });
            if (data?.result?.download_url) return { downloadUrl: data.result.download_url, title: data.result.title };
        },
        // Working Provider 3
        async () => {
            const { data } = await axios.get(`https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`, { timeout: 20000 });
            if (data?.download) return { downloadUrl: data.download, title: data.title };
        }
    ];

    for (const p of providers) {
        try {
            const r = await p();
            if (r && r.downloadUrl) return r;
        } catch (e) {}
    }
    throw new Error("Audio download API fails. Please try again later.");
}

async function downloadToFile(url, dest) {
    const res = await axios({
        method: "get", url, responseType: "stream", timeout: 60000,
        maxContentLength: MAX_AUDIO_BYTES, headers: { "User-Agent": UA }
    });
    await pipeline(res.data, fs.createWriteStream(dest));
}

async function convertToOpus(inputPath, outputPath) {
    const ffBin = getFfmpegBinary();
    if (!ffBin) return null;
    for (const codec of ["libopus", "opus"]) {
        try {
            await execFilePromise(ffBin, ["-y", "-i", inputPath, "-vn", "-c:a", codec, "-b:a", "48k", "-ac", "1", "-ar", "48000", outputPath], { timeout: 60000 });
            if ((await fs.pathExists(outputPath)) && (await fs.stat(outputPath)).size > 0) return outputPath;
        } catch (err) {}
    }
    return null;
}

function createVoiceWaveform() {
    const buf = Buffer.alloc(64);
    for (let i = 0; i < 64; i++) {
        buf[i] = Math.floor(Math.random() * 80) + 20;
    }
    return buf;
}

/* ───────────────────────── Command Execution ───────────────────────── */

const activeCsongRequests = new Set();

async function handleCsongExecution(conn, mek, m, { from, q, text, prefix, reply }) {
    const msgId = mek?.key?.id || m?.key?.id;
    if (msgId) {
        if (activeCsongRequests.has(msgId)) return;
        activeCsongRequests.add(msgId);
        setTimeout(() => activeCsongRequests.delete(msgId), 60000);
    }

    const p = prefix || config.PREFIX || ".";
    const chatJid = m?.chat || from;
    const key = mek?.key || m?.key;
    const sendReply = reply || (async (txt) => conn.sendMessage(chatJid, { text: txt }, { quoted: mek || m }));
    const react = (emoji) => conn.sendMessage(chatJid, { react: { text: emoji, key } }).catch(() => {});

    const usage = `*Usage:*\n${p}csong <Channel Link> <Song Name>\n${p}csong <Channel Link> <Song Name> ptt`;

    const tmpDir = path.join(process.cwd(), "tmp");
    const uniqueId = crypto.randomBytes(6).toString("hex");
    const inputPath = path.join(tmpDir, `csong_in_${uniqueId}.mp3`);
    const outputPath = path.join(tmpDir, `csong_vn_${uniqueId}.opus`);

    try {
        const parsed = parseCsongArgs(text !== undefined ? text : q);
        if (parsed.error === "empty" || parsed.error === "link") return await sendReply(`❌ ${parsed.error === "link" ? "Invalid WhatsApp channel link." : usage}`);

        const { inviteCode, songQuery, ptt } = parsed;
        if (!songQuery) return await sendReply(`❌ Please specify a song name.\n\n${usage}`);

        await fs.ensureDir(tmpDir);
        await react("🔍");

        const channel = await resolveChannel(conn, inviteCode);
        if (channel.error) {
            await react("❌");
            return await sendReply("❌ " + channel.error);
        }

        const song = await ytSearch(songQuery);
        if (!song) throw new Error("Song not found.");

        const videoUrl = song.url || `https://www.youtube.com/watch?v=${song.videoId || song.id}`;
        const title = song.title || songQuery;
        const author = song.author?.name || song.author || song.channel || "";

        await react("📥");
        const dl = await fetchAudioDownloadUrl(videoUrl);
        await downloadToFile(dl.downloadUrl, inputPath);

        await react("🎙️");
        let payload;
        if (ptt) {
            const opusPath = await convertToOpus(inputPath, outputPath);
            if (!opusPath) {
                // If opus conversion fails (e.g. no ffmpeg), send as normal audio MP3
                payload = { audio: await fs.readFile(inputPath), mimetype: "audio/mpeg", ptt: false };
            } else {
                payload = {
                    audio: await fs.readFile(opusPath),
                    mimetype: "audio/ogg; codecs=opus",
                    ptt: true,
                    waveform: createVoiceWaveform()
                };
            }
        } else {
            payload = { audio: await fs.readFile(inputPath), mimetype: "audio/mpeg", ptt: false };
        }

        // Send Audio First
        await conn.sendMessage(channel.jid, payload);

        // Send Caption Text Second
        const caption =
            `*${title}*\n` +
            (author ? `*Artist:* ${author}\n` : ``) +
            `━━━━━━━•────────────────\n` +
            `⇆   ◁   ❚❚   ▷   ↻\n` +
            `*𝁟𝗦𝗽⃯𝘂𝘁𝗶𝗳𝘆🧑🏼🩰🎶*`;
        await conn.sendMessage(channel.jid, { text: caption.trim() });

        await react("✅");
        await sendReply(`✅ Successfully sent *${title}* to the channel!`);

    } catch (e) {
        console.error("[csong] Error:", e.message);
        await react("❌");
        await sendReply("❌ Error: " + e.message);
    } finally {
        if (msgId) activeCsongRequests.delete(msgId);
        await fs.remove(inputPath).catch(() => {});
        await fs.remove(outputPath).catch(() => {});
    }
}

cmd({
    pattern: "csong",
    alias: ["channelsong", "songchannel", "cvoice"],
    desc: "Send a song to a WhatsApp Channel",
    category: "download",
    react: "🎶",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix, reply }) => {
    await handleCsongExecution(conn, mek, m, { from, q, text: q, prefix, reply });
});

module.exports = {
    name: "csong",
    aliases: ["channelsong", "songchannel", "cvoice"],
    category: "download",
    async execute(conn, m, { text, prefix }) {
        await handleCsongExecution(conn, m, m, { from: m.chat, q: text, text, prefix, reply: m.reply?.bind(m) });
    }
};
