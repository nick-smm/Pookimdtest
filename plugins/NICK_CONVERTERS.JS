const config = require('../config');
const { cmd, commands } = require('../command');
const { exec, spawn } = require('child_process');
const fs = require('fs-extra');
const path = require('path');


cmd({
    pattern: "mp3",
    alias: ["tomp3"],
    category: "converter",
    desc: "Convert Video/Audio to MP3.",
    react: "⏳",
    filename: __filename
},
async (conn, mek, m, { from, prefix, quoted, reply }) => {
    try {
        const q = quoted ? quoted : mek;
        const mime = (q.msg || q).mimetype || '';
        
        if (!/video|audio/.test(mime)) {
            return await reply(`Please reply to a *video* or *audio* message with ${prefix}mp3`);
        }

        const buffer = await q.download();
        if (!buffer) return await reply("Failed to download media.");

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const timestamp = Date.now();
        const inputPath = path.join(tmpDir, `in_${timestamp}.mp4`);
        const outputPath = path.join(tmpDir, `out_${timestamp}.mp3`);
        
        await fs.writeFile(inputPath, buffer);
        
        const ffmpegCmd = `ffmpeg -i "${inputPath}" -vn -c:a libmp3lame -q:a 2 "${outputPath}"`;
        
        exec(ffmpegCmd, async (err) => {
            if (fs.existsSync(inputPath)) await fs.remove(inputPath);
            if (err) {
                console.error("FFmpeg Error:", err);
                if (fs.existsSync(outputPath)) await fs.remove(outputPath);
                return await reply("Conversion failed. Ensure ffmpeg is installed on the host.");
            }
            if (!fs.existsSync(outputPath)) return;

            const resultBuffer = await fs.readFile(outputPath);
            await conn.sendMessage(from, {
                audio: resultBuffer,
                mimetype: "audio/mpeg",
                fileName: 'Converted_By_nick_md_mini.mp3',
                ptt: false
            }, { quoted: mek });
            
            await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
            await fs.remove(outputPath);
        });

    } catch (e) {
        console.error("MP3 Converter Error:", e);
        reply(`Error: ${e.message}`);
    }
});


cmd({
    pattern: "sticker",
    alias: ["s", "stiker"],
    category: "converter",
    desc: "Convert Image/Video to Sticker.",
    react: "⏳",
    filename: __filename
},
async (conn, mek, m, { from, prefix, quoted, reply }) => {
    try {
        const q = quoted ? quoted : mek;
        const mime = (q.msg || q).mimetype || '';
        
        if (!/image|video/.test(mime)) {
            return await reply(` Please reply to an image or video to create a sticker!\nExample: ${prefix}sticker (as a reply to media)`);
        }

        const media = await q.download();
        if (!media) return await reply("Failed to download media.");

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const timestamp = Date.now();
        const isVideo = /video/.test(mime);
        const inputPath = path.join(tmpDir, `in_st_${timestamp}.${isVideo ? 'mp4' : 'jpg'}`);
        const outputPath = path.join(tmpDir, `out_st_${timestamp}.webp`);
        
        await fs.writeFile(inputPath, media);

        
        const args = [
            '-y',
            '-i', inputPath,
            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,fps=15,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=#00000000',
            '-vcodec', 'libwebp',
            '-loop', '0',
            '-preset', 'default',
            '-an',
            '-vsync', '0',
            outputPath
        ];
        
        if (isVideo) {
           
            args.splice(args.indexOf('-vcodec') + 2, 0, '-t', '10'); 
        }

        const ff = spawn('ffmpeg', args);
        
        ff.on('close', async (code) => {
            if (fs.existsSync(inputPath)) await fs.remove(inputPath);
            if (code === 0) {
                const webpBuffer = await fs.readFile(outputPath);
                await conn.sendMessage(from, { sticker: webpBuffer }, { quoted: mek });
                await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
            } else {
                reply("Failed to generate sticker. FFmpeg error.");
            }
            if (fs.existsSync(outputPath)) await fs.remove(outputPath);
        });

    } catch (e) {
        console.error("Sticker Error:", e);
        reply(`Failed to create sticker.\nDebug: ${e.message}`);
    }
});


