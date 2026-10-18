// CSONG - Send a song as audio/voice note to a WhatsApp Channel or Chat
// Ported to NICK MINI BOT / Pookimdtest plugin system.

const axios = require("axios");
const { execFile } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const util = require("util");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const yts = require("yt-search");

const config = require("../config");
const { cmd } = require("../command");

const execFilePromise = util.promisify(execFile);

// ───────────────────────── ffmpeg helpers ─────────────────────────
let ffmpegStaticPath = null;
try { ffmpegStaticPath = require("ffmpeg-static"); } catch (e) { /* optional */ }

let cachedFfmpeg = null;
async function getFfmpeg() {
    if (cachedFfmpeg) return cachedFfmpeg;
    const candidates = [
        ffmpegStaticPath,
        process.env.FFMPEG_PATH,
        "ffmpeg",
        "/usr/bin/ffmpeg",
        "/usr/local/bin/ffmpeg"
    ].filter(Boolean);

    for (const bin of candidates) {
        try {
            if (path.isAbsolute(bin) && await fs.pathExists(bin)) await fs.chmod(bin, 0o755).catch(() => { });
            await execFilePromise(bin, ["-version"], { timeout: 10000 });
            cachedFfmpeg = bin;
            return bin;
        } catch (e) { /* try next candidate */ }
    }
    throw new Error("FFmpeg is required for audio conversion but could not be found.");
}

async function runFfmpeg(args) {
    const bin = await getFfmpeg();
    const { stderr } = await execFilePromise(bin, args, { maxBuffer: 1024 * 1024 * 20, timeout: 120000 });
    return stderr || "";
}

function parseSeconds(stderr) {
    const times = [...String(stderr).matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
    if (!times.length) return 0;
    const t = times[times.length - 1];
    return Math.round(+t[1] * 3600 + +t[2] * 60 + parseFloat(t[3]));
}

// ───────────────────────── small helpers ─────────────────────────
function getYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

async function resolveChannelJid(conn, input) {
    if (!input) return null;
    const cleanInput = input.trim();

    if (cleanInput.endsWith("@newsletter")) return cleanInput;
    if (/^\d{10,}$/.test(cleanInput)) return `${cleanInput}@newsletter`;

    const match = cleanInput.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
        try {
            if (typeof conn.newsletterMetadata === "function") {
                const res = await conn.newsletterMetadata("invite", match[1]);
                if (res && res.id) return res.id;
            }
        } catch (err) {
            console.error("[csong] Failed to resolve channel JID:", err.message);
        }
    }
    return null;
}

