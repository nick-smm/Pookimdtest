const config = require('../config')
const { cmd, commands } = require('../command')
const axios = require('axios')
const { exec } = require('child_process')
const fs = require('fs-extra')
const path = require('path')

// ======================== YOUTUBE VIDEO DOWNLOADER ========================
cmd({
    pattern: "yt",
    alias: ["ytvideo", "ytdl", "video"],
    desc: "Download YouTube videos.",
    category: "downloader",
    react: "🎬",
    filename: __filename
},
async (conn, mek, m, { from, prefix, q, reply }) => {
    try {
        if (!q) return await reply(`Please provide a YouTube URL.\nExample: ${prefix}yt https://youtu.be/xxxxx`);
        if (!q.includes("youtube.com") && !q.includes("youtu.be")) {
            return await reply("Invalid YouTube URL! Please provide a valid YouTube link.");
        }

        // --- API CHANGED ---
        const apiUrl = `https://api-aswin-sparky.koyeb.app/api/downloader/ytdl?url=${encodeURIComponent(q)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.status || !data.data) {
            return await reply("Failed to get download link. Try again later.");
        }

        const title = data.data.title || "YouTube Video";
        const download_url = data.data.video || data.data.url || data.data.mp4;

        if (!download_url) return await reply("Could not extract video url.");

        await conn.sendMessage(from, {
            video: { url: download_url },
            caption: `🎬 *${title}*\n\n_ᴅ ᴏ ᴡ ɴ ʟ ᴏ ᴀ ᴅ ᴇ ᴅ  ʙ ʏ   ɴ ɪ ᴄ ᴋ   ᴍ ᴅ🪻🌿🤍_`
        }, { quoted: mek });

    } catch (e) {
        console.error("YT Download Error:", e?.response?.data || e.message);
        await reply("Error downloading video. Please try again later.");
    }
})

// ======================== YOUTUBE SONG DOWNLOADER ========================
cmd({
    pattern: "song",
    alias: ["yta", "play"],
    desc: "Download songs from YouTube.",
    category: "downloader",
    react: "🎵",
    filename: __filename
},
async (conn, mek, m, { from, prefix, q, reply }) => {
    if (!q) return await reply(`Example: ${prefix}song Faded`);

    try {
        await conn.sendMessage(from, { react: { text: "🔍", key: mek.key } });

        // Search API (Kept as is for searching functionality)
        const searchUrl = `https://eliteprotech-apis.zone.id/ytsearch?q=${encodeURIComponent(q)}`;
        const { data: searchRes } = await axios.get(searchUrl, { 
            timeout: 60000, 
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!searchRes || !searchRes.success || !searchRes.results || !searchRes.results.videos || searchRes.results.videos.length === 0) {
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            return await reply("No results found for your search.");
        }

        const video = searchRes.results.videos[0];
        const { url: videoUrl, title, thumbnail } = video;

        await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });

        // --- API CHANGED ---
        const downloadUrl = `https://api-aswin-sparky.koyeb.app/api/downloader/ytdl?url=${encodeURIComponent(videoUrl)}`;
        const { data: downloadRes } = await axios.get(downloadUrl, { timeout: 60000 });

        if (!downloadRes.status || !downloadRes.data) {
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            return await reply("Failed to get download link. Please try again later.");
        }

        const downloadLink = downloadRes.data.audio || downloadRes.data.url || downloadRes.data.mp3;
        
        if(!downloadLink) {
            return await reply("Failed to extract audio link.");
        }

        const audioResponse = await axios.get(downloadLink, { 
            responseType: 'arraybuffer',
            timeout: 60000,
            maxContentLength: 50 * 1024 * 1024 
        });

        let finalAudio = Buffer.from(audioResponse.data);
        
        if (finalAudio.length < 100000) {
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            return await reply("The downloaded file seems to be corrupted. Please try another song.");
        }

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const timestamp = Date.now();
        const inputPath = path.join(tmpDir, `song_in_${timestamp}.mp3`);
        const outputPath = path.join(tmpDir, `song_out_${timestamp}.mp3`);
        const thumbPath = path.join(tmpDir, `song_thumb_${timestamp}.jpg`);

        await fs.writeFile(inputPath, finalAudio);

        let hasThumb = false;
        if (thumbnail || config.thumbUrl) {
            try {
                const imgRes = await axios.get(thumbnail || config.thumbUrl, { responseType: 'arraybuffer', timeout: 10000 });
                await fs.writeFile(thumbPath, Buffer.from(imgRes.data));
                hasThumb = true;
            } catch (e) {
                console.error("Thumbnail capture error:", e.message);
            }
        }

        const metadataTitle = (title || "ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ").replace(/"/g, '\\"');
        let ffmpegCmd;

        if (hasThumb) {
            ffmpegCmd = `ffmpeg -i "${inputPath}" -i "${thumbPath}" -map 0:a -map 1:0 -c:a libmp3lame -b:a 128k -id3v2_version 3 -metadata title="${metadataTitle}" -metadata artist="ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ" -metadata album="ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ" -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (Front)" "${outputPath}"`;
        } else {
            ffmpegCmd = `ffmpeg -i "${inputPath}" -vn -c:a libmp3lame -b:a 128k -id3v2_version 3 -metadata title="${metadataTitle}" -metadata artist="ɴɪᴄᴋ xᴅ ᴍɪɴɪ" -metadata album="ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ" "${outputPath}"`;
        }

        exec(ffmpegCmd, async (err) => {
            if (!err && fs.existsSync(outputPath)) {
                finalAudio = await fs.readFile(outputPath);
            }
            
            if (fs.existsSync(inputPath)) await fs.remove(inputPath).catch(() => {});
            if (fs.existsSync(thumbPath)) await fs.remove(thumbPath).catch(() => {});
            
            await conn.sendMessage(from, {
                audio: finalAudio,
                mimetype: "audio/mpeg",
                fileName: `${(title || "audio").replace(/[\\/:"*?<>|]/g, "")}.mp3`,
                ptt: false,
            }, { quoted: mek });
            
            if (fs.existsSync(outputPath)) await fs.remove(outputPath).catch(() => {});
            await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
        });

    } catch (e) {
        console.error("Song Error:", e.code || e.message);
        await reply("An error occurred. Please try again later.");
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
    }
})

