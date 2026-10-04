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

        const apiUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(q)}&format=mp4`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.downloadURL) {
            return await reply("Failed to get download link. Try again later.");
        }

        const { title, downloadURL: download_url } = data;

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

        // Search API
        const searchUrl = `https://eliteprotech-apis.zone.id/ytsearch?q=${encodeURIComponent(q)}`;
        const { data: searchRes } = await axios.get(searchUrl, { 
            timeout: 60000, 
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!searchRes || !searchRes.success || !searchRes.results || !searchRes.results.videos || searchRes.results.videos.length === 0) {
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            return await reply("No results found for your search.");
        }

        const video = searchRes.results.videos[0];
        const { url: videoUrl, title, thumbnail } = video;

        await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });

        const downloadUrl = `https://eliteprotech-apis.zone.id/ytdown?url=${encodeURIComponent(videoUrl)}&format=mp3`;
        const { data: downloadRes } = await axios.get(downloadUrl, { 
            timeout: 60000, 
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!downloadRes.success || !downloadRes.downloadURL) {
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            return await reply("Failed to get download link. Please try again later.");
        }

        const downloadLink = downloadRes.downloadURL;
        const audioResponse = await axios.get(downloadLink, { 
            responseType: 'arraybuffer',
            timeout: 60000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            maxContentLength: 50 * 1024 * 1024 // 50MB limit
        });

        let finalAudio = Buffer.from(audioResponse.data);
        
        // Basic validation
        if (finalAudio.length < 100000) {
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            return await reply("The downloaded file seems to be corrupted or too small. Please try another song.");
        }

        // Metadata Injection and Re-encoding
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
                const imgRes = await axios.get(thumbnail || config.thumbUrl, { 
                    responseType: 'arraybuffer',
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
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
            } else if (err) {
                console.error("FFmpeg Error:", err);
            }
            
            // Cleanup
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
        let errMsg = "An error occurred. Please try again later.";
        if (e.code === 'ECONNRESET' || e.message.includes('socket hang up')) {
            errMsg = "Connection was reset by the server. Retrying might help.";
        } else if (e.code === 'ETIMEDOUT' || e.message.includes('timeout')) {
            errMsg = "The request timed out. The file might be too large or the server is slow.";
        }
        await reply(errMsg);
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

        const apiUrl = `https://api.giftedtech.co.ke/api/download/facebook?apikey=gifted&url=${encodeURIComponent(q)}`;
        const { data } = await axios.get(apiUrl);

        if (!data.success || !data.result) {
            return await reply("Failed to get download link. Make sure the video is public and try again.");
        }

        const { title, duration, hd_video, sd_video } = data.result;

        // Prefer HD, fall back to SD
        const videoUrl = hd_video || sd_video;
        if (!videoUrl) return await reply("No download link found for this video.");

        const caption = `📘 *Facebook Video*\n\n` +
            `📝 *Title:* ${title || "No title"}\n` +
            `⏱️ *Duration:* ${duration || "Unknown"}\n` +
            `📺 *Quality:* ${hd_video ? "HD" : "SD"}\n\n` +
            `_Downloaded by ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ🪀_`;

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
    alias: ["ig"],
    desc: "Download Instagram reels/videos/images.",
    category: "downloader",
    react: "📸",
    filename: __filename
},
async (conn, mek, m, { from, prefix, q, reply }) => {
    try {
        if (!q) return await reply(`Example: ${prefix}insta <url>`);
        if (!q.includes("instagram.com")) return await reply("Invalid Instagram URL!");

        const apiUrl = `https://api-aswin-sparky.koyeb.app/api/downloader/igdl?url=${encodeURIComponent(q)}`;
        const { data: res } = await axios.get(apiUrl);

        if (!res.status || !res.data || res.data.length === 0) {
            return await reply("No media found!");
        }

        // Using the first media found as per the snippet logic
        const media = res.data[0];
        const url = media.url;

        // Determine if it's a video or image based on API response type
        const type = media.type === 'video' ? 'video' : 'image';

        await conn.sendMessage(from, { [type]: { url: url }, caption: "ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ 🪀" }, { quoted: mek });
    } catch (e) {
        console.error(e);
        await reply("Error downloading. Make sure the link is public.");
    }
})

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

        const HEADERS = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Origin": "https://spotmate.online",
            "Referer": "https://spotmate.online/en1",
        };

        // 1. Get CSRF token and initial cookies
        const mainPage = await axios.get("https://spotmate.online/en1", { headers: HEADERS });
        const csrfToken = mainPage.data.match(/meta name="csrf-token" content="(.*?)"/)?.[1];
        const cookies = mainPage.headers["set-cookie"]?.map(c => c.split(";")[0]).join("; ");

        if (!csrfToken) {
            return await reply("❌ Failed to initialize session (CSRF token missing). The site might be protected or changed.");
        }

        const ajaxHeaders = {
            ...HEADERS,
            "Content-Type": "application/json",
            "X-CSRF-TOKEN": csrfToken,
            "Cookie": cookies || ""
        };

        // 2. Fetch Track Data
        const trackDataResponse = await axios.post("https://spotmate.online/getTrackData", 
            { spotify_url: q }, 
            { headers: ajaxHeaders }
        ).catch(err => {
            console.error("getTrackData error:", err.message);
            return { error: true };
        });

        if (trackDataResponse.error || !trackDataResponse.data || trackDataResponse.status === 502) {
            return await reply("❌ The Spotify downloader service is currently experiencing issues (502 Bad Gateway). Please try again later.");
        }

        const trackInfo = trackDataResponse.data;
        const trackTitle = trackInfo.title || "Spotify Track";
        const trackArtist = trackInfo.artist || "Unknown Artist";

        // 3. Initiate Conversion
        const convertResponse = await axios.post("https://spotmate.online/convert", 
            { urls: q }, 
            { headers: ajaxHeaders }
        );

        let downloadUrl = convertResponse.data?.url;
        
        if (!downloadUrl) {
            return await reply("❌ Failed to generate download link. Spotify's server might be busy or the song is unavailable.");
        }

        await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });

        // 4. Download and Process with Tag Editor (FFmpeg)
        const audioResponse = await axios.get(downloadUrl, { 
            responseType: "arraybuffer",
            headers: HEADERS,
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

        // Tag Editor Metadata
        const title = "ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ";
        const artist = "ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ";
        const album = "ɴɪᴄᴋ ᴍᴅ ᴍɪɴɪ";

        let hasThumb = false;
        if (trackInfo.image || config.thumbUrl) {
            try {
                const imgRes = await axios.get(trackInfo.image || config.thumbUrl, { responseType: 'arraybuffer' });
                await fs.writeFile(thumbPath, Buffer.from(imgRes.data));
                hasThumb = true;
            } catch (e) {
                console.error("Spotify Thumb Error:", e.message);
            }
        }

        let ffmpegCmd;
        if (hasThumb) {
            ffmpegCmd = `ffmpeg -i "${inputPath}" -i "${thumbPath}" -map 0:a -map 1:0 -c:a libmp3lame -q:a 2 -id3v2_version 3 -metadata title="${title}" -metadata artist="${artist}" -metadata album="${album}" -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (Front)" -af "aresample=async=1" -threads 0 "${outputPath}"`;
        } else {
            ffmpegCmd = `ffmpeg -i "${inputPath}" -vn -c:a libmp3lame -q:a 2 -id3v2_version 3 -metadata title="${title}" -metadata artist="${artist}" -metadata album="${album}" -af "aresample=async=1" -threads 0 "${outputPath}"`;
        }

        exec(ffmpegCmd, async (err) => {
            try {
                if (err) {
                    console.error("FFmpeg Error:", err);
                    await conn.sendMessage(from, {
                        audio: buffer,
                        mimetype: "audio/mpeg",
                        fileName: `${trackTitle} - ${trackArtist}.mp3`.replace(/[\\/:"*?<>|]/g, ""),
                    }, { quoted: mek });
                } else {
                    const finalBuffer = await fs.readFile(outputPath);
                    await conn.sendMessage(from, {
                        audio: finalBuffer,
                        mimetype: "audio/mpeg",
                        fileName: `${trackTitle} - ${trackArtist}.mp3`.replace(/[\\/:"*?<>|]/g, ""),
                    }, { quoted: mek });
                }

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
        await reply(`❌ Error: ${error.message}. The site backend might be down or blocked.`);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
    }
})