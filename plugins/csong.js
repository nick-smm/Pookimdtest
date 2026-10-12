// Dev Xeno Exe

const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const util = require("util");
const crypto = require("crypto");
const { pipeline } = require("stream/promises");
const execPromise = util.promisify(exec);

let config = {};
try {
    config = require("../config");
} catch (_) {}

let cmd = null;
try {
    const cmdModule = require("../command");
    cmd = cmdModule.cmd || cmdModule.AddCommand || cmdModule.Function || cmdModule.Module;
} catch (_) {}

function getYouTubeId(url) {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=|shorts\/)([^#\&\?]*).*/;
    const match = url.match(regExp);
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

    const match = cleanInput.match(/whatsapp\.com\/channel\/([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
        const inviteCode = match[1];
        try {
            if (conn && typeof conn.newsletterMetadata === "function") {
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

function getFfmpegBinary() {
    try {
        const ffmpegStatic = require("ffmpeg-static");
        if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
            return `"${ffmpegStatic}"`;
        }
    } catch (_) {}
    return "ffmpeg";
}

const activeCsongRequests = new Set();

/**
 * Core handler logic supporting both framework paradigms.
 */
async function handleCsong(conn, m, extra = {}) {
    const key = extra.key || m?.key;
    const msgId = key?.id;
    if (msgId) {
        if (activeCsongRequests.has(msgId)) return;
        activeCsongRequests.add(msgId);
        setTimeout(() => activeCsongRequests.delete(msgId), 30000);
    }

    const from = extra.from || m?.chat || key?.remoteJid;
    const prefix = extra.prefix || ".";
    const text = (extra.text || extra.q || "").trim();

    const doReply = async (content) => {
        if (typeof extra.reply === "function") {
            return await extra.reply(content);
        }
        if (m && typeof m.reply === "function") {
            return await m.reply(content);
        }
        if (conn && typeof conn.sendMessage === "function" && from) {
            return await conn.sendMessage(from, { text: content }, key ? { quoted: { key } } : {});
        }
    };

    const doReact = async (emoji) => {
        try {
            if (conn && typeof conn.sendMessage === "function" && from && key) {
                await conn.sendMessage(from, { react: { text: emoji, key } });
            } else if (m && typeof m.react === "function") {
                await m.react(emoji);
            }
        } catch (_) {}
    };

    const quoted = m?.quoted ? m.quoted : null;
    const quotedMime = quoted ? (quoted.mimetype || (quoted.msg && quoted.msg.mimetype) || (quoted.audioMessage && quoted.audioMessage.mimetype) || (quoted.videoMessage && quoted.videoMessage.mimetype) || quoted.type || "") : "";
    const isQuotedAudio = /audio|video/.test(quotedMime) || (quoted && (quoted.audioMessage || quoted.videoMessage || quoted.type === "audioMessage" || quoted.type === "videoMessage"));

    if (!text && !isQuotedAudio) {
        return await doReply(
            `ＳＯＮＧ  ＣＨＡＮＮＥＬ  ＳＯＮＧ \n\n` +
            `Send stylish songs with audio waves directly to a WhatsApp Channel.\n\n` +
            `*Format 1 (Search/URL):*\n${prefix}csong <Channel Link> , <Song Name or YT URL>\n\n` +
            `*Format 2 (Reply Audio):*\nReply to audio message with ${prefix}csong <Channel Link>\n\n` +
            `*Example:*\n${prefix}csong https://whatsapp.com/channel/0029VaXXXXXX , Faded`
        );
    }

    let channelInput = "";
    let songQuery = "";

    if (isQuotedAudio) {
        channelInput = (text || "").trim();
        songQuery = "Quoted Audio";
    } else {
        if (text.includes(",") || text.includes("|")) {
            const parts = text.split(/[,|]/);
            channelInput = parts[0].trim();
            songQuery = parts.slice(1).join(",").trim();
        } else {
            const parts = text.trim().split(/\s+/);
            channelInput = parts[0].trim();
            songQuery = parts.slice(1).join(" ").trim();
        }
    }

    if (!channelInput || (!songQuery && !isQuotedAudio)) {
        return await doReply(
            `Invalid format!\n\n` +
            `Please provide both Channel Link and Song Name (or reply to an audio message).\n` +
            `*Example:* ${prefix}csong https://whatsapp.com/channel/0029VaXXXXXX , Faded`
        );
    }

    const tmpDir = path.join(process.cwd(), "tmp");
    await fs.ensureDir(tmpDir);

    const uniqueId = crypto.randomBytes(6).toString("hex");
    const inputPath = path.join(tmpDir, `csong_in_${uniqueId}.mp3`);
    const outputPath = path.join(tmpDir, `csong_vn_${uniqueId}.opus`);

    try {
        await doReact("🔍");

        const channelJid = await resolveChannelJid(conn, channelInput);
        if (!channelJid) {
            await doReact("❌");
            return await doReply("Invalid WhatsApp channel link.");
        }

        let videoUrl, title, duration, author;

        if (isQuotedAudio) {
            await doReact("📥");
            let mediaBuffer = null;
            if (typeof quoted.download === "function") {
                mediaBuffer = await quoted.download();
            } else if (typeof conn.downloadMediaMessage === "function") {
                mediaBuffer = await conn.downloadMediaMessage(quoted);
            }
            if (!mediaBuffer) throw new Error("Failed to download quoted media message.");
            await fs.writeFile(inputPath, mediaBuffer);
            title = quoted.filename || "Quoted Audio";
        } else {
            const ytId = getYouTubeId(songQuery);
            let searchItem = null;

            if (ytId) {
                videoUrl = `https://www.youtube.com/watch?v=${ytId}`;
                try {
                    const { data: searchRes } = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(videoUrl)}`);
                    if (searchRes.results?.length) {
                        searchItem = searchRes.results[0];
                    }
                } catch (err) { }
            } else {
                const { data: searchRes } = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(songQuery)}`);
                if (!searchRes.results?.length) throw new Error("No search results for " + songQuery);
                searchItem = searchRes.results[0];
                videoUrl = searchItem.url;
            }

            title = searchItem?.title || "YouTube Audio";
            duration = searchItem?.duration || "";
            author = typeof searchItem?.author === "object" ? searchItem?.author?.name : (searchItem?.author || "");

            await doReact("📥");

            const { data: downloadRes } = await axios.get(`https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`);

            if (downloadRes?.title && downloadRes.title !== "YouTube Audio") {
                title = downloadRes.title;
            }

            if (!downloadRes?.download) {
                throw new Error("Failed to download song audio.");
            }

            const response = await axios({
                method: "get",
                url: downloadRes.download,
                responseType: "stream"
            });
            await pipeline(response.data, fs.createWriteStream(inputPath));
        }

        await doReact("🎙️");

        const safeTitle = (title || "Audio").replace(/["'$`\\]/g, "");
        const safeArtist = (author || config?.botName || "𝁟𝗦𝗽⃯𝘂𝘁𝗶𝗳𝘆𝘆🧑🏼🩰🎶").replace(/["'$`\\]/g, "");
        const ffmpegBin = getFfmpegBinary();

        const cmdStr = `${ffmpegBin} -y -i "${inputPath}" -vn -c:a libopus -b:a 48k -ac 1 -ar 48000 -metadata title="${safeTitle}" -metadata artist="${safeArtist}" "${outputPath}"`;

        let voiceBuffer;
        let mimetype = "audio/ogg; codecs=opus";

        try {
            await execPromise(cmdStr);
            if (await fs.pathExists(outputPath)) {
                voiceBuffer = await fs.readFile(outputPath);
            } else {
                voiceBuffer = await fs.readFile(inputPath);
                mimetype = "audio/mpeg";
            }
        } catch (err) {
            console.error("FFmpeg error:", err.message);
            voiceBuffer = await fs.readFile(inputPath);
            mimetype = "audio/mpeg";
        }

        const waveformData = createStylishWaveform(64);

        // 1. Send voice note with dynamic audio wave bars to WhatsApp channel
        const channelVoiceMsg = await conn.sendMessage(channelJid, {
            audio: voiceBuffer,
            mimetype: mimetype,
            ptt: mimetype.includes("opus"),
            waveform: waveformData
        });

        // 2. Reply to sent voice note IN THE CHANNEL with stylish music player card
        if (channelVoiceMsg) {
            const channelCaption =
                `*${title}*\n` +
                (author ? `*Artist:* ${author}\n` : ``) +
                `━━━━━━━•────────────────\n` +
                `⇆   ◁   ❚❚   ▷   ↻\n` +
                `*𝁟𝗦𝗽⃯𝘂𝘁𝗶𝗳𝘆𝘆🧑🏼🩰🎶*`;

            await conn.sendMessage(channelJid, {
                text: channelCaption.trim()
            }, { quoted: channelVoiceMsg });
        }

        // 3. Send stylish confirmation text in active chat
        await doReact("✅");

        const chatDetailsText =
            `*ＳＯＮＧ  ＦＯＲＷＡＲＤＥＤ*\n\n` +
            `╭─────────────────────────┈\n` +
            `│ *Title:* ${title || songQuery}\n` +
            (author ? `│ *Artist:* ${author}\n` : ``) +
            (duration ? `│ *Duration:* ${duration}\n` : ``) +
            (videoUrl ? `│ *URL:* ${videoUrl}\n` : ``) +
            `│ *Channel:* ${channelJid}\n` +
            `│ *Waves:* Enabled (Voice Note)\n` +
            `╰─────────────────────────┈\n\n` +
            `━━━━━━━•────────────────\n` +
            `⇆   ◁   ❚❚   ▷   ↻`;

        if (conn && typeof conn.sendMessage === "function" && from) {
            await conn.sendMessage(from, { text: chatDetailsText }, key ? { quoted: { key } } : {});
        } else {
            await doReply(chatDetailsText);
        }

    } catch (e) {
        console.error("Csong Error:", e?.message || e);
        await doReact("❌");
        await doReply(" Error: " + (e?.message || e));
    } finally {
        if (await fs.pathExists(inputPath)) await fs.remove(inputPath).catch(() => { });
        if (await fs.pathExists(outputPath)) await fs.remove(outputPath).catch(() => { });
    }
}

// 1. Register with cmd system (for Pookimdtest-main / Nick MD / pair.js)
if (typeof cmd === "function") {
    cmd({
        pattern: "csong",
        alias: ["channelsong", "songchannel"],
        desc: "Send audio/song with waveforms directly to a WhatsApp Channel",
        category: "download",
        react: "🎶",
        filename: __filename
    },
    async (conn, mek, m, extra = {}) => {
        return await handleCsong(conn, m || mek, {
            text: extra.q || extra.text || "",
            prefix: extra.prefix || ".",
            from: extra.from || m?.chat || mek?.key?.remoteJid,
            key: mek?.key || m?.key,
            reply: extra.reply || (m && typeof m.reply === "function" ? m.reply.bind(m) : null)
        });
    });
}

// 2. Export module object (for standalone / Baileys execute handlers)
module.exports = {
    name: "csong",
    aliases: ["channelsong", "songchannel"],
    category: "download",
    desc: "Send audio/song with waveforms directly to a WhatsApp Channel",
    execute: async (conn, m, extra = {}) => {
        return await handleCsong(conn, m, {
            text: extra.text || extra.q || "",
            prefix: extra.prefix || ".",
            from: m?.chat || m?.key?.remoteJid,
            key: m?.key,
            reply: m && typeof m.reply === "function" ? m.reply.bind(m) : null
        });
    }
};
