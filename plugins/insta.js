const { cmd } = require('../command');
const axios = require("axios");

cmd({
    pattern: "insta",
    alias: ["ig", "instagram"],
    desc: "Download Instagram reels, videos, photos and carousel posts.",
    category: "downloader",
    react: "⏳",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix }) => {
    try {
        // Function to handle reactions easily
        const react = async (emoji) => {
            await conn.sendMessage(from, { react: { text: emoji, key: mek.key } });
        };

        if (!q) {
            return await conn.sendMessage(from, { text: `Example:\n${prefix}insta https://www.instagram.com/reel/xxxxx/` }, { quoted: mek });
        }

        if (!q.includes("instagram.com")) {
            return await conn.sendMessage(from, { text: "❌ Please provide a valid Instagram URL." }, { quoted: mek });
        }

        await react("⏳");

        // ----------------- API -----------------
        const url = q.trim();
        const api = `https://api-aswin-sparky.koyeb.app/api/downloader/igdl?url=${encodeURIComponent(url)}`;
        // ---------------------------------------

        const { data } = await axios.get(api);

        if (!data.status || !data.data || data.data.length < 1) {
            await react("❌");
            return await conn.sendMessage(from, { text: "No media found." }, { quoted: mek });
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

        await react("✅");

    } catch (err) {
        console.error("Instagram Error:", err?.response?.data || err.message);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
        await conn.sendMessage(from, { text: "Failed to download Instagram media. Make sure the post is public." }, { quoted: mek });
    }
});
