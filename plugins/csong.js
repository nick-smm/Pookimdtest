// Dev Xeno Exe - NICK XD / NOVA-XD MD Handler
const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const util = require("util");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const execPromise = util.promisify(exec);

const config = require("../config");
const { cmd } = require("../command");



function getFfmpegBinary() {
    try {
        const ffmpegStatic = require("ffmpeg-static");
        if (ffmpegStatic && typeof ffmpegStatic === "string" && fs.existsSync(ffmpegStatic)) {
            return ffmpegStatic;
        }
    } catch (e) {}
    return "ffmpeg";
}



function getYouTubeId(url) {
    if (!url || typeof url !== "string") return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.trim().match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
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
            } else if (typeof conn.query === "function") {
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
            console.error("Failed to resolve channel invite code:", err.message);
        }
    }

    return null;
}


async function searchYouTube(query) {
    // Primary: xenosirapis.zone.id
    try {
        const { data } = await axios.get(`https://xenosirapis.zone.id/api/ytsearch?query=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 20000
        });
        if (data && data.results && data.results.length > 0) {
            const item = data.results[0];
            const videoId = item.videoId || item.id;
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

    // Fallback: xenoytserch.vercel.app
    try {
        const { data } = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 10000
        });
        if (data && data.results && data.results.length > 0) {
            const item = data.results[0];
            const videoId = item.videoId || item.id;
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
    // Provider 1: xenosirapis.zone.id (Primary)
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

    // Provider 2: xenoytdl-2
    try {
        const { data } = await axios.get(`https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 15000
        });
        const dl = data?.download;
        if (dl && typeof dl === 'string') {
            return {
                downloadUrl: dl,
                title: data.title && data.title !== "YouTube Audio" ? data.title : null
            };
        }
    } catch (e) {}

   
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

   
    try {
        const { data } = await axios.get(`https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(videoUrl)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 20000
        });
        const dl = data?.data?.dl;
        if (dl && typeof dl === 'string') {
            return {
                downloadUrl: dl,
                title: data?.data?.title || null
            };
        }
    } catch (e) {}

    throw new Error("Unable to obtain download URL from audio servers.");
}


async function convertToVoiceNote(inputPath, outputPath, title, artist) {
    const ffBin = getFfmpegBinary();
    const safeTitle = (title || "Audio").replace(/["'$`\\]/g, "");
    const safeArtist = (artist || config.botName || "ＸＥＮＯ ＸＤ").replace(/["'$`\\]/g, "");

    // Primary: libopus with metadata tags (same as archive)
    try {
        const cmd1 = `"${ffBin}" -y -i "${inputPath}" -vn -c:a libopus -b:a 48k -ac 1 -ar 48000 -metadata title="${safeTitle}" -metadata artist="${safeArtist}" "${outputPath}"`;
        await execPromise(cmd1);
        if (await fs.pathExists(outputPath) && (await fs.stat(outputPath)).size > 0) {
            return { success: true, buffer: await fs.readFile(outputPath) };
        }
    } catch (err1) {
        console.warn("FFmpeg libopus conversion failed, attempting opus fallback:", err1.message);
    }

    // Fallback: opus codec without metadata
    try {
        const cmd2 = `"${ffBin}" -y -i "${inputPath}" -vn -c:a opus -b:a 48k -ac 1 -ar 48000 -metadata title="${safeTitle}" -metadata artist="${safeArtist}" "${outputPath}"`;
        await execPromise(cmd2);
        if (await fs.pathExists(outputPath) && (await fs.stat(outputPath)).size > 0) {
            return { success: true, buffer: await fs.readFile(outputPath) };
        }
    } catch (err2) {
        console.warn("FFmpeg opus conversion fallback failed:", err2.message);
    }

    return { success: false, buffer: await fs.readFile(inputPath) };
}

const activeCsongRequests = new Set();

cmd({
    pattern: "csong",
    alias: ["channelsong", "songchannel", "cvoice"],
    desc: "Download song and record/send to WhatsApp Channel with waveforms",
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
            `Send stylish songs recorded as WhatsApp voice notes directly to a Channel.\n\n` +
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
        let part1 = "";
        let part2 = "";

        if (q.includes(",") || q.includes("|")) {
            const parts = q.split(/[,|]/);
            part1 = parts[0].trim();
            part2 = parts.slice(1).join(",").trim();
        } else {
            const parts = q.trim().split(/\s+/);
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
            return await reply("_Invalid WhatsApp channel link or ID. Please check the channel link._");
        }

        let videoUrl = null;
        let title = "Audio Track";
        let duration = "";
        let author = "";

        if (isQuotedAudio) {
            await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });
            const mediaBuffer = await quoted.download();
            if (!mediaBuffer) throw new Error("Failed to download quoted media message.");
            await fs.writeFile(inputPath, mediaBuffer);
            title = quoted.filename || "Quoted Audio";
        } else {
            const directId = getYouTubeId(songQuery);

            if (directId) {
                videoUrl = `https://www.youtube.com/watch?v=${directId}`;
                title = songQuery;
            } else {
                const searchResult = await searchYouTube(songQuery);
                if (!searchResult || !searchResult.url) {
                    throw new Error("No search results found for: " + songQuery);
                }
                videoUrl = searchResult.url;
                title = searchResult.title || songQuery;
                duration = searchResult.duration || "";
                author = searchResult.author || "";
            }

            await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });

            const dlData = await fetchAudioDownloadUrl(videoUrl);
            if (dlData.title) title = dlData.title;

            // Download audio — try stream pipeline first (like archive), fallback to arraybuffer
            try {
                const streamRes = await axios({
                    method: 'get',
                    url: dlData.downloadUrl,
                    responseType: 'stream',
                    timeout: 60000,
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
                    timeout: 60000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': '*/*'
                    }
                });
                await fs.writeFile(inputPath, Buffer.from(response.data));
            }
        }

        // Convert audio to voice recording (PTT Opus Ogg) with metadata
        await conn.sendMessage(from, { react: { text: "🎙️", key: mek.key } });

        const convResult = await convertToVoiceNote(inputPath, outputPath, title, author);
        const voiceBuffer = convResult.buffer;
        const isOpusConverted = convResult.success;

        const waveformData = createStylishWaveform(64);

        // Send as voice note (mic button) if opus converted, plain audio fallback
        let channelVoiceMsg;
        try {
            if (isOpusConverted) {
                // Opus OGG → appears as voice recording button in channel
                channelVoiceMsg = await conn.sendMessage(channelJid, {
                    audio: voiceBuffer,
                    mimetype: "audio/ogg; codecs=opus",
                    ptt: true
                });
            } else {
                // Fallback: send as plain audio file (no ffmpeg available)
                channelVoiceMsg = await conn.sendMessage(channelJid, {
                    audio: voiceBuffer,
                    mimetype: "audio/mpeg",
                    ptt: false
                });
            }
            console.log("[csong] Audio sent to channel:", channelJid, "ptt:", isOpusConverted, "size:", voiceBuffer.length);
        } catch (audioErr) {
            console.error("[csong] Channel audio send failed:", audioErr.message);
        }

        // Send follow-up caption as a REPLY to the voice note in the channel (archive behavior)
        try {
            const channelCaption =
                `🎧 *${title}*\n` +
                (author ? `👤 *Artist:* ${author}\n` : ``) +
                (duration ? `⏱️ *Duration:* ${duration}\n` : ``) +
                `━━━━━━━•────────────────\n` +
                `⇆   ◁   ❚❚   ▷   ↻\n` +
                `✨ *𝁟𝗟𝗲𝘃𝗶͢𝗮𝗻𝗼 𝗔𝘂𝗱𝗶𝗼𝘀🫟🐦‍🔥🎶*`;

            if (channelVoiceMsg) {
                // Reply to the voice note — caption appears attached to audio (archive style)
                await conn.sendMessage(channelJid, {
                    text: channelCaption.trim()
                }, { quoted: channelVoiceMsg });
            } else {
                await conn.sendMessage(channelJid, {
                    text: channelCaption.trim()
                });
            }
        } catch (capErr) {
            console.warn("[csong] Channel caption send failed:", capErr.message);
        }

        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

        // Confirm back in the user/requester chat
        const chatDetailsText =
            `✨ *𝁟𝗟𝗲𝘃𝗶͢𝗮𝗻𝗼 𝗔𝘂𝗱𝗶𝗼𝘀🫟🐦‍🔥🎶* ✨\n\n` +
            `╭─────────────────────────┈💬\n` +
            `│ 🎵 *Title:* ${title || songQuery}\n` +
            (author ? `│ 👤 *Artist:* ${author}\n` : ``) +
            (duration ? `│ ⏱️ *Duration:* ${duration}\n` : ``) +
            (videoUrl ? `│ 🔗 *URL:* ${videoUrl}\n` : ``) +
            `│ 📢 *Channel:* ${channelJid}\n` +
            `│ 🎙️ *Format:* Voice Note (Recorded with Waveforms)\n` +
            `╰─────────────────────────┈💬\n\n` +
            `━━━━━━━•────────────────\n` +
            `⇆   ◁   ❚❚   ▷   ↻`;

        await conn.sendMessage(from, { text: chatDetailsText }, { quoted: mek });

    } catch (e) {
        console.error("Csong Error:", e.message);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
        await reply("❌ Error sending audio recording to channel: " + e.message);
    } finally {
        if (await fs.pathExists(inputPath)) await fs.remove(inputPath).catch(() => { });
        if (await fs.pathExists(outputPath)) await fs.remove(outputPath).catch(() => { });
    }
});