async function downloadQuotedMedia(quoted) {
    const msg = quoted.msg || quoted;
    const mime = msg.mimetype || "";
    let kind;
    if (quoted.type === "documentMessage") kind = "document";
    else if (quoted.type === "videoMessage" || quoted.type === "ptvMessage") kind = "video";
    else if (quoted.type === "audioMessage") kind = "audio";
    else kind = mime.startsWith("video") ? "video" : "audio";

    const stream = await downloadContentFromMessage(msg, kind);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

function authorName(author) {
    return typeof author === "object" ? (author?.name || "") : (author || "");
}

async function searchSong(query) {
    try {
        const { data: searchRes } = await axios.get(
            `https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(query)}`,
            { timeout: 15000 }
        );
        if (searchRes?.results?.length) {
            const item = searchRes.results[0];
            const url = item.url || (item.videoId ? `https://www.youtube.com/watch?v=${item.videoId}` : null);
            if (url) return { url, title: item.title, duration: item.duration, author: authorName(item.author) };
        }
    } catch (err) { /* fall through */ }

    try {
        const res = await yts(query);
        const v = res?.videos?.[0];
        if (v) return { url: v.url, title: v.title, duration: v.timestamp, author: v.author?.name || "" };
    } catch (err) { /* nothing found */ }
    return null;
}

async function getAudioDownload(videoUrl) {
    const headers = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" };
    try {
        const { data } = await axios.get(
            `https://xenosirapis.zone.id/api/ytmp3dl?url=${encodeURIComponent(videoUrl)}`,
            { headers, timeout: 30000 }
        );
        if (data?.success && data?.downloadUrl) return { url: data.downloadUrl, title: data.title };
    } catch (err) { /* try next */ }

    try {
        const { data } = await axios.get(
            `https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`,
            { headers, timeout: 20000 }
        );
        if (data?.download) return { url: data.download, title: data.title };
    } catch (err) { /* no more fallbacks */ }

    return null;
}

// ───────────────────────── command definition ─────────────────────────
const activeCsongRequests = new Set();

cmd({
    pattern: "csong",
    alias: ["channelsong", "songchannel"],
    desc: "Send a song as an audio track directly to a WhatsApp Channel",
    category: "download",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix, reply }) => {
    const p = prefix || ".";
    const msgId = mek.key?.id;
    if (msgId) {
        if (activeCsongRequests.has(msgId)) return;
        activeCsongRequests.add(msgId);
        setTimeout(() => activeCsongRequests.delete(msgId), 30000);
    }

    const text = (q || "").trim();
    const quoted = m.quoted ? m.quoted : null;
    const quotedMime = quoted ? ((quoted.msg || quoted).mimetype || "") : "";
    const isQuotedAudio = /audio|video/.test(quotedMime);

    if (!text && !isQuotedAudio) {
        return await reply(
            `*CSONG COMMAND USAGE*\n\n` +
            `Send songs directly to a WhatsApp Channel.\n\n` +
            `*Format:* ${p}csong <Channel Link> , <Song Name or YT URL>\n` +
            `*Example:* ${p}csong https://whatsapp.com/channel/0029VaXXXXXX , Faded`
        );
    }

    let channelInput = "";
    let songQuery = "";

    if (isQuotedAudio) {
        channelInput = text;
        songQuery = "Quoted Audio";
    } else if (text.includes(",") || text.includes("|")) {
        const parts = text.split(/[,|]/);
        channelInput = parts[0].trim();
        songQuery = parts.slice(1).join(",").trim();
    } else {
        const parts = text.split(/\s+/);
        channelInput = parts[0].trim();
        songQuery = parts.slice(1).join(" ").trim();
    }

    if (!channelInput || (!songQuery && !isQuotedAudio)) {
        return await reply(`Invalid format! Provide both a Channel Link and Song Name.`);
    }

    const tmpDir = path.join(process.cwd(), "tmp");
    await fs.ensureDir(tmpDir);

    const uniqueId = crypto.randomBytes(6).toString("hex");
    const inputPath = path.join(tmpDir, `csong_in_${uniqueId}.mp3`);
    let outputPath = path.join(tmpDir, `csong_out_${uniqueId}.opus`);

    try {
        await conn.sendMessage(from, { react: { text: "🔍", key: mek.key } });

        const channelJid = await resolveChannelJid(conn, channelInput);
        if (!channelJid) {
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            return await reply("Invalid WhatsApp channel link.");
        }

        let videoUrl, title, duration, author;

        if (isQuotedAudio) {
            await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });
            const mediaBuffer = await downloadQuotedMedia(quoted);
            if (!mediaBuffer || !mediaBuffer.length) throw new Error("Failed to download quoted media message.");
            await fs.writeFile(inputPath, mediaBuffer);
            title = (quoted.msg || quoted).fileName || "Quoted Audio";
        } else {
            const ytId = getYouTubeId(songQuery);
            let info = null;

            if (ytId) {
                videoUrl = `https://www.youtube.com/watch?v=${ytId}`;
                try { info = await searchSong(videoUrl); } catch (err) {}
            } else {
                info = await searchSong(songQuery);
                if (!info) throw new Error("No search results found for: " + songQuery);
                videoUrl = info.url;
            }

            title = info?.title || "YouTube Audio";
            duration = info?.duration || "";
            author = info?.author || "";

            await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });

            const dl = await getAudioDownload(videoUrl);
            if (!dl?.url) throw new Error("Failed to download song audio.");
            if (dl.title && dl.title !== "YouTube Audio") title = dl.title;

            const response = await axios({
                method: "get",
                url: dl.url,
                responseType: "stream",
                timeout: 30000
            });
            await pipeline(response.data, fs.createWriteStream(inputPath));
        }

        await conn.sendMessage(from, { react: { text: "🎙️", key: mek.key } });

        const safeTitle = (title || "Audio").replace(/["'$`\\]/g, "");
        const safeArtist = (config.botName || "Mini Bot").replace(/["'$`\\]/g, "");
        const isNewsletter = channelJid.endsWith("@newsletter");

        // Format conversion settings based on destination type (Newsletter channels need AAC/m4a format)
        let baseArgs;
        if (isNewsletter) {
            outputPath = path.join(tmpDir, `csong_out_${uniqueId}.m4a`);
            baseArgs = [
                "-y", "-i", inputPath, "-vn",
                "-c:a", "aac", "-b:a", "128k",
                "-metadata", `title=${safeTitle}`,
                "-metadata", `artist=${safeArtist}`
            ];
        } else {
            baseArgs = [
                "-y", "-i", inputPath, "-vn",
                "-c:a", "libopus", "-b:a", "48k", "-ac", "1", "-ar", "48000",
                "-metadata", `title=${safeTitle}`,
                "-metadata", `artist=${safeArtist}`
            ];
        }

        const stderr = await runFfmpeg([...baseArgs, outputPath]);
        const seconds = parseSeconds(stderr) || Math.max(1, Math.round((await fs.stat(outputPath)).size / 6000));

        const audioBuffer = await fs.readFile(outputPath);
        if (!audioBuffer || audioBuffer.length < 1000) throw new Error("Audio conversion buffer is empty.");

        // Dispatch correctly according to channel rules (ptt: false for channels)
        const channelVoiceMsg = await conn.sendMessage(channelJid, {
            audio: audioBuffer,
            mimetype: isNewsletter ? "audio/mp4" : "audio/ogg; codecs=opus",
            ptt: !isNewsletter,
            seconds
        });

        if (!channelVoiceMsg) throw new Error("Audio was not accepted by the target channel.");

        await new Promise(r => setTimeout(r, 1000));
        await conn.sendMessage(channelJid, { text: `🎵 *${title}*` }, { quoted: channelVoiceMsg }).catch(async () => {
            await conn.sendMessage(channelJid, { text: `🎵 *${title}*` });
        });

        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
        await reply(
            `*DONE SENT TO CHANNEL* 🎀✨\n\n` +
            `*Title:* ${title}\n` +
            (author ? `*Artist:* ${author}\n` : ``) +
            `*Channel JID:* ${channelJid}\n` +
            `*Format:* ${isNewsletter ? "Audio Track (AAC/MP4)" : "Voice Note (OPUS)"}`
        );

    } catch (e) {
        console.error("[csong] Error:", e.message);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } }).catch(() => {});
        await reply("Error: " + e.message);
    } finally {
        if (await fs.pathExists(inputPath)) await fs.remove(inputPath).catch(() => {});
        if (await fs.pathExists(outputPath)) await fs.remove(outputPath).catch(() => {});
    }
});
