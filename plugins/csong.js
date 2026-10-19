// .csong <WhatsApp Channel Link> <Song Name> [ptt]
// Dev Xeno Exe

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
                console.log("[csong] Using ffmpeg:", bin);
                return bin;
            }
        } catch (e) {}
    }
    cachedFfmpegBin = null;
    console.warn("[csong] No working FFmpeg found — ptt mode unavailable");
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

// Returns { inviteCode, songQuery, ptt } or { error }
function parseCsongArgs(raw) {
    const tokens = String(raw || "").trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return { error: "empty" };

    const link = tokens[0].replace(/[,|]+$/, "");
    const m = link.match(CHANNEL_LINK_RE);
    if (!m) return { error: "link" };

    let rest = tokens.slice(1);
    let ptt = false;
    // "ptt" is a mode flag only when a song name remains in front of it
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

// Uses ONLY Baileys' newsletterMetadata(). Never guesses or scrapes an ID.
async function resolveChannel(conn, inviteCode) {
    if (typeof conn.newsletterMetadata !== "function") {
        return { error: "This Baileys version does not support newsletterMetadata(); cannot resolve channel links." };
    }

    let meta;
    try {
        meta = await conn.newsletterMetadata("invite", inviteCode);
    } catch (err) {
        console.warn("[csong] newsletterMetadata(invite) failed:", err.message);
        return { error: "Could not resolve that channel link. Check that the link is correct and the channel exists." };
    }

    const id = meta?.id;
    if (!id || !String(id).endsWith("@newsletter")) {
        return { error: "Could not resolve that channel link to a valid channel." };
    }

    let role = readViewerRole(meta);
    let name = meta?.name || meta?.thread_metadata?.name?.text || "";

    // Invite lookups may omit viewer info; ask again by JID and make sure it is the same channel.
    if (!role) {
        try {
            const byJid = await conn.newsletterMetadata("jid", id);
            if (byJid?.id && byJid.id !== id) {
                return { error: "Channel lookup returned inconsistent IDs; refusing to publish." };
            }
            role = readViewerRole(byJid);
            name = name || byJid?.name || byJid?.thread_metadata?.name?.text || "";
        } catch (err) {
            console.warn("[csong] newsletterMetadata(jid) failed:", err.message);
        }
    }

    if (role && role !== "OWNER" && role !== "ADMIN") {
        return { error: `The bot is not an admin of this channel${name ? ` (${name})` : ""} (role: ${role}). Add the bot as channel admin first.` };
    }
    if (!role) console.warn("[csong] Could not read bot's role on", id, "- will rely on send result.");

    return { jid: id, name, role };
}

/* ───────────────────────── Search / download ───────────────────────── */

async function ytSearch(q) {
    const { data } = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(q)}`, {
        headers: { "User-Agent": UA },
        timeout: 15000
    });
    return data;
}

function normaliseItem(item, fallbackTitle) {
    const videoId = item.videoId || item.id || extractYouTubeId(item.url || "");
    const url = item.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
    return {
        url,
        title: item.title || fallbackTitle,
        duration: item.duration || item.timestamp || "",
        author: typeof item.author === "object" ? (item.author?.name || "") : (item.author || item.channel || "")
    };
}

async function findSong(songQuery) {
    const ytId = extractYouTubeId(songQuery);
    if (ytId) {
        const videoUrl = `https://www.youtube.com/watch?v=${ytId}`;
        let searchItem = null;
        try {
            const searchRes = await ytSearch(videoUrl);
            if (searchRes.results?.length) searchItem = searchRes.results[0];
        } catch (err) {}
        const info = searchItem ? normaliseItem(searchItem, songQuery) : { title: songQuery, duration: "", author: "" };
        return { ...info, url: videoUrl };
    }

    const searchRes = await ytSearch(songQuery);
    if (!searchRes.results?.length) throw new Error("No search results for: " + songQuery);
    const info = normaliseItem(searchRes.results[0], songQuery);
    if (!info.url) throw new Error("Search result had no usable URL for: " + songQuery);
    return info;
}

async function fetchAudioDownloadUrl(videoUrl) {
    const providers = [
        async () => {
            const { data } = await axios.get(`https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`, { headers: { "User-Agent": UA }, timeout: 20000 });
            if (data?.download && typeof data.download === "string")
                return { downloadUrl: data.download, title: data.title && data.title !== "YouTube Audio" ? data.title : null };
        },
        async () => {
            const { data } = await axios.get(`https://xenosirapis.zone.id/api/ytmp3dl?url=${encodeURIComponent(videoUrl)}`, { headers: { "User-Agent": UA }, timeout: 25000 });
            if (data?.success && data.downloadUrl) return { downloadUrl: data.downloadUrl, title: data.title ? data.title.trim() : null };
        },
        async () => {
            const { data } = await axios.get(`https://jerrycoder.oggyapi.workers.dev/down/ytmp3-v1?url=${encodeURIComponent(videoUrl)}`, { headers: { "User-Agent": UA }, timeout: 25000 });
            const r = data?.result || data?.data || data;
            const dl = r?.download || r?.downloadURL || r?.download_url || r?.url || r?.dl_url;
            if (dl && typeof dl === "string") return { downloadUrl: dl, title: r?.title?.trim() || null };
        }
    ];
    for (const p of providers) {
        try {
            const r = await p();
            if (r) return r;
        } catch (e) {}
    }
    throw new Error("Unable to obtain a download URL from the audio servers.");
}

