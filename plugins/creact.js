const { cmd } = require('../command');

// ─────────────────────────────────────────────────────────────────
//  creact – React to a WhatsApp Channel (Newsletter) message
//
//  How to use:
//  1. REPLY to a channel message and send:
//       .creact 🔥
//     (the bot reacts with the given emoji on that channel post)
//
//  2. Provide JID + messageId manually:
//       .creact 120363xxxxxxxx@newsletter MSGID123 🔥
//
//  The reaction is sent from the bot's connected number.
// ─────────────────────────────────────────────────────────────────

// Default emoji pool if user gives none
const DEFAULT_EMOJIS = ['❤️', '🔥', '👍', '🎉', '💯'];

cmd(
    {
        pattern: 'creact',
        alias: ['channelreact', 'nreact', 'reactchannel'],
        desc: 'React to a WhatsApp channel (newsletter) message using the bot number.',
        category: 'misc',
        react: '⚡',
        filename: __filename,
    },
    async (conn, mek, m, { from, q, prefix }) => {
        const react = async (emoji) =>
            conn.sendMessage(from, { react: { text: emoji, key: mek.key } });

        try {
            // ── Detect quoted / replied-to message ───────────────
            const quotedCtx =
                mek.message?.extendedTextMessage?.contextInfo ||
                mek.message?.imageMessage?.contextInfo ||
                mek.message?.videoMessage?.contextInfo ||
                mek.message?.audioMessage?.contextInfo ||
                null;

            const quotedId     = quotedCtx?.stanzaId || null;
            const quotedRemote = quotedCtx?.remoteJid || null;

            // ── Parse arguments ───────────────────────────────────
            // Possible call forms:
            //   .creact 🔥                          → reply mode, emoji given
            //   .creact                              → reply mode, random emoji
            //   .creact 120363xxx@newsletter ID 🔥  → manual mode
            const args = (q || '').trim().split(/\s+/);

            let channelJid = null;
            let messageId  = null;
            let emoji      = null;

            // Check if first arg looks like a newsletter JID
            if (args[0] && args[0].endsWith('@newsletter')) {
                channelJid = args[0];
                messageId  = args[1] || null;
                emoji      = args[2] || DEFAULT_EMOJIS[Math.floor(Math.random() * DEFAULT_EMOJIS.length)];
            } else {
                // Reply mode – use context from quoted message
                emoji = args[0] || DEFAULT_EMOJIS[Math.floor(Math.random() * DEFAULT_EMOJIS.length)];

                if (quotedRemote && quotedRemote.endsWith('@newsletter')) {
                    channelJid = quotedRemote;
                    messageId  = quotedId;
                } else if (quotedId) {
                    // Quoted message is in current chat – use current from if it's a newsletter
                    if (from.endsWith('@newsletter')) {
                        channelJid = from;
                        messageId  = quotedId;
                    }
                }

                // If still no channel JID but current chat is a newsletter, react to the quoted msg
                if (!channelJid && from.endsWith('@newsletter') && quotedId) {
                    channelJid = from;
                    messageId  = quotedId;
                }
            }

            // ── Validate ──────────────────────────────────────────
            if (!channelJid || !messageId) {
                return await conn.sendMessage(
                    from,
                    {
                        text:
                            `⚡ *Channel React*\n\n` +
                            `*How to use:*\n` +
                            `• Reply to a channel post and type:\n` +
                            `  \`${prefix}creact 🔥\`\n\n` +
                            `• Or provide manually:\n` +
                            `  \`${prefix}creact <channelJID@newsletter> <messageId> 🔥\`\n\n` +
                            `_Note: The bot's connected number must follow the channel._`,
                    },
                    { quoted: mek }
                );
            }

            // ── Send newsletter reaction ──────────────────────────
            // Baileys method: conn.newsletterReactMessage(jid, messageId, emoji)
            if (typeof conn.newsletterReactMessage === 'function') {
                await conn.newsletterReactMessage(channelJid, messageId, emoji);
            } else {
                // Fallback: use relayMessage with reactionMessage proto
                await conn.sendMessage(channelJid, {
                    react: {
                        text: emoji,
                        key: {
                            remoteJid: channelJid,
                            id: messageId,
                            fromMe: false,
                        },
                    },
                });
            }

            await react('✅');
            await conn.sendMessage(
                from,
                {
                    text:
                        `✅ *Reacted!*\n\n` +
                        `📢 *Channel:* \`${channelJid}\`\n` +
                        `🆔 *Message ID:* \`${messageId}\`\n` +
                        `${emoji} *Emoji:* ${emoji}`,
                },
                { quoted: mek }
            );
        } catch (e) {
            console.error('[creact] Error:', e.message || e);
            await conn.sendMessage(
                from,
                { react: { text: '❌', key: mek.key } }
            );
            await conn.sendMessage(
                from,
                {
                    text:
                        `❌ *creact Error:* ${e.message || 'Failed to react.'}\n\n` +
                        `_Make sure the bot number follows/is subscribed to the channel._`,
                },
                { quoted: mek }
            );
        }
    }
);
