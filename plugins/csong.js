// Dev Xeno Exe - NICK XD MD Handler
const axios = require("axios");
const { exec, execFile } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const util = require("util");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const execPromise = util.promisify(exec);
const execFilePromise = util.promisify(execFile);
let ffmpegStaticPath = null;
try { ffmpegStaticPath = require("ffmpeg-static"); } catch (e) { /* optional */ }

// Find a working ffmpeg: bundled binary first, then system ffmpeg
let cachedFfmpeg = null;
async function getFfmpeg() {
    if (cachedFfmpeg) return cachedFfmpeg;
    const candidates = [ffmpegStaticPath, process.env.FFMPEG_PATH, "ffmpeg", "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"].filter(Boolean);
    for (const bin of candidates) {
        try {
            if (path.isAbsolute(bin) && await fs.pathExists(bin)) await fs.chmod(bin, 0o755).catch(() => { });
            await execFilePromise(bin, ["-version"], { timeout: 10000 });
            cachedFfmpeg = bin;
            console.log("[csong] Using ffmpeg:", bin);
            return bin;
        } catch (e) { /* try next */ }
    }
    throw new Error("ffmpeg not found. Run npm install (ffmpeg-static) or set FFMPEG_PATH.");
}

// Run ffmpeg without shell (safe paths with spaces); returns stderr text
async function runFfmpeg(args) {
    const bin = await getFfmpeg();
    const { stderr } = await execFilePromise(bin, args, { maxBuffer: 1024 * 1024 * 20, timeout: 120000 });
    return stderr || "";
}
const yts = require("yt-search");

const config = require("../config");
const { cmd } = require("../command");

function getYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
}

/**
 * Generates dynamic audio waveform data for WhatsApp voice notes.
 */
function createStylishWaveform(length = 64) {
    const waveform = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        const progress = i / length;
        const envelope = Math.sin(progress * Math.PI);
        const beats = Math.abs(Math.sin(i * 0.35) * Math.cos(i * 0.15));
        const randomNoise = (Math.random() * 0.2);
        const height = Math.floor((envelope * 0.5 + beats * 0.4 + randomNoise * 0.1) * 95) + 5;
        waveform[i] = Math.min(100, Math.max(5, height));
    }
    return Buffer.from(waveform);
}

async function resolveChannelJid(conn, input) {
    if (!input) return null;
    let cleanInput = input.trim();

    if (cleanInput.endsWith("@newsletter")) {
        return cleanInput;
    }
    if (/^\d{10,}$/.test(cleanInput)) {
        return `${cleanInput}@newsletter`;
    }

    const match = cleanInput.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
        const inviteCode = match[1];
        try {
            if (typeof conn.newsletterMetadata === "function") {
                const res = await conn.newsletterMetadata("invite", inviteCode);
                if (res && res.id) {
                    return res.id;
                }
            }
        } catch (err) {
            console.error("Failed to resolve channel JID:", err.message);
        }
    }

    return null;
}

const activeCsongRequests = new Set();

