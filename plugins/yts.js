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

        const searchUrl = `https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(q)}`;
        const { data: searchRes } = await axios.get(searchUrl);

        if (!searchRes || !searchRes.status || !searchRes.results || searchRes.results.length === 0) {
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            return await conn.sendMessage(from, { text: "No results found for your search." }, { quoted: mek });
        }

        const videos = searchRes.results.slice(0, 10);
        let msg = `*YOUTUBE SEARCH RESULTS*\n\n`;

        videos.forEach((video, index) => {
            msg += `*${index + 1}. ${video.title}*\n`;
            msg += `📺 Channel: ${video.channel || 'Unknown'}\n`;
            msg += `⏱ Duration: ${video.duration || 'Unknown'}\n`;
            msg += `👁 Views: ${video.views || 'Unknown'}\n`;
            msg += `🔗 Link: ${video.url}\n\n`;
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
