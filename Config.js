const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers
} = require("@whiskeysockets/baileys");

const pino = require("pino");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const config = require("./config");

// ========================================
// BASIC SETTINGS
// ========================================

const logger = pino({ level: "silent" });
const startTime = Date.now();

let sock = null;
let reconnectTimer = null;
let connectedNotified = false;
let pairNumber = "";
let starting = false;

const delay = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const digits = value =>
  String(value || "").replace(/\D/g, "");

const ownNumber = () =>
  digits(sock?.user?.id?.split(":")[0]);

const ownerJid = () =>
  `${digits(config.OWNER_NUMBER)}@s.whatsapp.net`;

// ========================================
// ERROR HANDLING
// ========================================

process.on("uncaughtException", error => {
  console.error("[UNCAUGHT EXCEPTION]", error);
});

process.on("unhandledRejection", error => {
  console.error("[UNHANDLED REJECTION]", error);
});

// Keep the process alive
setInterval(() => {
  // Intentionally empty
}, 60000);

// ========================================
// UPTIME FORMATTER
// ========================================

function getUptime() {
  const seconds = Math.floor(
    (Date.now() - startTime) / 1000
  );

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

// ========================================
// PAIRING NUMBER
// ========================================

function askNumber() {
  return new Promise(resolve => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    let finished = false;

    const finish = value => {
      if (finished) return;

      finished = true;
      clearTimeout(timeout);
      rl.close();
      resolve(value);
    };

    const timeout = setTimeout(() => {
      finish("");
    }, 15000);

    rl.question("Enter WhatsApp number: ", answer => {
      finish(answer);
    });

    rl.on("close", () => {
      if (!finished) finish("");
    });
  });
}

async function getPairNumber() {
  while (!pairNumber) {
    pairNumber = digits(
      config.PAIR_NUMBER || process.env.PAIR_NUMBER
    );

    if (pairNumber) break;

    console.log("[PAIRING] No number configured.");

    const entered = await askNumber();

    if (entered) {
      pairNumber = digits(entered);
      break;
    }

    console.log(
      "[PAIRING] No input received. Retrying in 15 seconds."
    );

    await delay(15000);
  }

  return pairNumber;
}

// ========================================
// LOCAL JOKES AND QUOTES
// ========================================

const jokes = [
  "Why did the computer go to the doctor? It had a virus!",
  "Why was the phone wearing glasses? It lost its contacts!",
  "Why did the programmer quit? Because they didn't get arrays!",
  "What is a computer's favourite snack? Microchips!",
  "Why was the WiFi sad? Because it lost its connection!"
];

const quotes = [
  "Great things take time. Keep moving forward.",
  "Small progress is still progress.",
  "Believe in yourself and never stop learning.",
  "Your future is created by what you do today.",
  "Stay focused. Your hard work will pay off."
];

// ========================================
// COMMAND HELPERS
// ========================================

function makeResponse(label, lines) {
  return config.makeSection(label, lines);
}

function getSenderNumber(m) {
  const jid =
    m.key.participant ||
    m.key.remoteJid ||
    "";

  return digits(jid.split("@")[0].split(":")[0]);
}

function isOwner(m) {
  const sender = getSenderNumber(m);

  return (
    m.key.fromMe === true ||
    sender === digits(config.OWNER_NUMBER) ||
    sender === ownNumber()
  );
}

function getMessageText(message) {
  if (!message) return "";

  if (message.ephemeralMessage) {
    return getMessageText(
      message.ephemeralMessage.message
    );
  }

  if (message.viewOnceMessage) {
    return getMessageText(
      message.viewOnceMessage.message
    );
  }

  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.buttonsResponseMessage?.selectedButtonId ||
    message.listResponseMessage?.singleSelectReply?.selectedRowId ||
    ""
  );
}

// ========================================
// AUTOMATIC MENU GENERATOR
// ========================================

function buildMenu() {
  const categories = {};

  for (const [name, command] of Object.entries(commands)) {
    if (!categories[command.cat]) {
      categories[command.cat] = [];
    }

    categories[command.cat].push(
      `✦ ${config.PREFIX}${name} : ${command.desc}`
    );
  }

  const sections = Object.entries(categories).map(
    ([category, items]) => {
      return config.makeSection(
        category,
        items
      );
    }
  );

  const info = config.makeSection(
    "👑 ʙᴏᴛ ɪɴғᴏ",
    [
      `✦ ᴏᴡɴᴇʀ : ${config.OWNER_NAME}`,
      `✦ ᴘʀᴇғɪx : ${config.PREFIX}`,
      `✦ ᴍᴏᴅᴇ : ${config.MODE}`,
      `✦ ᴠᴇʀsɪᴏɴ : ${config.VERSION}`,
      "✦ sᴛᴀᴛᴜs : Online 🟢",
      `✦ ᴜᴘᴛɪᴍᴇ : ${getUptime()}`
    ]
  );

  return [
    config.HEADER_STYLE,
    "",
    info,
    "",
    ...sections
  ].join("\n");
}