cmd({
    pattern: "toimg",
    alias: ["photo", "image"],
    category: "converter",
    desc: "Convert Sticker to Image.",
    react: "🖼️",
    filename: __filename
},
async (conn, mek, m, { from, prefix, quoted, reply }) => {
    try {
        const q = quoted ? quoted : mek;
        const mime = (q.msg || q).mimetype || '';

        if (!/webp/.test(mime)) {
            return await reply(`Please reply to a *sticker* with ${prefix}toimg to convert it to an image.`);
        }

        const buffer = await q.download();
        if (!buffer) return await reply("Failed to download media.");

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const timestamp = Date.now();
        const inputPath = path.join(tmpDir, `in_img_${timestamp}.webp`);
        const outputPath = path.join(tmpDir, `out_img_${timestamp}.png`);
        
        await fs.writeFile(inputPath, buffer);
        
        exec(`ffmpeg -i "${inputPath}" "${outputPath}"`, async (err) => {
            if (fs.existsSync(inputPath)) await fs.remove(inputPath);
            if (err) {
                console.error("FFmpeg Error:", err);
                if (fs.existsSync(outputPath)) await fs.remove(outputPath);
                return await reply("Conversion failed.");
            }
            if (!fs.existsSync(outputPath)) return;

            const resultBuffer = await fs.readFile(outputPath);
            await conn.sendMessage(from, {
                image: resultBuffer,
                caption: 'Converted_By_nick_md_mini'
            }, { quoted: mek });
            
            await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
            await fs.remove(outputPath);
        });

    } catch (e) {
        console.error("ToImg Error:", e);
        reply(`Error: ${e.message}`);
    }
});


cmd({
    pattern: "tomp4",
    alias: ["tovideo"],
    category: "converter",
    desc: "Convert Animated Sticker to Video.",
    react: "🎬",
    filename: __filename
},
async (conn, mek, m, { from, prefix, quoted, reply }) => {
    try {
        const q = quoted ? quoted : mek;
        const mime = (q.msg || q).mimetype || '';

        if (!/webp/.test(mime)) {
            return await reply(`Please reply to an *animated sticker* with ${prefix}tomp4 to convert it to a video.`);
        }

        const buffer = await q.download();
        if (!buffer) return await reply("Failed to download media.");

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const timestamp = Date.now();
        const inputPath = path.join(tmpDir, `in_vid_${timestamp}.webp`);
        const outputPath = path.join(tmpDir, `out_vid_${timestamp}.mp4`);
        
        await fs.writeFile(inputPath, buffer);
        
        exec(`ffmpeg -i "${inputPath}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${outputPath}"`, async (err) => {
            if (fs.existsSync(inputPath)) await fs.remove(inputPath);
            if (err) {
                console.error("FFmpeg Error:", err);
                if (fs.existsSync(outputPath)) await fs.remove(outputPath);
                return await reply("Conversion failed. Make sure it's an animated sticker.");
            }
            if (!fs.existsSync(outputPath)) return;

            const resultBuffer = await fs.readFile(outputPath);
            await conn.sendMessage(from, {
                video: resultBuffer,
                caption: 'Converted_By_Nick_md_mini'
            }, { quoted: mek });
            
            await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
            await fs.remove(outputPath);
        });

    } catch (e) {
        console.error("ToMp4 Error:", e);
        reply(`Error: ${e.message}`);
    }
});