async function downloadToFile(url, dest) {
    const res = await axios({
        method: "get", url, responseType: "stream", timeout: 45000,
        maxContentLength: MAX_AUDIO_BYTES, headers: { "User-Agent": UA, Accept: "*/*" }
    });
    const ctype = String(res.headers?.["content-type"] || "").toLowerCase();
    if (ctype.includes("text/html") || ctype.includes("json")) {
        res.data.destroy();
        throw new Error("Download server returned a web page instead of audio.");
    }
    await pipeline(res.data, fs.createWriteStream(dest));
}

// Confirms the file is really audio and not an error page / empty file.
async function validateAudioFile(filePath) {
    const stat = await fs.stat(filePath).catch(() => null);
    if (!stat || stat.size < 10 * 1024) throw new Error("Downloaded audio file is empty or too small.");
    if (stat.size > MAX_AUDIO_BYTES) throw new Error("Downloaded audio file is too large.");

    const fh = await fs.open(filePath, "r");
    const head = Buffer.alloc(16);
    await fs.read(fh, head, 0, 16, 0);
    await fs.close(fh);

    const isId3 = head.slice(0, 3).toString() === "ID3";
    const isMpegSync = head[0] === 0xff && (head[1] & 0xe0) === 0xe0;
    const isOgg = head.slice(0, 4).toString() === "OggS";
    const isMp4 = head.slice(4, 8).toString() === "ftyp";
    const isRiff = head.slice(0, 4).toString() === "RIFF";
    const isFlac = head.slice(0, 4).toString() === "fLaC";
    const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    if (!(isId3 || isMpegSync || isOgg || isMp4 || isRiff || isFlac || isWebm)) {
        throw new Error("Downloaded file is not a valid audio file.");
    }
    return stat.size;
}

async function getAudioDuration(filePath) {
    try {
        const mm = require("music-metadata");
        const meta = await mm.parseFile(filePath, { duration: true });
        const d = meta?.format?.duration;
        if (d && d > 0) return Math.round(d);
    } catch (e) {}
    return null;
}

// Real OGG/Opus conversion; returns null if it cannot be produced.
async function convertToOpus(inputPath, outputPath) {
    const ffBin = getFfmpegBinary();
    if (!ffBin) return null;
    for (const codec of ["libopus", "opus"]) {
        try {
            await execFilePromise(ffBin, ["-y", "-i", inputPath, "-vn", "-c:a", codec, "-b:a", "48k", "-ac", "1", "-ar", "48000", outputPath], { timeout: 60000, windowsHide: true });
            if ((await fs.pathExists(outputPath)) && (await fs.stat(outputPath)).size > 0) return outputPath;
        } catch (err) {
            console.warn(`[csong] ffmpeg (${codec}) failed:`, err.message);
        }
    }
    return null;
}

function createVoiceWaveform() {
    const buf = Buffer.alloc(64);
    for (let i = 0; i < 64; i++) {
        const pos = i / 63;
        const envelope = Math.sin(pos * Math.PI) * 0.7 + 0.3;
        const noise = Math.random() * 0.5 + 0.5;
        const beat = i % 4 === 0 ? 1.2 : 1.0;
        buf[i] = Math.min(100, Math.round(envelope * noise * beat * 100));
    }
    return buf;
}