// ======================== FACEBOOK VIDEO DOWNLOADER ========================
cmd({
    pattern: "fb",
    alias: ["facebook", "fbdl"],
    desc: "Download Facebook videos.",
    category: "downloader",
    react: "📘",
    filename: __filename
},
async (conn, mek, m, { from, prefix, q, reply }) => {
    try {
        if (!q) return await reply(`Please provide a Facebook video URL.\nExample: ${prefix}fb https://www.facebook.com/reel/xxxxx`);
        if (!q.includes("facebook.com") && !q.includes("fb.watch")) {
            return await reply("Invalid Facebook URL! Please provide a valid Facebook video link.");
        }

        await reply("Downloading Facebook video... ⏳");

        // --- API CHANGED ---
        const apiUrl = `https://api-aswin-sparky.koyeb.app/api/downloader/fbdl?url=${encodeURIComponent(q)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.status || !data.data) {
            return await reply("Failed to get download link. Make sure the video is public and try again.");
        }

        // Check for common FB API response keys
        const videoUrl = data.data.hd || data.data.sd || data.data.url || (Array.isArray(data.data) ? data.data[0]?.url : null);
        const title = data.data.title || "Facebook Video";

        if (!videoUrl) return await reply("No download link found for this video.");

        const caption = `📘 *${title}*\n\n_Downloaded by ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ🪀_`;

        await conn.sendMessage(from, {
            video: { url: videoUrl },
            caption
        }, { quoted: mek });

    } catch (e) {
        console.error("FB Download Error:", e?.response?.data || e.message);
        await reply("Error downloading video. Make sure the video is public and try again.");
    }
})

// ======================== INSTAGRAM DOWNLOADER ========================
cmd({
    pattern: "insta",
    alias: ["ig", "instagram"],
    desc: "Download Instagram reels, videos, photos and carousel posts.",
    category: "downloader",
    react: "📸",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix, reply }) => {
    try {
        if (!q) {
            return reply(`Example:\n${prefix}insta https://www.instagram.com/reel/xxxxx/`);
        }

        if (!q.includes("instagram.com")) {
            return reply("❌ Please provide a valid Instagram URL.");
        }

        await conn.sendMessage(from, {
            react: { text: "⏳", key: mek.key }
        });

        // ----------------- API IS ALREADY UPDATED -----------------
        const url = q; 
        const api = `https://api-aswin-sparky.koyeb.app/api/downloader/igdl?url=${encodeURIComponent(url)}`;
        // ----------------------------------------------------------

        const { data } = await axios.get(api);

        if (!data.status || !data.data || data.data.length < 1) {
            await conn.sendMessage(from, {
                react: { text: "❌", key: mek.key }
            });
            return reply("No media found.");
        }

        for (const media of data.data) {
            if (media.type === "video") {
                await conn.sendMessage(from, {
                    video: { url: media.url },
                    caption: "📥 Downloaded by NICK XD 🪻🌿🤍"
                }, { quoted: mek });
            } else {
                await conn.sendMessage(from, {
                    image: { url: media.url },
                    caption: "📥 Downloaded by NICK XD 🪻🌿🤍"
                }, { quoted: mek });
            }
        }

        await conn.sendMessage(from, {
            react: { text: "✅", key: mek.key }
        });

    } catch (err) {
        console.error("Instagram Error:", err?.response?.data || err.message);

        await conn.sendMessage(from, {
            react: { text: "❌", key: mek.key }
        });

        reply("Failed to download Instagram media. Make sure the post is public.");
    }
});

