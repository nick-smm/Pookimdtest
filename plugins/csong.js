const { cmd } = require('../command');
const axios = require('axios');
const { botName } = require('../config');

// ─────────────────────────────────────────────
//  Helper: extract YouTube video ID from any URL
// ─────────────────────────────────────────────
function extractYouTubeId(input) {
    const patterns = [
        /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
        /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    ];
    for (const re of patterns) {
        const m = input.match(re);
        if (m) return m[1];
    }
    return null;
}

cmd(
    {
        pattern: 'csong',
        alias: ['channelsong', 'cplay', 'cmusic', 'voicesong'],
        desc: 'Download a song and send it as a voice note to a WhatsApp channel.',
        category: 'downloader',
        react: '🎙️',
        filename: __filename,
    },
    async (conn, mek, m, { from, q, prefix }) => {
        const statusReact = async (emoji) =>
            conn.sendMessage(from, { react: { text: emoji, key: mek.key } }).catch(() => {});

        const statusMsg = async (text) =>
            conn.sendMessage(from, { text }, { quoted: mek }).catch(() => {});

        try {
            // ── 0. Parse args: first token = channelJID, rest = query ──
            const raw = (q || '').trim();
            const parts = raw.split(/\s+/);

            const channelJid = parts[0] && parts[0].endsWith('@newsletter') ? parts.shift() : null;
            const songQuery  = parts.join(' ').trim();

            if (!channelJid || !songQuery) {
                return await statusMsg(
                    `🎙️ *Channel Voice Note Sender*\n\n` +
                    `*Usage:*\n` +
                    `\`${prefix}csong <channelJID@newsletter> <song name or YouTube URL>\`\n\n` +
                    `*Example:*\n` +
                    `\`${prefix}csong 120363xxxxxxxx@newsletter Faded Alan Walker\`\n\n` +
                    `_The voice note will be sent directly to the channel._`
                );
            }

            await statusReact('🔍');
            await statusMsg(`🔍 Searching: *${songQuery}*…`);

            // ── 1. Resolve video URL & metadata via xenoytserch ────
            const isUrl = /^(https?:\/\/)?(www\.)?(youtube\.com\/[^\s]+|youtu\.be\/[^\s]+)$/i.test(songQuery);

            let videoUrl   = isUrl ? songQuery : null;
            let searchItem = null;
            let title      = 'Song';
            let duration   = '';
            let author     = '';
            let thumbnail  = '';

            const resolveUrl = (item) => {
                if (!item) return null;
                if (item.url && item.url.startsWith('http')) return item.url;
                const vid = item.videoId || item.id || extractYouTubeId(item.url || '');
                if (vid) return `https://www.youtube.com/watch?v=${vid}`;
                return null;
            };

            try {
                const { data: searchRes } = await axios.get(
                    `https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(songQuery)}`,
                    { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 18000 }
                );

                const results = Array.isArray(searchRes)
                    ? searchRes
                    : (searchRes?.results || searchRes?.data || []);

                if (results.length > 0) {
                    searchItem = results[0];
                    const resolved = resolveUrl(searchItem);
                    if (!isUrl && resolved) videoUrl = resolved;
                    else if (!isUrl) throw new Error('Could not resolve video URL from result');
                } else {
                    throw new Error('Empty results from xenoytserch');
                }
            } catch (err) {
                console.warn('[csong] xenoytserch search error:', err.message);
                if (!videoUrl) {
                    await statusReact('❌');
                    return await statusMsg(
                        `❌ No results found for: *${songQuery}*\n_Try a different song name or paste a YouTube link._`
                    );
                }
            }

            if (!videoUrl) {
                await statusReact('❌');
                return await statusMsg('❌ No song results found. Try a different name or paste a YouTube link.');
            }

            // ── 3. Extract metadata ─────────────────────────────────
            if (searchItem) {
                title    = searchItem.title    || title;
                duration = searchItem.duration || searchItem.length || '';
                author   = typeof searchItem.author === 'object'
                    ? (searchItem.author?.name || searchItem.author?.id || '')
                    : (searchItem.author || '');
                thumbnail = searchItem.thumbnail || searchItem.image || '';
            }

            if (!thumbnail) {
                const id = extractYouTubeId(videoUrl);
                if (id) thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
            }

            await statusReact('📥');
            await statusMsg(`📥 Downloading *${title}*… sending PTT to channel.`);

            // ── 4. Fetch download URL ───────────────────────────────
            let downloadUrl = null;

            try {
                const { data } = await axios.get(
                    `https://xenosirapis.zone.id/api/ytmp3dl?url=${encodeURIComponent(videoUrl)}`,
                    { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 35000 }
                );
                if (data?.success && data?.downloadUrl) {
                    downloadUrl = data.downloadUrl;
                    if (data.title && title === 'Song') title = data.title;
                }
            } catch (err) {
                console.warn('[csong] xenosirapis ytmp3dl error:', err.message);
            }

            if (!downloadUrl) {
                try {
                    const { data } = await axios.get(
                        `https://xenoytdl-2.vercel.app/api/youtube?url=${encodeURIComponent(videoUrl)}&format=mp3`,
                        { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 25000 }
                    );
                    downloadUrl = data?.download;
                    if (data?.title && title === 'Song') title = data.title;
                } catch (err) {
                    console.warn('[csong] xenoytdl-2 fallback error:', err.message);
                }
            }

            if (!downloadUrl) {
                await statusReact('❌');
                return await statusMsg('❌ All download servers are busy. Please try again in a moment.');
            }

            // ── 5. Build channel caption text ───────────────────────
            const channelCaption =
                `🎵 *${title}*\n` +
                (author   ? `👤 ${author}\n`   : '') +
                (duration ? `⏱️ ${duration}\n` : '') +
                `\n> ${botName || 'Bot'}`;

            // ── 6. Send ONLY the Voice Note (PTT) with Thumbnail Preview to Channel ──
            await conn.sendMessage(channelJid, {
                audio: { url: downloadUrl },
                mimetype: 'audio/mpeg',
                ptt: true,            // Send as a voice note bubble
                fileName: `${title}.mp3`,
                caption: channelCaption, // Attach description right with the voice note
                contextInfo: {
                    externalAdReply: {
                        title: title,
                        body: botName || 'Bot',
                        thumbnailUrl: thumbnail || undefined,
                        sourceUrl: videoUrl,
                        mediaType: 1,
                        renderLargerThumbnail: true,
                        showAdAttribution: false,
                    },
                },
            });

            // ── 7. Confirm success in the command chat only ─────────
            await statusReact('✅');
            await statusMsg(
                `✅ *Voice note sent to channel successfully!*\n\n` +
                `🎵 *${title}*\n` +
                (author ? `👤 *Artist:* ${author}\n` : '') +
                `📢 *Channel:* \`${channelJid}\``
            );

        } catch (e) {
            console.error('[csong] Error:', e.message || e);
            await statusReact('❌');
            await statusMsg(`❌ *csong Error:* ${e.message || 'Something went wrong. Please try again.'}`);
        }
    }
);
