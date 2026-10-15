// Dev Xeno Exe - NICK XD MD Handler
const axios = require("axios");
const { execFile } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const util = require("util");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const execFilePromise = util.promisify(execFile);
const { downloadContentFromMessage } = require("@whiskeysockets/baileys");
const ffmpegPath = require("ffmpeg-static");
const yts = require("yt-search");

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


async function downloadQuotedMedia(quoted) {
    const msg = quoted.msg || quoted;
    const type = quoted.type === "videoMessage" ? "video" : "audio";
    const stream = await downloadContentFromMessage(msg, type);
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
}

async function searchYouTube(query) {
    // 1) YouTube URL given -> use it directly
    const ytId = getYouTubeId(query);
    if (ytId) {
        try {
            const v = await yts({ videoId: ytId });
            return { url: `https://youtu.be/${ytId}`, title: v?.title, duration: v?.timestamp, author: v?.author?.name };
        } catch {
            return { url: `https://youtu.be/${ytId}` };
        }
    }
    // 2) external search API (may be down / return empty)
    try {
        const { data } = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(query)}`, { timeout: 8000 });
        const item = data?.results?.[0];
        if (item?.url) {
            return {
                url: item.url,
                title: item.title,
                duration: item.duration,
                author: typeof item.author === "object" ? item.author?.name : item.author
            };
        }
    } catch (err) {
        console.error("ytsearch API failed:", err.message);
    }
    // 3) yt-search fallback (also used when the API returns no results)
    const res = await yts(query);
    const v = res.videos?.[0];
    if (!v) throw new Error("No search results found for: " + query);
    return { url: v.url, title: v.title, duration: v.timestamp, author: v.author?.name };
}

async function getAudioDownloadUrl(videoUrl) {
    const providers = [
        async () => {
            const { data } = await axios.get(`https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`, { timeout: 15000 });
            return { url: data?.download, title: data?.title };
        },
        async () => {
            const { data } = await axios.get(`https://api.dreaded.site/api/ytdl/video?url=${encodeURIComponent(videoUrl)}`, { timeout: 15000 });
            return { url: data?.result?.download?.url || data?.download };
        }
    ];
    for (const provider of providers) {
        try {
            const r = await provider();
            if (r?.url) return r;
        } catch (err) {
            console.error("Download provider failed:", err.message);
        }
    }
    throw new Error("Failed to retrieve downloadable audio URL from servers.");
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
        channelInput = (q || "").trim().split(/[\s,|]+/)[0] || "";
        songQuery = "Quoted Audio";
    } else {
        // Accepts: "<link> , song", "<link>, song", "<link>,song", "<link> song"
        const mm = q.trim().match(/^([^\s,|]+)\s*[,|]?\s*([\s\S]*)$/);
        channelInput = mm ? mm[1].trim() : "";
        songQuery = mm ? mm[2].trim() : "";
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
            const mediaBuffer = await downloadQuotedMedia(quoted);
            if (!mediaBuffer) throw new Error("Failed to download quoted media message.");
            await fs.writeFile(inputPath, mediaBuffer);
            title = quoted.filename || "Quoted Audio";
        } else {
            const found = await searchYouTube(songQuery);
            videoUrl = found.url;
            title = found.title;
            duration = found.duration;
            author = found.author;

            await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });

            const dl = await getAudioDownloadUrl(videoUrl);
            if (dl.title && dl.title !== "YouTube Audio") title = dl.title;

            const response = await axios({
                method: "get",
                url: dl.url,
                responseType: "stream",
                timeout: 30000,
                maxContentLength: 100 * 1024 * 1024
            });
            const ctype = String(response.headers?.["content-type"] || "");
            if (/text\/html|application\/json/i.test(ctype)) {
                throw new Error("Download server returned an invalid (non-audio) response.");
            }
            await pipeline(response.data, fs.createWriteStream(inputPath));
        }

        const inStat = await fs.stat(inputPath).catch(() => null);
        if (!inStat || inStat.size < 1024) throw new Error("Downloaded audio file is empty or invalid.");

        await conn.sendMessage(from, { react: { text: "🎙️", key: mek.key } });

        const ffBin = ffmpegPath || "ffmpeg";
        let voiceBuffer;
        let isOpusConverted = false;

        try {
            await execFilePromise(ffBin, [
                "-y", "-i", inputPath, "-vn",
                "-c:a", "libopus", "-b:a", "48k", "-ar", "48000", "-ac", "1",
                "-application", "voip", "-f", "ogg", outputPath
            ], { timeout: 120000, maxBuffer: 10 * 1024 * 1024 });
            const outStat = await fs.stat(outputPath).catch(() => null);
            if (outStat && outStat.size > 0) {
                voiceBuffer = await fs.readFile(outputPath);
                isOpusConverted = true;
            }
        } catch (err) {
            console.error("FFmpeg execution error:", err.message);
        }

        if (!isOpusConverted) {
            // Raw fallback: only valid as normal audio (PTT requires opus/ogg)
            voiceBuffer = await fs.readFile(inputPath);
        }

        const waveformData = createStylishWaveform(64);

        // Send Voice Note to WhatsApp Channel (Newsletter)
        const channelVoiceMsg = await conn.sendMessage(channelJid, {
            audio: voiceBuffer,
            mimetype: isOpusConverted ? "audio/ogg; codecs=opus" : "audio/mpeg",
            ptt: isOpusConverted,
            ...(isOpusConverted ? { waveform: waveformData } : {})
        });

        // Follow-up caption card (non-fatal: audio is already delivered)
        if (channelVoiceMsg) {
            try {
                const channelCaption =
                    `🎧 *${title}*\n` +
                    (author ? `👤 *Artist:* ${author}\n` : ``) +
                    (duration ? `⏱️ *Duration:* ${duration}\n` : ``) +
                    `━━━━━━━•────────────────\n` +
                    `⇆   ◁   ❚❚   ▷   ↻\n` +
                    `✨ *𝁟𝗟𝗲𝘃𝗶͢𝗮𝗻𝗼 𝗔𝘂𝗱𝗶𝗼𝘀🫟🐦‍🔥🎶*`;
                await conn.sendMessage(channelJid, { text: channelCaption.trim() });
            } catch (err) {
                console.error("Channel caption send failed:", err.message);
            }
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
