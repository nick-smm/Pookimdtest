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
        // Function to handle reactions easily
        const react = async (emoji) => {
            await conn.sendMessage(from, { react: { text: emoji, key: mek.key } });
        };

        if (!q) {
            return await conn.sendMessage(from, { text: `_Please provide a YouTube URL_\nExample: ${prefix}ytv https://youtu.be/xxxxx` }, { quoted: mek });
        }
        
        const videoUrl = q.trim();
        const ytRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/[^\s]+|youtu\.be\/[^\s]+)$/i;
        
        if (!ytRegex.test(videoUrl)) {
            return await conn.sendMessage(from, { text: "Invalid YouTube link format." }, { quoted: mek });
        }

        await react("⏳");

        // Check if the user used an audio command (yta, ytmp3, audio)
        const isAudio = ["yta", "ytmp3", "audio"].includes(command?.toLowerCase());

        const endpoint = isAudio ? "ytmp3-v1" : "ytmp4-v1";
        const apiUrl = `https://jerrycoder.oggyapi.workers.dev/down/${endpoint}?url=${encodeURIComponent(videoUrl)}`;
        
        const { data } = await axios.get(apiUrl, { timeout: 30000 }); // 30 seconds timeout

        const resData = data?.result || data?.data || data;
        const downloadUrl = resData?.download || resData?.downloadURL || resData?.download_url || resData?.url || resData?.dl_url;
        const title = resData?.title?.trim() || (isAudio ? "YouTube Audio" : "YouTube Video");

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
