const { cmd } = require('../command');
const axios = require('axios');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

cmd({
    pattern: "pinterest",
    alias: ["pin", "pint", "pindl"],
    desc: "Download 5 Pinterest images for a search query.",
    category: "download",
    react: "📌",
    filename: __filename
},
async (conn, mek, m, { from, q, prefix, reply }) => {
    try {
        if (!q) {
            return await conn.sendMessage(from, {
                text: `*Please provide a search term for Pinterest!*\n\n*Example:* ${prefix || '.'}pinterest anime hd\n*Example:* ${prefix || '.'}pinterest aesthetic wallpaper`
            }, { quoted: mek });
        }

        await conn.sendMessage(from, { react: { text: "🔍", key: mek.key } });

        const query = q.trim();
        let images = [];

        // Primary: xeno-pinterest API
        try {
            const apiUrl = `https://xeno-pinterest.vercel.app/api/pinterest?query=${encodeURIComponent(query)}`;
            const { data } = await axios.get(apiUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 20000
            });

            if (data?.status && Array.isArray(data?.data) && data.data.length > 0) {
                images = data.data
                    .map(item => item.image || item.url)
                    .filter(url => url && typeof url === 'string');
            }
        } catch (err) {
            console.warn("xeno-pinterest API error, attempting fallback:", err.message);
        }

        // Secondary fallback: siputzx pinterest API
        if (images.length === 0) {
            try {
                const fallbackUrl = `https://api.siputzx.my.id/api/s/pinterest?query=${encodeURIComponent(query)}`;
                const { data } = await axios.get(fallbackUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 20000
                });

                if (data?.status && Array.isArray(data?.data) && data.data.length > 0) {
                    images = data.data
                        .map(item => item.image_url || item.image || item.url)
                        .filter(url => url && typeof url === 'string');
                }
            } catch (fallbackErr) {
                console.warn("siputzx fallback error:", fallbackErr.message);
            }
        }

        if (images.length === 0) {
            await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
            return await reply(` No Pinterest images found for: "${query}".`);
        }

        // Take up to 5 images
        const targetImages = images.slice(0, 5);

        await conn.sendMessage(from, { react: { text: "📥", key: mek.key } });

        for (let i = 0; i < targetImages.length; i++) {
            const imgUrl = targetImages[i];
            const caption = `֍ *Pinterest:* ${query} (${i + 1}/${targetImages.length})`;

            await conn.sendMessage(from, {
                image: { url: imgUrl },
                caption: caption
            }, { quoted: mek });

            // Small delay to ensure clean message ordering
            if (i < targetImages.length - 1) {
                await sleep(1000);
            }
        }

        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (e) {
        console.error("Pinterest Command Error:", e);
        await conn.sendMessage(from, { react: { text: "❌", key: mek.key } });
        await reply(`Error downloading Pinterest images: ${e.message || e}`);
    }
});
