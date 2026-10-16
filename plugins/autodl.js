const fs = require("fs-extra");
const path = require("path");
const config = require("../config");
const { cmd } = require("../command");

const dbDir = path.join(__dirname, "../db");
const dbPath = path.join(dbDir, "autodl.json");

// JSON ഫയൽ ഇല്ലെങ്കിൽ പുതിയത് ഉണ്ടാക്കാൻ
if (!fs.existsSync(dbDir)) {
    fs.mkdirpSync(dbDir);
}
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ autodl: false }, null, 2));
}

cmd({
    pattern: "autodl",
    desc: "Enable or disable auto download",
    category: "owner",
    react: "⚙️",
    filename: __filename
},
async (conn, mek, m, { from, q, isOwner, reply, prefix }) => {
    try {
        // Owner പരിശോധന
        if (!isOwner) {
            return await reply("❌ Only the owner can use this command.");
        }

        const input = (q || "").trim().toLowerCase();

        if (!input || (input !== "on" && input !== "off")) {
            const currentStatus = global.autodl ? "ON" : "OFF";
            return await reply(`*Usage:* ${prefix || '.'}autodl on/off\n*Currently:* \`${currentStatus}\``);
        }

        if (input === "on") {
            global.autodl = true;
            fs.writeFileSync(dbPath, JSON.stringify({ autodl: true }, null, 2));
            return await reply("✅ Auto download enabled successfully.");
        } else if (input === "off") {
            global.autodl = false;
            fs.writeFileSync(dbPath, JSON.stringify({ autodl: false }, null, 2));
            return await reply("❌ Auto download disabled successfully.");
        }

    } catch (e) {
        console.error("AutoDL Command Error:", e);
        reply(`Error: ${e.message}`);
    }
});
