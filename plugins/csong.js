const { cmd } = require('../command');
const axios = require('axios');
const { botName, footer } = require('../config');

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

// ─────────────────────────────────────────────
//  csong – channel song downloader + voice note
//  Usage: .csong <song name | YouTube URL>
// ─────────────────────────────────────────────
cmd(
    {
        pattern: 'csong',
        alias: ['channelsong', 'cplay', 'cmusic', 'voicesong'],
        desc: 'Download a song and send it as a voice/audio recording to the channel.',
        category: 'downloader',
        react: '🎙️',
        filename: __filename,
    },
    async (conn, mek, m, { from, q, prefix }) => {
        // ── helper to react with an emoji ──────────────────────
        const react = async (emoji) =>
            conn.sendMessage(from, { react: { text: emoji, key: mek.key } });

        try {
            // ── 0. Guard: require a query ───────────────────────
            if (!q) {
                return await conn.sendMessage(
                    from,
                    {
                        text:
                            `🎙️ *Channel Song Downloader*\n\n` +
                            `Please provide a song name or YouTube link.\n\n` +
                            `*Usage:*\n` +
                            `• ${prefix}csong Faded\n` +
                            `• ${prefix}csong https://youtu.be/xxxxx`,
                    },
                    { quoted: mek }
                );
            }

            await react('🔍');

            const query = q.trim();
            const isUrl = /^(https?:\/\/)?(www\.)?(youtube\.com\/[^\s]+|youtu\.be\/[^\s]+)$/i.test(query);

            let videoUrl = isUrl ? query : null;
            let songQuery = query;
            let searchItem = null;
            let title = 'Song';
            let duration = '';
            let author = '';
            let thumbnail = '';

            // ── 1. Search using xenoytserch API ─────────────────
            if (isUrl) {
                // Try to get metadata even for direct URLs
                try {
                    const { data: searchRes } = await axios.get(
                        `https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(videoUrl)}`,
                        { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 12000 }
                    );
                    if (searchRes.results?.length) {
                        searchItem = searchRes.results[0];
                    }
                } catch (err) { /* silent – metadata is optional */ }
            } else {
                // Search by song name
                try {
                    const { data: searchRes } = await axios.get(
                        `https://xenoytserch.vercel.app/api/ytsearch?q=${encodeURIComponent(songQuery)}`,
                        { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 15000 }
                    );
                    if (!searchRes.results?.length) throw new Error('No search results for: ' + songQuery);
                    searchItem = searchRes.results[0];
                    videoUrl = searchItem.url;
                } catch (err) {
                    console.warn('[csong] xenoytserch search error:', err.message);

                    // Fallback search: xenosirapis
                    try {
                        const { data: fbRes } = await axios.get(
                            `https://xenosirapis.zone.id/api/ytsearch?query=${encodeURIComponent(songQuery)}`,
                            { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 20000 }
                        );
                        if (fbRes?.results?.length) {
                            searchItem = fbRes.results[0];
                            const id = searchItem.videoId || extractYouTubeId(searchItem.url || '');
                            videoUrl = id
                                ? `https://www.youtube.com/watch?v=${id}`
                                : searchItem.url;
                        }
                    } catch (fbErr) {
                        console.warn('[csong] xenosirapis search fallback error:', fbErr.message);
                    }
                }
            }

            // ── 2. Validate we have a URL ────────────────────────
            if (!videoUrl) {
                await react('❌');
                return await conn.sendMessage(
                    from,
                    { text: '❌ No results found for your query. Please try a different name or paste a YouTube link.' },
                    { quoted: mek }
                );
            }

            // ── 3. Extract metadata from search result ───────────
            if (searchItem) {
                title = searchItem.title || title;
                duration = searchItem.duration || searchItem.length || '';
                author =
                    typeof searchItem.author === 'object'
                        ? (searchItem.author?.name || searchItem.author?.id || '')
                        : (searchItem.author || '');
                thumbnail = searchItem.thumbnail || searchItem.image || '';
            }

            // Build thumbnail from video ID if still missing
            if (!thumbnail) {
                const id = extractYouTubeId(videoUrl);
                if (id) thumbnail = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
            }

            await react('📥');

            // ── 4. Send info card (thumbnail + caption) ──────────
            const infoCaption =
                `🎙️ *Channel Song Recorder*\n\n` +
                `🎵 *Title:* ${title}\n` +
                (author ? `👤 *Artist:* ${author}\n` : '') +
                (duration ? `⏱️ *Duration:* ${duration}\n` : '') +
                `\n_Downloading & recording…_\n\n> ${botName || 'Bot'}`;

            try {
                if (thumbnail) {
                    await conn.sendMessage(
                        from,
                        { image: { url: thumbnail }, caption: infoCaption },
                        { quoted: mek }
                    );
                } else {
                    await conn.sendMessage(from, { text: infoCaption }, { quoted: mek });
                }
            } catch (_) {
                await conn.sendMessage(from, { text: infoCaption }, { quoted: mek });
            }

            // ── 5. Fetch download URL ────────────────────────────
            let downloadUrl = null;

            // Primary: xenosirapis ytmp3dl
            try {
                const { data } = await axios.get(
                    `https://xenosirapis.zone.id/api/ytmp3dl?url=${encodeURIComponent(videoUrl)}`,
                    { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, timeout: 35000 }
                );
                if (data?.success && data?.downloadUrl) {
                    downloadUrl = data.downloadUrl;
                    if (data.title && title === 'Song') title = data.title;
                }
            } catch (err) {
                console.warn('[csong] xenosirapis ytmp3dl error:', err.message);
            }

            // Fallback 1: xenoytdl-2
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


            // ── 6. Guard: no download URL ────────────────────────
            if (!downloadUrl) {
                await react('❌');
                return await conn.sendMessage(
                    from,
                    { text: '❌ All download servers are busy. Please try again in a moment.' },
                    { quoted: mek }
                );
            }

            // ── 7. Send as PTT voice note (recorded audio) ───────
            await conn.sendMessage(
                from,
                {
                    audio: { url: downloadUrl },
                    mimetype: 'audio/mpeg',
                    ptt: true,            // renders as a voice/recording bubble
                    fileName: `${title}.mp3`,
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
                },
                { quoted: mek }
            );

            // ── 8. Also send as a regular MP3 to channel ─────────
            await conn.sendMessage(
                from,
                {
                    audio: { url: downloadUrl },
                    mimetype: 'audio/mpeg',
                    fileName: `${title}.mp3`,
                    ptt: false,           // normal audio file
                },
                { quoted: mek }
            );

            await react('✅');
        } catch (e) {
            console.error('[csong] Error:', e.message || e);
            await react('❌');
            await conn.sendMessage(
                from,
                { text: `❌ *csong Error:* ${e.message || 'Something went wrong. Please try again.'}` },
                { quoted: mek }
            );
        }
    }
);