// ======================== SPOTIFY DOWNLOADER ========================
cmd({
    pattern: "spotify",
    alias: ["spot", "spdl"],
    desc: "Download songs from Spotify.",
    category: "downloader",
    react: "💚",
    filename: __filename
},
async (conn, mek, m, { from, prefix, q, reply }) => {
    if (!q) return await reply(`Usage: ${prefix}spotify <Spotify Track URL>\nExample: ${prefix}spotify https://open.spotify.com/track/6UgeS3N89Vp82P05HBy93i`);

    if (!q.includes("spotify.com/track/")) {
        return await reply("❌ Invalid Spotify track URL. Please provide a direct track link.");
    }

    try {
        await conn.sendMessage(from, { react: { text: "⏳", key: mek.key } });

        // --- API CHANGED & SIMPLIFIED ---
        const api = `https://api-aswin-sparky.koyeb.app/api/downloader/spotify?url=${encodeURIComponent(q)}`;
        const { data } = await axios.get(api);

        if (!data.status || !data.data) {
            return await reply("❌ Failed to fetch Spotify track. Service might be down.");
        }

        const downloadUrl = data.data.url || data.data.download;
        const trackTitle = data.data.title || "Spotify Track";
        const trackArtist = data.data.artist || "Unknown Artist";
        const coverImage = data.data.cover || data.data.thumbnail || config.thumbUrl;

        if (!downloadUrl) {
            return await reply("❌ Failed to generate download link.");
        }

        await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });

        const audioResponse = await axios.get(downloadUrl, { 
            responseType: "arraybuffer",
            timeout: 120000 
        });

        const buffer = Buffer.from(audioResponse.data);
        
        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const timestamp = Date.now();
        const inputPath = path.join(tmpDir, `spot_in_${timestamp}.mp3`);
        const outputPath = path.join(tmpDir, `spot_out_${timestamp}.mp3`);
        const thumbPath = path.join(tmpDir, `spot_thumb_${timestamp}.jpg`);

        await fs.writeFile(inputPath, buffer);

        let hasThumb = false;
        if (coverImage) {
            try {
                const imgRes = await axios.get(coverImage, { responseType: 'arraybuffer' });
                await fs.writeFile(thumbPath, Buffer.from(imgRes.data));
                hasThumb = true;
            } catch (e) {
                console.error("Spotify Thumb Error:", e.message);
            }
        }

        const title = "ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ";
        const artist = "ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ";
        const album = "ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ";

        let ffmpegCmd;
        if (hasThumb) {
            ffmpegCmd = `ffmpeg -i "${inputPath}" -i "${thumbPath}" -map 0:a -map 1:0 -c:a libmp3lame -q:a 2 -id3v2_version 3 -metadata title="${title}" -metadata artist="${artist}" -metadata album="${album}" -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (Front)" -af "aresample=async=1" -threads 0 "${outputPath}"`;
        } else {
            ffmpegCmd = `ffmpeg -i "${inputPath}" -vn -c:a libmp3lame -q:a 2 -id3v2_version 3 -metadata title="${title}" -metadata artist="${artist}" -metadata album="${album}" -af "aresample=async=1" -threads 0 "${outputPath}"`;
        }

        exec(ffmpegCmd, async (err) => {
            try {
                let finalBuffer = buffer;
                if (!err && fs.existsSync(outputPath)) {
                    finalBuffer = await fs.readFile(outputPath);
                }

                await conn.sendMessage(from, {
                    audio: finalBuffer,
                    mimetype: "audio/mpeg",
                    fileName: `${trackTitle} - ${trackArtist}.mp3`.replace(/[\\/:"*?<>|]/g, ""),
                }, { quoted: mek });

                await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
            } catch (e) {
                console.error("Send Error:", e.message);
            } finally {
                // Cleanup
                if (fs.existsSync(inputPath)) await fs.remove(inputPath).catch(() => {});
                if (fs.existsSync(thumbPath)) await fs.remove(thumbPath).catch(() => {});
                if (fs.existsSync(outputPath)) await fs.remove(outputPath).catch(() => {});
            }
        });

    } catch (error) {
        console.error("Spotify Plugin Error:", error.message);
        await reply(`❌ Error: ${error.message}.`);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
    }
})
