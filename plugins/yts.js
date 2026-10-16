const { cmd } = require('../command');
const axios = require("axios");

cmd({
    pattern: "yts",
    alias: ["ytsearch", "searchyt"],
    desc: "Search YouTube videos",
    category: "search",
    react: "🔍",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix }) => {
    if (!q) {
        return await conn.sendMessage(from, { 
            text: `Please provide a search term.\nExample: ${prefix}yts Faded` 
        }, { quoted: mek });
    }

    try {
        await conn.sendMessage(from, { react: { text: "🔍", key: mek.key } });

        let results = null;

        // Provider 1: xenosirapis ytsearch
        try {
            const { data } = await axios.get(`https://xenosirapis.zone.id/api/ytsearch?query=${encodeURIComponent(q)}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 15000
            });
            if (data?.results?.length > 0) {
                results = data.results;
            }
        } catch (err) {}

        // Provider 2: xenoytserch fallback
        if (!results) {
            try {
                const { data } = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(q)}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 10000
                });
                if (data?.results?.length > 0) {
                    results = data.results;
                }
            } catch (err) {}
        }

        if (!results || results.length === 0) {
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            return await conn.sendMessage(from, { text: "No results found for your search." }, { quoted: mek });
        }

        const videos = results.slice(0, 10);
        let msg = `*YOUTUBE SEARCH RESULTS*\n\n`;

        videos.forEach((video, index) => {
            msg += `*${index + 1}. ${video.title}*\n`;
            msg += ` Channel: ${video.channel || 'Unknown'}\n`;
            msg += ` Duration: ${video.duration || 'Unknown'}\n`;
            msg += ` Views: ${video.views || 'Unknown'}\n`;
            msg += ` Link: ${video.url}\n\n`;
        });

        msg += `_ʟ ᴇ ᴠ ɪ ᴀ ɴ ᴏ   x ᴅ🤍_`;

        let sendOptions = {};
        if (videos[0].thumbnail) {
            sendOptions = { image: { url: videos[0].thumbnail }, caption: msg };
        } else {
            sendOptions = { text: msg };
        }

        await conn.sendMessage(from, sendOptions, { quoted: mek });
        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (e) {
        console.error("YTS Error:", e.message);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
        await conn.sendMessage(from, { 
            text: "An error occurred while searching. Please try again later." 
        }, { quoted: mek });
    }
});
