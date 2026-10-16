const { cmd } = require('../command');
const axios = require('axios');

// Extract YouTube video ID from any URL format
function extractYouTubeId(input) {
    const patterns = [
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const re of patterns) {
        const match = input.match(re);
        if (match) return match[1];
    }
    return null;
}

cmd({
    pattern: "ytv",
    alias: ["yt", "ytvideo", "ytdl", "video", "yta", "ytmp3", "audio"],
    desc: "Download YouTube videos and audio.",
    category: "downloader",
    react: "⏳",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix, command }) => {
    const react = async (emoji) => {
        await conn.sendMessage(from, { react: { text: emoji, key: mek.key } });
    };

    try {
        if (!q) {
            return await conn.sendMessage(from, {
                text: `_Please provide a YouTube URL or song name_\nExample: ${prefix}yt https://youtu.be/xxxxx\nExample: ${prefix}yta Faded`
            }, { quoted: mek });
        }

        const isAudio = ["yta", "ytmp3", "audio"].includes(command?.toLowerCase());
        const input   = q.trim();

        let videoUrl = null;
        let title    = isAudio ? "YouTube Audio" : "YouTube Video";

        // Step 1: detect direct YouTube URL or ID
        const ytId = extractYouTubeId(input);
        if (ytId) {
            videoUrl = `https://www.youtube.com/watch?v=${ytId}`;
        }

        // Step 2: search if no URL/ID was detected
        if (!videoUrl) {
            await react("🔍");
            try {
                const { data } = await axios.get(
                    `https://xenosirapis.zone.id/api/ytsearch?query=${encodeURIComponent(input)}`,
                    {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                        timeout: 20000
                    }
                );
                if (data?.results?.length > 0) {
                    const first = data.results[0];
                    const id    = first.videoId || extractYouTubeId(first.url || '');
                    if (id) videoUrl = `https://www.youtube.com/watch?v=${id}`;
                    if (first.title) title = first.title;
                }
            } catch (err) {
                console.warn("[yt.js] xenosirapis ytsearch error:", err.message);
            }
        }

        if (!videoUrl) {
            await react("❌");
            return await conn.sendMessage(from, {
                text: "❌ No YouTube results found. Please try a different keyword or paste a direct link."
            }, { quoted: mek });
        }

        await react("⏳");

        // Step 3: get download URL
        let downloadUrl = null;

        // Primary: xenosirapis.zone.id
        try {
            const endpoint = isAudio ? "ytmp3dl" : "ytmp4dl";
            const { data } = await axios.get(
                `https://xenosirapis.zone.id/api/${endpoint}?url=${encodeURIComponent(videoUrl)}`,
                {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 35000
                }
            );
            if (data?.success && data?.downloadUrl) {
                downloadUrl = data.downloadUrl;
                if (data.title) title = data.title.trim();
            }
        } catch (err) {
            console.warn("[yt.js] xenosirapis download error:", err.message);
        }

        // Fallback 1: oggyapi
        if (!downloadUrl) {
            try {
                const endpoint = isAudio ? "ytmp3-v1" : "ytmp4-v1";
                const { data } = await axios.get(
                    `https://jerrycoder.oggyapi.workers.dev/down/${endpoint}?url=${encodeURIComponent(videoUrl)}`,
                    { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 30000 }
                );
                downloadUrl = data?.url || data?.result?.download || data?.data?.download
                           || data?.result?.url || data?.download;
                const resTitle = data?.title || data?.result?.title;
                if (resTitle) title = resTitle.trim();
            } catch (err) {
                console.warn("[yt.js] oggyapi fallback error:", err.message);
            }
        }

        // Fallback 2: xenoytdl-2 (audio only)
        if (!downloadUrl && isAudio) {
            try {
                const { data } = await axios.get(
                    `https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`,
                    { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }
                );
                downloadUrl = data?.download;
                if (data?.title) title = data.title.trim();
            } catch (err) {
                console.warn("[yt.js] xenoytdl-2 error:", err.message);
            }
        }

        if (!downloadUrl) {
            await react("❌");
            return await conn.sendMessage(from, {
                text: "❌ All download servers are busy. Please try again in a moment."
            }, { quoted: mek });
        }

        // Step 4: send media
        if (isAudio) {
            await conn.sendMessage(from, {
                audio: { url: downloadUrl },
                mimetype: "audio/mpeg",
                fileName: `${title}.mp3`,
                ptt: false
            }, { quoted: mek });
        } else {
            await conn.sendMessage(from, {
                video: { url: downloadUrl },
                caption: `*${title}*`,
                mimetype: "video/mp4"
            }, { quoted: mek });
        }

        await react("✅");

    } catch (e) {
        console.error("[yt.js] Error:", e.message || e);
        await react("❌");
        await conn.sendMessage(from, {
            text: `❌ Error: ${e.message || "Something went wrong. Please try again."}`
        }, { quoted: mek });
    }
});