cmd({
    pattern: "toaudio",
    alias: ["tovn", "audio"],
    category: "converter",
    desc: "Convert Video/Audio to Voice Note (PTT).",
    react: "🎤",
    filename: __filename
},
async (conn, mek, m, { from, prefix, quoted, reply }) => {
    try {
        const q = quoted ? quoted : mek;
        const mime = (q.msg || q).mimetype || '';
        
        if (!/video|audio/.test(mime)) {
            return await reply(`Please reply to a *video* or *audio* message with ${prefix}toaudio`);
        }

        const buffer = await q.download();
        if (!buffer) return await reply("Failed to download media.");

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const timestamp = Date.now();
        const inputPath = path.join(tmpDir, `in_vn_${timestamp}.mp4`);
        const outputPath = path.join(tmpDir, `out_vn_${timestamp}.opus`);
        
        await fs.writeFile(inputPath, buffer);
        
        const ffmpegCmd = `ffmpeg -i "${inputPath}" -c:a libopus -b:a 128k -vbr on -compression_level 10 "${outputPath}"`;
        
        exec(ffmpegCmd, async (err) => {
            if (fs.existsSync(inputPath)) await fs.remove(inputPath);
            if (err) {
                console.error("FFmpeg Error:", err);
                if (fs.existsSync(outputPath)) await fs.remove(outputPath);
                return await reply("Conversion failed.");
            }
            if (!fs.existsSync(outputPath)) return;

            const resultBuffer = await fs.readFile(outputPath);
            await conn.sendMessage(from, {
                audio: resultBuffer,
                mimetype: "audio/ogg; codecs=opus",
                ptt: true
            }, { quoted: mek });
            
            await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
            await fs.remove(outputPath);
        });

    } catch (e) {
        console.error("ToAudio Error:", e);
        reply(`Error: ${e.message}`);
    }
});

cmd({
    pattern: "ptv",
    alias: ["videonote", "vnvideo"],
    category: "converter",
    desc: "Convert Video to Video Note (circle video).",
    react: "⚪",
    filename: __filename
},
async (conn, mek, m, { from, prefix, quoted, reply }) => {
    try {
        const q = quoted ? quoted : mek;
        const mime = (q.msg || q).mimetype || '';

        if (!/video/.test(mime)) {
            return await reply(`Please reply to a *video* with ${prefix}ptv to convert it to a video note.`);
        }

        const buffer = await q.download();
        
        await conn.sendMessage(from, {
            video: buffer,
            ptv: true
        }, { quoted: mek });
        
        await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });

    } catch (e) {
        console.error("Error:", e);
        reply("This video is large.");
    }
});

cmd({
    pattern: "blackvideo",
    alias: ["blackvid", "audiotovideo"],
    category: "converter",
    desc: "Convert Audio to a Black Video.",
    react: "🎥",
    filename: __filename
},
async (conn, mek, m, { from, prefix, quoted, reply }) => {
    try {
        const q = quoted ? quoted : mek;
        const mime = (q.msg || q).mimetype || '';
        
        if (!/audio/.test(mime)) {
            return await reply(`Please reply to an *audio* message with ${prefix}blackvideo`);
        }

        const buffer = await q.download();
        if (!buffer) return await reply("Failed to download audio.");

        const tmpDir = path.join(process.cwd(), 'tmp');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir);

        const timestamp = Date.now();
        const inputPath = path.join(tmpDir, `in_aud_${timestamp}.mp3`);
        const outputPath = path.join(tmpDir, `out_blkvid_${timestamp}.mp4`);
        
        await fs.writeFile(inputPath, buffer);
        
        const ffmpegCmd = `ffmpeg -f lavfi -i color=c=black:s=1280x720 -i "${inputPath}" -c:v libx264 -c:a aac -shortest -pix_fmt yuv420p "${outputPath}"`;
        
        exec(ffmpegCmd, async (err) => {
            if (fs.existsSync(inputPath)) await fs.remove(inputPath);
            if (err) {
                console.error("FFmpeg Error:", err);
                if (fs.existsSync(outputPath)) await fs.remove(outputPath);
                return await reply("Conversion failed.");
            }
            if (!fs.existsSync(outputPath)) return;

            const resultBuffer = await fs.readFile(outputPath);
            await conn.sendMessage(from, {
                video: resultBuffer,
                caption: 'Converted_By_nick_md_mini'
            }, { quoted: mek });
            
            await conn.sendMessage(from, { react: { text: "✅", key: mek.key } });
            await fs.remove(outputPath);
        });

    } catch (e) {
        console.error("Black Video Error:", e);
        reply(`Error: ${e.message}`);
    }
});