// ========================================
// COMMANDS
// Add new commands as one object entry.
// ========================================

const commands = {

  menu: {
    cat: "📌 ᴍᴀɪɴ",
    desc: "Show all bot commands",

    run: async () => buildMenu()
  },

  ping: {
    cat: "📌 ᴍᴀɪɴ",
    desc: "Check bot response",

    run: async () =>
      makeResponse("⚡ ᴘɪɴɢ", [
        "✦ Status : Online 🟢",
        "✦ Response : Active"
      ])
  },

  alive: {
    cat: "📌 ᴍᴀɪɴ",
    desc: "Check if the bot is alive",

    run: async () =>
      makeResponse("🤖 ᴀʟɪᴠᴇ", [
        `✦ Bot : ${config.BOT_NAME}`,
        "✦ Status : Running 🟢",
        `✦ Uptime : ${getUptime()}`
      ])
  },

  owner: {
    cat: "📌 ᴍᴀɪɴ",
    desc: "Show bot owner",

    run: async () =>
      makeResponse("👑 ᴏᴡɴᴇʀ", [
        `✦ Name : ${config.OWNER_NAME}`,
        `✦ Number : ${config.OWNER_NUMBER}`
      ])
  },

  runtime: {
    cat: "📌 ᴍᴀɪɴ",
    desc: "Show bot uptime",

    run: async () =>
      makeResponse("⏱️ ʀᴜɴᴛɪᴍᴇ", [
        `✦ Uptime : ${getUptime()}`
      ])
  },

  joke: {
    cat: "🎭 ᴇɴᴛᴇʀᴛᴀɪɴᴍᴇɴᴛ",
    desc: "Get a random joke",

    run: async () => {
      const joke =
        jokes[Math.floor(Math.random() * jokes.length)];

      return makeResponse("😂 ʀᴀɴᴅᴏᴍ ᴊᴏᴋᴇ", [
        `✦ ${joke}`
      ]);
    }
  },

  quote: {
    cat: "🎭 ᴇɴᴛᴇʀᴛᴀɪɴᴍᴇɴᴛ",
    desc: "Get a motivational quote",

    run: async () => {
      const quote =
        quotes[Math.floor(Math.random() * quotes.length)];

      return makeResponse("💬 ǫᴜᴏᴛᴇ", [
        `✦ ${quote}`
      ]);
    }
  },

  time: {
    cat: "🕒 ᴛɪᴍᴇ ᴀɴᴅ ᴅᴀᴛᴇ",
    desc: "Show current local time",

    run: async () => {
      const now = new Date();

      const formatted = new Intl.DateTimeFormat(
        "en-GB",
        {
          timeZone: config.TIMEZONE,
          dateStyle: "full",
          timeStyle: "medium"
        }
      ).format(now);

      return makeResponse("🕒 ʟᴏᴄᴀʟ ᴛɪᴍᴇ", [
        `✦ Timezone : ${config.TIMEZONE}`,
        `✦ Date/Time : ${formatted}`
      ]);
    }
  }

};

// ========================================
// MESSAGE HANDLER
// ========================================

async function handleMessages(m) {
  try {
    if (!m.message || m.key.fromMe) return;

    const jid = m.key.remoteJid || "";

    // Ignore status broadcasts and newsletters
    if (
      jid === "status@broadcast" ||
      jid.endsWith("@newsletter")
    ) return;

    // Private mode: only owner can use commands
    const owner = isOwner(m);

    if (
      String(config.MODE).toUpperCase() === "PRIVATE" &&
      !owner
    ) return;

    const body = getMessageText(m.message).trim();

    if (!body.startsWith(config.PREFIX)) return;

    const input = body.slice(config.PREFIX.length).trim();

    if (!input) return;

    const [commandName, ...args] = input.split(/\s+/);

    const command = commands[commandName.toLowerCase()];

    if (!command) return;

    const chat = m.key.remoteJid;

    const result = await command.run({
      sock,
      message: m,
      args,
      sender: jid,
      owner
    });

    if (!result) return;

    // Menu: image with text fallback
    if (commandName.toLowerCase() === "menu") {
      try {
        await sock.sendMessage(chat, {
          image: { url: config.BOT_IMAGE },
          caption: result
        }, {
          quoted: m
        });
      } catch (error) {
        console.log("[MENU] Image failed; using text.");
        await sock.sendMessage(chat, {
          text: result
        }, {
          quoted: m
        });
      }

      return;
    }

    await sock.sendMessage(chat, {
      text: result
    }, {
      quoted: m
    });

  } catch (error) {
    console.error("[MESSAGE ERROR]", error.message);
  }
}

