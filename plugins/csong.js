const { cmd } = require("../command");
const axios = require("axios");

cmd({
    pattern: "csong",
    alias: ["channelsong"],
    desc: "Download a song and send it to chat or channel.",
    category: "download",
    react: "🎵",
    filename: __filename
},
async (conn, mek, m, { from, q, reply }) => {
    try {
        if (!q) return reply("❌ Please provide a song name or YouTube link!");

        let songQuery = q;
        let videoUrl = "";
        let searchItem = null;

        // Check if query is a direct URL
        if (q.includes("http://") || q.includes("https://")) {
            videoUrl = q;
            try {
                const { data: searchRes } = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(videoUrl)}`);
                if (searchRes.results?.length) {
                    searchItem = searchRes.results[0];
                }
            } catch (err) {}
        } else {
            try {
                const { data: searchRes } = await axios.get(`https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(songQuery)}`);
                if (!searchRes.results?.length) return reply(`❌ No search results found for: ${songQuery}`);
                searchItem = searchRes.results[0];
                videoUrl = searchItem.url;
            } catch (err) {
                return reply("❌ Error fetching search results from API.");
            }
        }

        if (!videoUrl || !searchItem) {
            return reply("❌ Could not find any valid song matching your query.");
        }

        await reply(`📥 Downloading **${searchItem.title}**... Please wait.`);

        // Example download and send logic (adjust based on your preferred audio/video API or streamer)
        // You can integrate your audio stream API here using searchItem.url or videoUrl
        
        let desc = `╭─────────────────◆
│ *🎵 CHANNEL SONG PLAYER*
├─────────────────◆
│ *Title:* ${searchItem.title}
│ *Duration:* ${searchItem.timestamp || 'N/A'}
│ *Views:* ${searchItem.views || 'N/A'}
│ *Author:* ${searchItem.author?.name || 'N/A'}
│ *URL:* ${searchItem.url}
╰─────────────────◆`;

        // Send info and media to chat (or change 'from' to your target channel JID if needed)
        await conn.sendMessage(from, { text: desc }, { quoted: mek });

        // If you have an audio stream/download API endpoint, fetch and send the audio buffer here:
        // const audioStreamUrl = `YOUR_AUDIO_DOWNLOAD_API_URL?url=${encodeURIComponent(videoUrl)}`;
        // await conn.sendMessage(from, { audio: { url: audioStreamUrl }, mimetype: 'audio/mp4', ptt: false }, { quoted: mek });

    } catch (e) {
        console.error(e);
        reply(`❌ An error occurred: ${e.message}`);
    }
});
