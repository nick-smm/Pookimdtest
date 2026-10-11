const { cmd } = require('../command');
const axios = require("axios");

cmd({
    pattern: "ytv",
    alias: ["yt", "ytvideo", "ytdl", "video", "yta", "ytmp3", "audio"],
    desc: "Download YouTube videos and audio.",
    category: "downloader",
    react: "⏳",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix, command }) => {
    try {
        const react = async (emoji) => {
            await conn.sendMessage(from, { react: { text: emoji, key: mek.key } });
        };

        if (!q) {
            return await conn.sendMessage(from, { 
                text: `_Please provide a YouTube URL or song name_\nExample: ${prefix}yt https://youtu.be/xxxxx\nExample: ${prefix}ytv https://youtube.com/shorts/s2SzxUS9rFM` 
            }, { quoted: mek });
        }
        
        let videoUrl = q.trim();
        const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/[^\s]+|youtu\.be\/[^\s]+)$/i;
        
        // If not a direct YouTube URL, search via xenoytserch
        if (!ytRegex.test(videoUrl)) {
            try {
                const searchRes = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(videoUrl)}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 8000
                });
                if (searchRes.data?.results?.length > 0) {
                    const first = searchRes.data.results[0];
                    videoUrl = first.url || (first.videoId ? `https://www.youtube.com/watch?v=${first.videoId}` : null);
                }
            } catch (err) {}

            if (!videoUrl || !ytRegex.test(videoUrl)) {
                return await conn.sendMessage(from, { text: "❌ Invalid YouTube link or no results found." }, { quoted: mek });
            }
        }

        await react("⏳");

        // Check if the user requested audio (yta, ytmp3, audio)
        const isAudio = ["yta", "ytmp3", "audio"].includes(command?.toLowerCase());

        let downloadUrl = null;
        let title = isAudio ? "YouTube Audio" : "YouTube Video";

        // Provider 1: xenosirapis.zone.id (Primary)
        try {
            const endpoint = isAudio ? "ytmp3dl" : "ytmp4dl";
            const apiUrl = `https://xenosirapis.zone.id/api/${endpoint}?url=${encodeURIComponent(videoUrl)}`;
            const { data } = await axios.get(apiUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 30000
            });

            if (data?.success && data?.downloadUrl) {
                downloadUrl = data.downloadUrl;
                if (data.title) title = data.title.trim();
            }
        } catch (err) {
            console.warn("xenosirapis API failed, trying fallback:", err.message);
        }

        // Provider 2: oggyapi fallback
        if (!downloadUrl) {
            try {
                const endpoint = isAudio ? "ytmp3-v1" : "ytmp4-v1";
                const apiUrl = `https://jerrycoder.oggyapi.workers.dev/down/${endpoint}?url=${encodeURIComponent(videoUrl)}`;
                const { data } = await axios.get(apiUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 30000
                });
                const resData = data?.result || data?.data || data;
                downloadUrl = resData?.download || resData?.downloadURL || resData?.download_url || resData?.url || resData?.dl_url;
                if (resData?.title) title = resData.title.trim();
            } catch (err) {
                console.warn("oggyapi fallback error:", err.message);
            }
        }

        // Provider 3: xenoytdl-2 audio fallback
        if (!downloadUrl && isAudio) {
            try {
                const { data } = await axios.get(`https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 20000
                });
                downloadUrl = data?.download;
                if (data?.title) title = data.title.trim();
            } catch (err) {}
        }

        if (!downloadUrl) {
            throw new Error("No download URL found from the API.");
        }

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
                caption: `*${title}*\n\n_ᴅ ᴏ ᴡ ɴ ʟ ᴏ ᴀ ᴅ ᴇ ᴅ  ʙ ʏ  ʟ ᴇ ᴠ ɪ ᴀ ɴ ᴏ    x ᴅ🤍_`,
                mimetype: "video/mp4"
            }, { quoted: mek });
        }

        await react("✅");

    } catch (e) {
        console.error("YT Downloader Error:", e.message);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
        await conn.sendMessage(from, { text: "_Failed to download the media. Please try again._" }, { quoted: mek });
    }
});
