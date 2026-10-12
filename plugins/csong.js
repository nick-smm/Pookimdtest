// Dev Xeno Exe

const axios = require("axios");
const { exec, spawnSync } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const util = require("util");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const execPromise = util.promisify(exec);
const config = require("../config");
const { cmd } = require("../command");

// Safely detect working FFmpeg binary without freezing
let cachedFfmpegBin = undefined;
function getFfmpegBinary() {
    if (cachedFfmpegBin !== undefined) return cachedFfmpegBin;

    // Check ffmpeg-static
    try {
        const ffmpegStatic = require("ffmpeg-static");
        if (ffmpegStatic && typeof ffmpegStatic === "string" && fs.existsSync(ffmpegStatic)) {
            const res = spawnSync(ffmpegStatic, ["-version"], { timeout: 2000, stdio: "ignore" });
            if (res.status === 0) {
                cachedFfmpegBin = ffmpegStatic;
                return cachedFfmpegBin;
            }
        }
    } catch (e) {}

    // Check system ffmpeg in PATH
    try {
        const res = spawnSync("ffmpeg", ["-version"], { timeout: 2000, stdio: "ignore" });
        if (res.status === 0) {
            cachedFfmpegBin = "ffmpeg";
            return cachedFfmpegBin;
        }
    } catch (e) {}

    cachedFfmpegBin = null;
    return null;
}

function extractYouTubeId(input) {
    if (!input || typeof input !== "string") return null;
    const patterns = [
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const re of patterns) {
        const match = input.trim().match(re);
        if (match) return match[1];
    }
    return null;
}

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

    const match = cleanInput.match(/(?:whatsapp\.com\/channel\/|channel\/)([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
        const inviteCode = match[1];
        try {
            if (typeof conn.newsletterMetadata === "function") {
                const res = await conn.newsletterMetadata("invite", inviteCode);
                const resolvedId = res?.id || res?.jid;
                if (resolvedId) {
                    return resolvedId.endsWith("@newsletter") ? resolvedId : `${resolvedId}@newsletter`;
                }
            }
        } catch (err) {
            console.warn("[csong] newsletterMetadata invite resolution failed:", err.message);
        }

        try {
            if (typeof conn.query === "function") {
                const res = await conn.query({
                    tag: 'iq',
                    attrs: {
                        to: '@newsletter',
                        type: 'get',
                        xmlns: 'newsletter',
                    },
                    content: [{
                        tag: 'newsletter',
                        attrs: {
                            type: 'invite',
                            key: inviteCode
                        }
                    }]
                });
                const newsletterNode = res?.content?.find?.(x => x?.tag === 'newsletter');
                const resolvedId = newsletterNode?.attrs?.id;
                if (resolvedId) {
                    return resolvedId.endsWith("@newsletter") ? resolvedId : `${resolvedId}@newsletter`;
                }
            }
        } catch (err) {
            console.error("[csong] Query failed to resolve channel:", err.message);
        }
    }

    return null;
}

async function searchYouTube(query) {
    // Primary: xenoytserch.vercel.app
    try {
        const { data } = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 15000
        });
        if (data && data.results && data.results.length > 0) {
            const item = data.results[0];
            const videoId = item.videoId || item.id || extractYouTubeId(item.url || '');
            const url = item.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
            if (url) {
                return {
                    url,
                    videoId,
                    title: item.title || query,
                    duration: item.duration || item.timestamp || "",
                    author: typeof item.author === 'object' ? item.author?.name : (item.author || item.channel || "")
                };
            }
        }
    } catch (e) {}

    // Fallback: xenosirapis.zone.id
    try {
        const { data } = await axios.get(`https://xenosirapis.zone.id/api/ytsearch?query=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 20000
        });
        if (data && data.results && data.results.length > 0) {
            const item = data.results[0];
            const videoId = item.videoId || item.id || extractYouTubeId(item.url || '');
            const url = item.url || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : null);
            if (url) {
                return {
                    url,
                    videoId,
                    title: item.title || query,
                    duration: item.duration || item.timestamp || "",
                    author: typeof item.author === 'object' ? item.author?.name : (item.author || item.channel || "")
                };
            }
        }
    } catch (e) {}

    return null;
}

async function fetchAudioDownloadUrl(videoUrl) {
    // Provider 1: xenoytdl-2.vercel.app
    try {
        const { data } = await axios.get(`https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 20000
        });
        const dl = data?.download;
        if (dl && typeof dl === 'string') {
            return {
                downloadUrl: dl,
                title: data.title && data.title !== "YouTube Audio" ? data.title : null
            };
        }
    } catch (e) {}

    // Provider 2: xenosirapis.zone.id
    try {
        const { data } = await axios.get(`https://xenosirapis.zone.id/api/ytmp3dl?url=${encodeURIComponent(videoUrl)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 25000
        });
        if (data && data.success && data.downloadUrl) {
            return {
                downloadUrl: data.downloadUrl,
                title: data.title ? data.title.trim() : null
            };
        }
    } catch (e) {}

    // Provider 3: oggyapi fallback
    try {
        const { data } = await axios.get(`https://jerrycoder.oggyapi.workers.dev/down/ytmp3-v1?url=${encodeURIComponent(videoUrl)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 25000
        });
        const resData = data?.result || data?.data || data;
        const dl = resData?.download || resData?.downloadURL || resData?.download_url || resData?.url || resData?.dl_url;
        if (dl && typeof dl === 'string') {
            return {
                downloadUrl: dl,
                title: resData?.title?.trim() || null
            };
        }
    } catch (e) {}

    throw new Error("Unable to obtain download URL from audio servers.");
}

