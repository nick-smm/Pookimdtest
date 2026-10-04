const { cmd } = require('../command');
const Jimp = require('jimp');

cmd({
    pattern: "fullpp",
    desc: "Set full screen profile picture",
    category: "owner",
    react: "🖼️",
    filename: __filename
},
async (conn, mek, m, { from, reply }) => {
    try {

        if (!mek.quoted) {
            return reply("❌ Reply to an image.");
        }

        const quoted = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (!quoted?.imageMessage) {
            return reply("❌ Reply to a photo.");
        }

        const buffer = await conn.downloadMediaMessage(mek.quoted);

        const { img } = await generateProfilePicture(buffer);

        await conn.query({
            tag: "iq",
            attrs: {
                to: conn.user.id,
                type: "set",
                xmlns: "w:profile:picture",
            },
            content: [{
                tag: "picture",
                attrs: { type: "image" },
                content: img,
            }],
        });

        return reply("✅ Profile Picture Updated Successfully.");

    } catch (err) {
        console.error(err);
        reply("❌ Failed to update profile picture.");
    }
});

async function generateProfilePicture(buffer) {
    const jimp = await Jimp.read(buffer);

    const min = jimp.getWidth();
    const max = jimp.getHeight();

    const cropped = jimp.crop(0, 0, min, max);

    return {
        img: await cropped
            .scaleToFit(720, 720)
            .getBufferAsync(Jimp.MIME_JPEG),

        preview: await cropped
            .normalize()
            .getBufferAsync(Jimp.MIME_JPEG),
    };
}