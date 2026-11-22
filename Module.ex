
module.exports = {
  // Basic bot settings
  BOT_NAME: "SA MI",
  OWNER_NAME: "Benfei Tech",
  OWNER_NUMBER: "2349060715145",
  PAIR_NUMBER: "2349060715145",

  PREFIX: ".",
  MODE: "PUBLIC",
  VERSION: "2.0.0",
  TIMEZONE: "Africa/Lagos",

  BOT_IMAGE: "https://res.cloudinary.com/dqqyvozdw/image/upload/v1794935183/isc6agwuwarqwbrbpour.jpg",

  // Authentication folder
  SESSION_FOLDER: "session",

  // Menu header
  HEADER_STYLE:
`╭─━─━─━─━─━─━─━─━─━─╮
│  ⚡ ʙᴇɴ 10 ᴍᴅ ʙᴏᴛ  ⚡
╰─━─━─━─━─━─━─━─━─━─╯`,

  // Reusable section formatter
  makeSection(label, lines = []) {
    const content = lines.map(line => `│ ${line}`).join("\n");

    return [
      `┌───〔 ${label} 〕───┐`,
      content,
      "└───────────────────┘"
    ].filter(Boolean).join("\n");
  }
};