cmd({
    pattern: "csong",
    alias: ["channelsong", "songchannel"],
    desc: "Send audio/song to WhatsApp Channel with waveforms",
    category: "download",
    react: "🎶",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix, reply }) => {
    const msgId = mek.key?.id;
    if (msgId) {
        if (activeCsongRequests.has(msgId)) return;
        activeCsongRequests.add(msgId);
        setTimeout(() => activeCsongRequests.delete(msgId), 30000);
    }

    const quoted = m.quoted ? m.quoted : null;
    const quotedMime = quoted ? ((quoted.msg || quoted).mimetype || "") : "";
    const isQuotedAudio = /audio|video/.test(quotedMime);

    if (!q && !isQuotedAudio) {
        return await reply(
            `𝁟𝗟𝗲𝘃𝗶͢𝗮𝗻𝗼 𝗔𝘂𝗱𝗶𝗼𝘀🫟🐦‍🔥🎶\n\n` +
            `Send stylish songs with audio waves directly to a WhatsApp Channel.\n\n` +
            `*Format 1 (Search/URL):*\n${prefix || '.'}csong <Channel Link> , <Song Name or YT URL>\n\n` +
            `*Format 2 (Reply Audio):*\nReply to audio message with ${prefix || '.'}csong <Channel Link>\n\n` +
            `*Example:*\n${prefix || '.'}csong https://whatsapp.com/channel/0029VaXXXXXX , Faded`
        );
    }

    let channelInput = "";
    let songQuery = "";

    if (isQuotedAudio) {
        channelInput = (q || "").trim();
        songQuery = "Quoted Audio";
    } else {
        if (q.includes(",") || q.includes("|")) {
            const parts = q.split(/[,|]/);
            channelInput = parts[0].trim();
            songQuery = parts.slice(1).join(",").trim();
        } else {
            const parts = q.trim().split(/\s+/);
            channelInput = parts[0].trim();
            songQuery = parts.slice(1).join(" ").trim();
        }
    }

    if (!channelInput || (!songQuery && !isQuotedAudio)) {
        return await reply(
            `Invalid format!\n\n` +
            `Please provide both Channel Link and Song Name (or reply to an audio message).\n` +
            `*Example:* ${prefix || '.'}csong https://whatsapp.com/channel/0029VaXXXXXX , Faded`
        );
    }

    const tmpDir = path.join(process.cwd(), 'tmp');
    await fs.ensureDir(tmpDir);

    const uniqueId = crypto.randomBytes(6).toString('hex');
    const inputPath = path.join(tmpDir, `csong_in_${uniqueId}.mp3`);
    const outputPath = path.join(tmpDir, `csong_vn_${uniqueId}.opus`);

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
            const mediaBuffer = await quoted.download();
            if (!mediaBuffer) throw new Error("Failed to download quoted media message.");
            await fs.writeFile(inputPath, mediaBuffer);
            title = quoted.filename || "Quoted Audio";
        } else {
            const ytId = getYouTubeId(songQuery);

            try {
                const { data: searchRes } = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(songQuery)}`, { timeout: 8000 });
                if (searchRes.results?.length) {
                    const searchItem = searchRes.results[0];
                    videoUrl = searchItem.url;
                    title = searchItem.title;
                    duration = searchItem.duration;
                    author = typeof searchItem.author === 'object' ? searchItem.author?.name : searchItem.author;
                }
            } catch (err) {
                const searchRes = await yts(songQuery);
                const searchItem = searchRes.videos?.[0];
                if (!searchItem) throw new Error("No search results found for: " + songQuery);
                videoUrl = searchItem.url;
                title = searchItem.title;
                duration = searchItem.timestamp;
                author = searchItem.author?.name;
            }

            if (!videoUrl) throw new Error("Could not extract a valid YouTube video URL.");

            await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });

            let downloadUrl;
            try {
                const { data: downloadRes } = await axios.get(`https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`, { timeout: 15000 });
                downloadUrl = downloadRes?.download;
                if (downloadRes?.title && downloadRes.title !== "YouTube Audio") {
                    title = downloadRes.title;
                }
            } catch (err) {
                const { data: downloadRes } = await axios.get(`https://api.dreaded.site/api/ytdl/video?url=${encodeURIComponent(videoUrl)}`, { timeout: 15000 });
                downloadUrl = downloadRes?.result?.download?.url || downloadRes?.download;
            }

            if (!downloadUrl) {
                throw new Error("Failed to retrieve downloadable audio URL from servers.");
            }

            const response = await axios({
                method: 'get',
                url: downloadUrl,
                responseType: 'stream',
                timeout: 30000
            });
            await pipeline(response.data, fs.createWriteStream(inputPath));
        }

        await conn.sendMessage(from, { react: { text: "🎙️", key: mek.key } });

        // Convert to OGG/Opus mono 48kHz (the only format WhatsApp accepts for PTT voice notes)
        const baseArgs = ["-y", "-i", inputPath, "-vn", "-map_metadata", "-1", "-ar", "48000", "-ac", "1", "-b:a", "48k"];
        const encoders = [
            ["-c:a", "libopus", "-application", "voip"],
            ["-c:a", "libopus"],
            ["-c:a", "opus", "-strict", "-2"]   // built-in encoder fallback
        ];

        let voiceBuffer;
        let seconds = 0;
        let lastErr;

        for (const enc of encoders) {
            try {
                await fs.remove(outputPath).catch(() => { });
                const stderr = await runFfmpeg([...baseArgs, ...enc, "-f", "ogg", outputPath]);
                const times = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
                if (times.length) {
                    const t = times[times.length - 1];
                    seconds = Math.round(+t[1] * 3600 + +t[2] * 60 + parseFloat(t[3]));
                }
                lastErr = null;
                break;
            } catch (err) {
                lastErr = err;
                console.error("[csong] FFmpeg attempt failed:", (err.stderr || err.message || "").toString().slice(-300));
            }
        }
        if (lastErr) throw new Error("Audio conversion failed: " + (lastErr.message || "").split("\n")[0]);

        if (!(await fs.pathExists(outputPath))) throw new Error("Converted voice note file not found.");
        voiceBuffer = await fs.readFile(outputPath);
        if (!voiceBuffer || voiceBuffer.length < 1000) throw new Error("Converted voice note is empty.");
        if (!seconds || seconds < 1) seconds = Math.max(1, Math.round(voiceBuffer.length / 6000)); // ~48kbps estimate

        const waveformData = createStylishWaveform(64);

        // Send Voice Note to WhatsApp Channel (Newsletter)
        // `seconds` MUST be given explicitly, otherwise the channel shows nothing / 0:00
        // because Baileys cannot read the duration without music-metadata.
        let channelVoiceMsg;
        try {
            channelVoiceMsg = await conn.sendMessage(channelJid, {
                audio: voiceBuffer,
                mimetype: "audio/ogg; codecs=opus",
                ptt: true,
                seconds,
                waveform: waveformData
            });
        } catch (err) {
            console.error("PTT send failed, retrying without waveform:", err.message);
            channelVoiceMsg = await conn.sendMessage(channelJid, {
                audio: voiceBuffer,
                mimetype: "audio/ogg; codecs=opus",
                ptt: true,
                seconds
            });
        }
        if (!channelVoiceMsg) throw new Error("Voice note was not accepted by the channel.");

        // Small delay so the voice note lands before the title card
        await new Promise(r => setTimeout(r, 1500));

        // Send follow-up caption card in channel
        if (channelVoiceMsg) {
            const channelCaption =
                `🎧 *${title}*\n` +
                (author ? `👤 *Artist:* ${author}\n` : ``) +
                (duration ? `⏱️ *Duration:* ${duration}\n` : ``) +
                `━━━━━━━•────────────────\n` +
                `⇆   ◁   ❚❚   ▷   ↻\n` +
                `✨ *𝁟𝗟𝗲𝘃𝗶͢𝗮𝗻𝗼 𝗔𝘂𝗱𝗶𝗼𝘀🫟🐦‍🔥🎶*`;

            await conn.sendMessage(channelJid, {
                text: channelCaption.trim()
            });
        }

        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

        const chatDetailsText =
            `✨ *𝁟𝗟𝗲𝘃𝗶͢𝗮𝗻𝗼 𝗔𝘂𝗱𝗶𝗼𝘀🫟🐦‍🔥🎶* ✨\n\n` +
            `╭─────────────────────────┈💬\n` +
            `│ 🎵 *Title:* ${title || songQuery}\n` +
            (author ? `│ 👤 *Artist:* ${author}\n` : ``) +
            (duration ? `│ ⏱️ *Duration:* ${duration}\n` : ``) +
            (videoUrl ? `│ 🔗 *URL:* ${videoUrl}\n` : ``) +
            `│ 📢 *Channel:* ${channelJid}\n` +
            `│ 🎙️ *Waves:* Enabled (Voice Note)\n` +
            `╰─────────────────────────┈💬\n\n` +
            `━━━━━━━•────────────────\n` +
            `⇆   ◁   ❚❚   ▷   ↻`;

        await conn.sendMessage(from, { text: chatDetailsText }, { quoted: mek });

    } catch (e) {
        console.error("Csong Error:", e.message);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
        await reply("Error sending audio to channel: " + e.message);
    } finally {
        if (await fs.pathExists(inputPath)) await fs.remove(inputPath).catch(() => { });
        if (await fs.pathExists(outputPath)) await fs.remove(outputPath).catch(() => { });
    }
});
