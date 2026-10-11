const { cmd } = require('../command');
const axios = require('axios');

cmd({
    pattern: "song",
    alias: ["play", "mp3", "music"],
    desc: "Download song / audio from YouTube by title or link.",
    category: "downloader",
    react: "🎶",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix }) => {
    try {
        if (!q) {
            return await conn.sendMessage(from, {
                text: `*Please provide a song name or YouTube link!*\n\n*Example:* ${prefix || '.'}song Faded\n*Example:* ${prefix || '.'}song https://youtu.be/xxxxx`
            }, { quoted: mek });
        }

        await conn.sendMessage(from, { react: { text: "🔍", key: mek.key } });

        const query = q.trim();
        const isUrl = /^(https?:\/\/)?(www\.)?(youtube\.com\/[^\s]+|youtu\.be\/[^\s]+)$/i.test(query);

        let videoUrl = isUrl ? query : null;
        let title = "Song";
        let duration = "";
        let author = "";
        let thumbnail = "";

        // If not a direct YouTube URL, search using xenosirapis ytsearch
        if (!isUrl) {
            try {
                const searchApi = `https://xenosirapis.zone.id/api/ytsearch?query=${encodeURIComponent(query)}`;
                const { data } = await axios.get(searchApi, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 20000
                });

                if (data && data.results && data.results.length > 0) {
                    const first = data.results[0];
                    videoUrl = first.url || (first.videoId ? `https://www.youtube.com/watch?v=${first.videoId}` : null);
                    title = first.title || query;
                    duration = first.duration || "";
                    author = first.author || "";
                    thumbnail = first.thumbnail || "";
                }
            } catch (searchErr) {
                console.warn("xenosirapis ytsearch error, trying fallback:", searchErr.message);
            }

            // Fallback: xenoytserch
            if (!videoUrl) {
                try {
                    const fallbackUrl = `https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(query)}`;
                    const { data } = await axios.get(fallbackUrl, {
                        headers: { 'User-Agent': 'Mozilla/5.0' },
                        timeout: 10000
                    });
                    if (data?.results?.length > 0) {
                        const first = data.results[0];
                        videoUrl = first.url || (first.videoId ? `https://www.youtube.com/watch?v=${first.videoId}` : null);
                        title = first.title || query;
                        duration = first.duration || "";
                        author = typeof first.author === 'object' ? first.author?.name : (first.author || "");
                        thumbnail = first.thumbnail || "";
                    }
                } catch (err) {}
            }

            if (!videoUrl) {
                await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
                return await conn.sendMessage(from, { text: " No song results found for your search." }, { quoted: mek });
            }
        }

        // React and send simple message with only title
        await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });
        await conn.sendMessage(from, {
            text: `*Downloading :* ${title}`
        }, { quoted: mek });

        // Retrieve download URL using xenosirapis ytmp3dl
        let downloadUrl = null;

        try {
            const dlApi = `https://xenosirapis.zone.id/api/ytmp3dl?url=${encodeURIComponent(videoUrl)}`;
            const { data } = await axios.get(dlApi, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 30000
            });

            if (data && data.success && data.downloadUrl) {
                downloadUrl = data.downloadUrl;
                if (data.title && title === "Song") title = data.title;
            }
        } catch (dlErr) {
            console.warn("xenosirapis ytmp3dl error, trying fallback:", dlErr.message);
        }

        // Fallback 1: xenoytdl-2
        if (!downloadUrl) {
            try {
                const { data } = await axios.get(`https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 20000
                });
                downloadUrl = data?.download;
                if (data?.title && title === "Song") title = data.title;
            } catch (err) {}
        }

        // Fallback 2: oggyapi
        if (!downloadUrl) {
            try {
                const { data } = await axios.get(`https://jerrycoder.oggyapi.workers.dev/down/ytmp3-v1?url=${encodeURIComponent(videoUrl)}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 25000
                });
                const resData = data?.result || data?.data || data;
                downloadUrl = resData?.download || resData?.downloadURL || resData?.download_url || resData?.url || resData?.dl_url;
                if (resData?.title && title === "Song") title = resData.title;
            } catch (err) {}
        }

        if (!downloadUrl) {
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            return await conn.sendMessage(from, { text: "Failed to retrieve download link from audio servers." }, { quoted: mek });
        }

        // Send Audio MP3
        await conn.sendMessage(from, {
            audio: { url: downloadUrl },
            mimetype: "audio/mpeg",
            fileName: `${title}.mp3`,
            ptt: false
        }, { quoted: mek });

        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (e) {
        console.error("Song Command Error:", e);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
        await conn.sendMessage(from, { text: `❌ Error: ${e.message || e}` }, { quoted: mek });
    }
});
