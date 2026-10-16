const fs = require("fs");
const path = require("path");
const config = require("../config");
const { cmd } = require("../command");

const dbDir = path.join(__dirname, "../db");
const dbPath = path.join(dbDir, "mode.json");

// Ensure DB directory and file exist
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ mode: config.MODE || "public" }, null, 2));
}

// Load saved mode on startup
try {
    const data = JSON.parse(fs.readFileSync(dbPath, "utf-8"));
    global.mode = data.mode || config.MODE || "public";
} catch {
    global.mode = config.MODE || "public";
}

cmd({
    pattern: "mode",
    alias: ["botmode", "setmode"],
    desc: "Change bot mode to public or private",
    category: "owner",
    react: "⚙️",
    filename: __filename
},
async (conn, mek, m, { from, q, isOwner, reply, prefix }) => {
    try {
        if (!isOwner) {
            return await reply("Only the owner can change the bot mode.");
        }

        const input = (q || "").trim().toLowerCase();

        if (!input || (input !== "public" && input !== "private")) {
            const current = (global.mode || config.MODE || "public").toUpperCase();
            return await reply(
                `*BOT MODE SETTING*\n\n` +
                `֍ *Current Mode:* \`${current}\`\n\n` +
                `*Usage:*\n` +
                `• ${prefix || '.'}mode public (Anyone can use the bot)\n` +
                `• ${prefix || '.'}mode private (Only the owner can use the bot)`
            );
        }

        if (input === "public") {
            global.mode = "public";
            config.MODE = "public";
            fs.writeFileSync(dbPath, JSON.stringify({ mode: "public" }, null, 2));
            return await reply("Bot mode has been changed to *PUBLIC*.\nEveryone can now use bot commands.");
        } else if (input === "private") {
            global.mode = "private";
            config.MODE = "private";
            fs.writeFileSync(dbPath, JSON.stringify({ mode: "private" }, null, 2));
            return await reply("Bot mode has been changed to *PRIVATE*.\nOnly the owner can now use bot commands.");
        }

    } catch (e) {
        console.error("Mode Command Error:", e);
        reply(`Error: ${e.message || e}`);
    }
});
