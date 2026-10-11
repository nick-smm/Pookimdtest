const axios = require("axios");

// ======================== INSTAGRAM DOWNLOADER ========================
module.exports = {
    name: "insta",
    aliases: ["ig", "instagram"],
    category: "downloader",
    description: "Download Instagram reels, videos, photos and carousel posts.",

    async execute(conn, m, { text, prefix }) {
        const from = m.chat;
        const react = (emoji) =>
            conn.sendMessage(from, { react: { text: emoji, key: m.key } }).catch(() => {});

        if (!text) {
            return await m.reply(`Example:\n${prefix}insta https://www.instagram.com/reel/xxxxx/`);
        }

        if (!text.includes("instagram.com")) {
            return await m.reply("❌ Please provide a valid Instagram URL.");
        }

        try {
            await react("⏳");

            // ----------------- API -----------------
            const url = text.trim();
            const api = `https://api-aswin-sparky.koyeb.app/api/downloader/igdl?url=${encodeURIComponent(url)}`;
            // ---------------------------------------

            const { data } = await axios.get(api);

            if (!data.status || !data.data || data.data.length < 1) {
                await react("❌");
                return await m.reply("No media found.");
            }

            for (const media of data.data) {
                if (media.type === "video") {
                    await conn.sendMessage(from, {
                        video: { url: media.url },
                        caption: "📥 Downloaded by NICK XD 🪻🌿🤍"
                    }, { quoted: m });
                } else {
                    await conn.sendMessage(from, {
                        image: { url: media.url },
                        caption: "📥 Downloaded by NICK XD 🪻🌿🤍"
                    }, { quoted: m });
                }
            }

            await react("✅");

        } catch (err) {
            console.error("Instagram Error:", err?.response?.data || err.message);
            await react("❌");
            await m.reply("Failed to download Instagram media. Make sure the post is public.");
        }
    }
};