async function convertToVoiceNote(inputPath, outputPath, title, artist) {
    const ffBin = getFfmpegBinary();
    if (!ffBin) {
        return { success: false, buffer: await fs.readFile(inputPath) };
    }

    const safeTitle = (title || "Audio").replace(/["'$`\\]/g, "");
    const safeArtist = (artist || config.botName || "Spotify").replace(/["'$`\\]/g, "");

    try {
        const cmd1 = `"${ffBin}" -y -i "${inputPath}" -vn -c:a libopus -b:a 48k -ac 1 -ar 48000 -metadata title="${safeTitle}" -metadata artist="${safeArtist}" "${outputPath}"`;
        await execPromise(cmd1, { timeout: 12000, windowsHide: true });
        if (await fs.pathExists(outputPath) && (await fs.stat(outputPath)).size > 0) {
            return { success: true, buffer: await fs.readFile(outputPath) };
        }
    } catch (err1) {
        console.warn("[csong] FFmpeg libopus conversion failed:", err1.message);
    }

    try {
        const cmd2 = `"${ffBin}" -y -i "${inputPath}" -vn -c:a opus -b:a 48k -ac 1 -ar 48000 -metadata title="${safeTitle}" -metadata artist="${safeArtist}" "${outputPath}"`;
        await execPromise(cmd2, { timeout: 12000, windowsHide: true });
        if (await fs.pathExists(outputPath) && (await fs.stat(outputPath)).size > 0) {
            return { success: true, buffer: await fs.readFile(outputPath) };
        }
    } catch (err2) {
        console.warn("[csong] FFmpeg opus fallback failed:", err2.message);
    }

    return { success: false, buffer: await fs.readFile(inputPath) };
}

const activeCsongRequests = new Set();

async function handleCsongExecution(conn, mek, m, { from, q, text, prefix, reply }) {
    const msgId = mek?.key?.id || m?.key?.id;
    if (msgId) {
        if (activeCsongRequests.has(msgId)) return;
        activeCsongRequests.add(msgId);
        setTimeout(() => activeCsongRequests.delete(msgId), 30000);
    }

    const chatJid = m?.chat || from;
    const sendReply = reply || (async (txt) => {
        if (typeof m?.reply === 'function') return await m.reply(txt);
        return await conn.sendMessage(chatJid, { text: txt }, { quoted: mek || m });
    });

    const queryText = (text !== undefined ? text : q) || "";
    const quoted = m?.quoted ? m.quoted : null;
    const quotedMime = quoted ? ((quoted.msg || quoted).mimetype || "") : "";
    const isQuotedAudio = /audio|video/.test(quotedMime);

    if (!queryText && !isQuotedAudio) {
        if (msgId) activeCsongRequests.delete(msgId);
        return await sendReply(
            `*ＳＯＮＧ  ＣＨＡＮＮＥＬ  ＳＯＮＧ*\n\n` +
            `Send songs directly to your WhatsApp Channel.\n\n` +
            `*Format 1 (Search/URL):*\n${prefix || '.'}csong <Channel Link> , <Song Name or YT URL>\n\n` +
            `*Format 2 (Reply Audio):*\nReply to audio with: ${prefix || '.'}csong <Channel Link>\n\n` +
            `*Example:*\n${prefix || '.'}csong https://whatsapp.com/channel/0029VaXXXXXX , Faded`
        );
    }

    let channelInput = "";
    let songQuery = "";

    if (isQuotedAudio) {
        channelInput = (queryText || "").trim();
        songQuery = "Quoted Audio";
    } else {
        let part1 = "";
        let part2 = "";

        if (queryText.includes(",") || queryText.includes("|")) {
            const parts = queryText.split(/[,|]/);
            part1 = parts[0].trim();
            part2 = parts.slice(1).join(",").trim();
        } else {
            const parts = queryText.trim().split(/\s+/);
            part1 = parts[0].trim();
            part2 = parts.slice(1).join(" ").trim();
        }

        const isPart1Channel = /(?:whatsapp\.com\/channel\/|channel\/|@newsletter|^\d{10,}$)/i.test(part1);
        const isPart2Channel = /(?:whatsapp\.com\/channel\/|channel\/|@newsletter|^\d{10,}$)/i.test(part2);

        if (isPart2Channel && !isPart1Channel) {
            channelInput = part2;
            songQuery = part1;
        } else {
            channelInput = part1;
            songQuery = part2;
        }
    }

    if (!channelInput || (!songQuery && !isQuotedAudio)) {
        if (msgId) activeCsongRequests.delete(msgId);
        return await sendReply(
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
        await conn.sendMessage(chatJid, { react: { text: "🔍", key: mek?.key || m?.key } });

        const channelJid = await resolveChannelJid(conn, channelInput);
        if (!channelJid) {
            await conn.sendMessage(chatJid, { react: { text: "❌", key: mek?.key || m?.key } });
            return await sendReply("❌ Invalid WhatsApp channel link or ID. Please check the channel link.");
        }

        let videoUrl = null;
        let title = "Audio Track";
        let duration = "";
        let author = "";

        if (isQuotedAudio) {
            await conn.sendMessage(chatJid, { react: { text: "📥", key: mek?.key || m?.key } });
            const mediaBuffer = await quoted.download();
            if (!mediaBuffer) throw new Error("Failed to download quoted media message.");
            await fs.writeFile(inputPath, mediaBuffer);
            title = quoted.msg?.fileName || "Quoted Audio";
        } else {
            const directId = extractYouTubeId(songQuery);

            if (directId) {
                videoUrl = `https://www.youtube.com/watch?v=${directId}`;
                title = songQuery;
                try {
                    const searchRes = await searchYouTube(videoUrl);
                    if (searchRes) {
                        title = searchRes.title || title;
                        duration = searchRes.duration || "";
                        author = searchRes.author || "";
                    }
                } catch (e) {}
            } else {
                const searchResult = await searchYouTube(songQuery);
                if (!searchResult || !searchResult.url) {
                    throw new Error("No YouTube search results found for: " + songQuery);
                }
                videoUrl = searchResult.url;
                title = searchResult.title || songQuery;
                duration = searchResult.duration || "";
                author = searchResult.author || "";
            }

            await conn.sendMessage(chatJid, { react: { text: "📥", key: mek?.key || m?.key } });

            const dlData = await fetchAudioDownloadUrl(videoUrl);
            if (dlData.title) title = dlData.title;

            try {
                const streamRes = await axios({
                    method: 'get',
                    url: dlData.downloadUrl,
                    responseType: 'stream',
                    timeout: 45000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': '*/*'
                    }
                });
                await pipeline(streamRes.data, fs.createWriteStream(inputPath));
            } catch (streamErr) {
                console.warn("[csong] Stream download failed, trying arraybuffer:", streamErr.message);
                const response = await axios.get(dlData.downloadUrl, {
                    responseType: 'arraybuffer',
                    timeout: 45000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': '*/*'
                    }
                });
                await fs.writeFile(inputPath, Buffer.from(response.data));
            }
        }

        await conn.sendMessage(chatJid, { react: { text: "🎙️", key: mek?.key || m?.key } });

        const convResult = await convertToVoiceNote(inputPath, outputPath, title, author);
        const audioBuffer = convResult.buffer;
        const isOpusConverted = convResult.success;
        const mimetype = isOpusConverted ? "audio/ogg; codecs=opus" : "audio/mpeg";

        const waveformData = isOpusConverted ? createStylishWaveform(64) : undefined;

        // 1. Send audio message to WhatsApp channel
        let channelMsg = null;
        try {
            channelMsg = await conn.sendMessage(channelJid, {
                audio: audioBuffer,
                mimetype: mimetype,
                ptt: isOpusConverted,
                ...(waveformData ? { waveform: waveformData } : {}),
                fileName: `${title}.mp3`
            });
        } catch (sendErr) {
            console.warn("[csong] Audio send failed, attempting fallback:", sendErr.message);
            try {
                const rawBuffer = await fs.readFile(inputPath).catch(() => audioBuffer);
                channelMsg = await conn.sendMessage(channelJid, {
                    audio: rawBuffer,
                    mimetype: "audio/mpeg",
                    ptt: false,
                    fileName: `${title}.mp3`
                });
            } catch (fallbackErr) {
                console.error("[csong] Channel audio send failed completely:", fallbackErr.message);
                throw new Error(`Failed to send audio to channel (${fallbackErr.message}). Ensure the bot is an Admin in the channel with posting permissions!`);
            }
        }

        // 2. Send stylish music player card text message to the channel
        if (channelMsg) {
            try {
                const channelCaption =
                    `*${title}*\n` +
                    (author ? `*Artist:* ${author}\n` : ``) +
                    `━━━━━━━•────────────────\n` +
                    `⇆   ◁   ❚❚   ▷   ↻\n` +
                    `*𝁟𝗦𝗽⃯𝘂𝘁𝗶𝗳𝘆🧑🏼🩰🎶*`;

                await conn.sendMessage(channelJid, {
                    text: channelCaption.trim()
                });
            } catch (capErr) {
                console.warn("[csong] Channel caption send failed:", capErr.message);
            }
        }

        // 3. Confirmation card in the active chat
        await conn.sendMessage(chatJid, { react: { text: "✅", key: mek?.key || m?.key } });

        const chatDetailsText =
            `*ＳＯＮＧ  ＦＯＲＷＡＲＤＥＤ*\n\n` +
            `╭─────────────────────────┈\n` +
            `│ *Title:* ${title || songQuery}\n` +
            (author ? `│ *Artist:* ${author}\n` : ``) +
            (duration ? `│ *Duration:* ${duration}\n` : ``) +
            (videoUrl ? `│ *URL:* ${videoUrl}\n` : ``) +
            `│ *Channel:* ${channelJid}\n` +
            `│ *Format:* ${isOpusConverted ? "Voice Note (Waves)" : "Audio (MP3)"}\n` +
            `╰─────────────────────────┈\n\n` +
            `━━━━━━━•────────────────\n` +
            `⇆   ◁   ❚❚   ▷   ↻`;

        await conn.sendMessage(chatJid, { text: chatDetailsText }, { quoted: mek || m });

    } catch (e) {
        console.error("[csong] Error:", e.message);
        await conn.sendMessage(chatJid, { react: { text: "❌", key: mek?.key || m?.key } });
        await sendReply("❌ Error: " + e.message);
    } finally {
        if (msgId) activeCsongRequests.delete(msgId);
        if (await fs.pathExists(inputPath)) await fs.remove(inputPath).catch(() => {});
        if (await fs.pathExists(outputPath)) await fs.remove(outputPath).catch(() => {});
    }
}

// Register via bot cmd system
cmd({
    pattern: "csong",
    alias: ["channelsong", "songchannel", "cvoice"],
    desc: "Send stylish songs directly to a WhatsApp Channel",
    category: "download",
    react: "🎶",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix, reply }) => {
    await handleCsongExecution(conn, mek, m, { from, q, text: q, prefix, reply });
});

// Also export module for direct execution compatibility
module.exports = {
    name: "csong",
    aliases: ["channelsong", "songchannel", "cvoice"],
    category: "download",
    async execute(conn, m, { text, prefix }) {
        await handleCsongExecution(conn, m, m, { from: m.chat, q: text, text, prefix, reply: m.reply?.bind(m) });
    }
};