/* ───────────────────────── Command ───────────────────────── */

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

    const usage =
        `*Usage:*\n${p}csong <WhatsApp Channel Link> <Song Name>\n${p}csong <WhatsApp Channel Link> <Song Name> ptt\n\n` +
        `*Example:*\n${p}csong https://whatsapp.com/channel/0029VasHC7oQH Faded\n${p}csong https://whatsapp.com/channel/0029VasHC7oQH Faded ptt`;

    const tmpDir = path.join(process.cwd(), "tmp");
    const uniqueId = crypto.randomBytes(6).toString("hex");
    const inputPath = path.join(tmpDir, `csong_in_${uniqueId}.mp3`);
    const outputPath = path.join(tmpDir, `csong_vn_${uniqueId}.opus`);

    try {
        const parsed = parseCsongArgs(text !== undefined ? text : q);

        if (parsed.error === "empty") return await sendReply(`*ＳＯＮＧ  ＣＨＡＮＮＥＬ  ＳＯＮＧ*\n\n${usage}`);
        if (parsed.error === "link") return await sendReply(`❌ Invalid WhatsApp channel link. It must look like https://whatsapp.com/channel/<code>\n\n${usage}`);

        const quoted = m?.quoted || null;
        const quotedMime = quoted ? ((quoted.msg || quoted).mimetype || "") : "";
        const isQuotedAudio = /audio/.test(quotedMime);

        if (!parsed.songQuery && !isQuotedAudio) return await sendReply(`❌ Please provide a song name after the channel link.\n\n${usage}`);

        const { inviteCode, songQuery, ptt } = parsed;
        await fs.ensureDir(tmpDir);

        await react("🔍");

        // 1. Resolve + validate channel (never falls back to another channel)
        const channel = await resolveChannel(conn, inviteCode);
        if (channel.error) {
            await react("❌");
            return await sendReply("❌ " + channel.error);
        }

        // PTT capability check before doing any heavy work
        if (ptt && !getFfmpegBinary()) {
            await react("❌");
            return await sendReply("❌ PTT mode needs FFmpeg to create an OGG/Opus voice note, and no working FFmpeg was found on this server. Use the command without `ptt` to send a normal audio file.");
        }

        // 2. Search + download
        let title = songQuery || "Quoted Audio";
        let author = "";
        let duration = "";
        let videoUrl = null;

        if (isQuotedAudio && !songQuery) {
            await react("📥");
            const mediaBuffer = await quoted.download();
            if (!mediaBuffer) throw new Error("Failed to download the quoted audio.");
            await fs.writeFile(inputPath, mediaBuffer);
            title = quoted.msg?.fileName || "Quoted Audio";
        } else {
            const song = await findSong(songQuery);
            videoUrl = song.url;
            title = song.title || songQuery;
            author = song.author || "";
            duration = song.duration || "";

            await react("📥");
            const dl = await fetchAudioDownloadUrl(videoUrl);
            if (dl.title) title = dl.title;
            await downloadToFile(dl.downloadUrl, inputPath);
        }

        await validateAudioFile(inputPath);

        // 3. Prepare the audio payload
        await react("🎙️");
        let payload;
        if (ptt) {
            const opusPath = await convertToOpus(inputPath, outputPath);
            if (!opusPath) throw new Error("Could not convert the audio to OGG/Opus for PTT mode.");
            const seconds = (await getAudioDuration(opusPath)) || 30;
            payload = {
                audio: await fs.readFile(opusPath),
                mimetype: "audio/ogg; codecs=opus",
                ptt: true,
                seconds,
                waveform: createVoiceWaveform()
            };
        } else {
            const seconds = (await getAudioDuration(inputPath)) || undefined;
            payload = { audio: await fs.readFile(inputPath), mimetype: "audio/mpeg", ptt: false };
            if (seconds) payload.seconds = seconds;
        }

        // 4. Publish to the resolved channel only
        try {
            await conn.sendMessage(channel.jid, payload);
        } catch (sendErr) {
            console.error("[csong] Channel send failed:", sendErr.message);
            throw new Error(`Failed to publish to the channel: ${sendErr.message}. Make sure the bot is a channel admin.`);
        }

        try {
            const caption =
                `*${title}*\n` +
                (author ? `*Artist:* ${author}\n` : ``) +
                `━━━━━━━•────────────────\n` +
                `⇆   ◁   ❚❚   ▷   ↻\n` +
                `*𝁟𝗦𝗽⃯𝘂𝘁𝗶𝗳𝘆🧑🏼🩰🎶*`;
            await conn.sendMessage(channel.jid, { text: caption.trim() });
        } catch (capErr) {
            console.warn("[csong] Channel caption send failed:", capErr.message);
        }

        // 5. Report success
        await react("✅");
        await sendReply(
            `*ＳＯＮＧ  ＦＯＲＷＡＲＤＥＤ*\n\n` +
            `╭─────────────────────────┈\n` +
            `│ *Title:* ${title}\n` +
            (author ? `│ *Artist:* ${author}\n` : ``) +
            (duration ? `│ *Duration:* ${duration}\n` : ``) +
            (videoUrl ? `│ *URL:* ${videoUrl}\n` : ``) +
            `│ *Channel:* ${channel.name || channel.jid}\n` +
            `│ *Format:* ${ptt ? "Voice Note (PTT)" : "Audio (MP3)"}\n` +
            `╰─────────────────────────┈`
        );
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
    desc: "Send a song to a WhatsApp Channel: .csong <channel link> <song name> [ptt]",
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
    parseCsongArgs,
    async execute(conn, m, { text, prefix }) {
        await handleCsongExecution(conn, m, m, { from: m.chat, q: text, text, prefix, reply: m.reply?.bind(m) });
    }
};
