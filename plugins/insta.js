const config = require('../config')
const { cmd } = require('../command')
const fetch = require('node-fetch')

cmd({
    pattern: "insta",
    desc: "Instagram Downloader",
    category: "download",
    react: "📥",
    filename: __filename
},
async (conn, mek, m, {
    from,
    q,
    reply
}) => {
    try {

        if (!q) {
            return reply("*Example: .insta https://www.instagram.com/reel/xxxxx/*")
        }

        const res = await fetch(
            `${config.API}/api/downloader/igdl?url=${encodeURIComponent(q)}`
        )

        const data = await res.json()

        if (!data.status || !data.data.length) {
            return reply("*No media found!*")
        }

        for (const media of data.data) {

            if (media.type === "video") {

                await conn.sendMessage(
                    from,
                    {
                        video: { url: media.url },
                        caption: "*📥 Instagram Downloader*"
                    },
                    { quoted: mek }
                )

            } else {

                await conn.sendMessage(
                    from,
                    {
                        image: { url: media.url },
                        caption: "*📥 Instagram Downloader*"
                    },
                    { quoted: mek }
                )

            }
        }

    } catch (e) {
        console.log(e)
        reply(`${e}`)
    }
})