// ========================================
// RECONNECTION HANDLER
// ========================================

function scheduleReconnect(ms = 1500) {
  if (reconnectTimer) return;

  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    await startBot();
  }, ms);
}

// ========================================
// MAIN CONNECTION
// ========================================

async function startBot() {
  if (starting) return;

  starting = true;

  try {
    const { state, saveCreds } =
      await useMultiFileAuthState(config.SESSION_FOLDER);

    // Get pairing number before opening the socket
    if (!state.creds.registered) {
      await getPairNumber();
    }

    console.log("[BOT] Starting WhatsApp connection...");

    const currentSock = makeWASocket({
      auth: state,

      logger,

      browser: Browsers.ubuntu("Chrome"),

      printQRInTerminal: false,

      syncFullHistory: false,

      markOnlineOnConnect: false,

      shouldIgnoreJid: jid =>
        jid === "status@broadcast" ||
        jid.endsWith("@newsletter")
    });

    sock = currentSock;

    currentSock.ev.on("creds.update", saveCreds);

    currentSock.ev.on(
      "messages.upsert",
      async ({ messages, type }) => {
        if (type !== "notify") return;

        for (const message of messages) {
          await handleMessages(message);
        }
      }
    );

    // Request pairing code approximately 3 seconds
    // after creating the socket.
    if (!state.creds.registered) {
      setTimeout(async () => {
        try {
          if (currentSock !== sock) return;

          if (currentSock.authState.creds.registered) return;

          const code = await currentSock.requestPairingCode(
            pairNumber
          );

          const formattedCode = code
            .replace(/-/g, "")
            .match(/.{1,4}/g)
            .join("-");

          console.log("");
          console.log("================================");
          console.log("       SA MI PAIRING CODE");
          console.log("================================");
          console.log(`       ${formattedCode}`);
          console.log("================================");
          console.log("4 SHORT PAIRING STEPS:");
          console.log("1. Open WhatsApp on your phone.");
          console.log("2. Open Settings > Linked Devices.");
          console.log("3. Select Link a Device.");
          console.log("4. Choose Link with phone number and enter the code.");
          console.log("================================");
          console.log("");

        } catch (error) {
          console.error(
            "[PAIRING ERROR]",
            error.message
          );

          // End this socket so it can retry
          try {
            currentSock.end(error);
          } catch (_) {}

          scheduleReconnect(1500);
        }
      }, 3000);
    }

    // ====================================
    // CONNECTION UPDATES
    // ====================================

    currentSock.ev.on(
      "connection.update",
      async update => {
        const { connection, lastDisconnect } = update;

        if (connection === "open") {
          console.log("[BOT] WhatsApp connected successfully.");

          if (!connectedNotified) {
            connectedNotified = true;

            try {
              await currentSock.sendMessage(
                ownerJid(),
                {
                  text: makeResponse("🤖 ʙᴏᴛ ᴄᴏɴɴᴇᴄᴛᴇᴅ", [
                    `✦ Bot : ${config.BOT_NAME}`,
                    "✦ Status : Online 🟢",
                    `✦ Version : ${config.VERSION}`
                  ])
                }
              );
            } catch (error) {
              console.error(
                "[OWNER NOTIFICATION]",
                error.message
              );
            }
          }
        }

        if (connection === "close") {
          const statusCode =
            lastDisconnect?.error?.output?.statusCode;

          console.log(
            "[BOT] Connection closed:",
            statusCode || "Unknown"
          );

          if (statusCode === DisconnectReason.loggedOut ||
              statusCode === 401) {

            console.log(
              "[BOT] Session logged out. Removing session..."
            );

            try {
              fs.rmSync(config.SESSION_FOLDER, {
                recursive: true,
                force: true
              });
            } catch (error) {
              console.error("[SESSION ERROR]", error.message);
            }

            pairNumber = "";
            scheduleReconnect(1000);
            return;
          }

          // 515 means WhatsApp requires a restart.
          if (
            statusCode === 515 ||
            statusCode === DisconnectReason.restartRequired
          ) {
            scheduleReconnect(250);
            return;
          }

          scheduleReconnect(1500);
        }
      }
    );

  } catch (error) {
    console.error("[START ERROR]", error.message);
    scheduleReconnect(5000);

  } finally {
    starting = false;
  }
}

// ========================================
// START BOT
// ========================================

console.log("================================");
console.log(`Starting ${config.BOT_NAME}`);
console.log(`Version: ${config.VERSION}`);
console.log(`Mode: ${config.MODE}`);
console.log("================================");

startBot();
