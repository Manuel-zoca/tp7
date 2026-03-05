const fs = require("fs");
const path = require("path");
const P = require("pino");
const QRCode = require("qrcode");
const express = require("express");
const axios = require("axios");

const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} = require("baileys");

const { handleTabela } = require("./handlers/tabelaHandler");
const { handlePagamento } = require("./handlers/pagamentoHandler");
const { setupScheduler, setGroupOpenClose } = require("./scheduler");

const CONFIG_PATH = path.join(__dirname, "config.json");
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

const logger = P({ level: "silent" });

/* =============================
   🌐 SERVIDOR WEB (ANTI SLEEP)
============================= */

const app = express();

app.get("/", (req, res) => {
  res.send("🤖 TopBot ONLINE");
});

app.get("/ping", (req, res) => {
  res.send("pong");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🌐 WebServer ativo na porta", PORT);
});

/* =============================
   🔁 KEEP ALIVE INTERNO
============================= */

setInterval(async () => {
  try {
    const url = process.env.RENDER_EXTERNAL_URL || "http://localhost:" + PORT;
    await axios.get(url);
    console.log("🔄 KeepAlive ping");
  } catch {}
}, 240000); // 4 minutos


/* =============================
   🔧 FUNÇÕES BOT
============================= */

function isAllowedGroup(jid) {
  if (!jid.endsWith("@g.us")) return true;
  return (config.allowedGroups || []).includes(jid);
}

function unwrapMessage(message) {
  if (!message) return null;
  let m = message;

  if (m.ephemeralMessage?.message) m = m.ephemeralMessage.message;
  if (m.viewOnceMessage?.message) m = m.viewOnceMessage.message;
  if (m.viewOnceMessageV2?.message) m = m.viewOnceMessageV2.message;

  return m;
}

function extractText(msg) {
  if (!msg?.message) return "";

  const m = unwrapMessage(msg.message);
  if (!m) return "";

  const text =
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    "";

  return (text || "").trim();
}

function isCommand(text) {
  const t = (text || "").trim().toLowerCase();
  return t.startsWith("@") || t.startsWith(".");
}

async function isGroupAdmin(sock, groupJid, senderJid) {
  if (!groupJid.endsWith("@g.us")) return false;

  const meta = await sock.groupMetadata(groupJid);
  const found = meta.participants.find(p => p.id === senderJid);

  return found?.admin === "admin" || found?.admin === "superadmin";
}

async function tryDeleteCommandMessage(sock, jid, msgKey) {
  try {
    await sock.sendMessage(jid, { delete: msgKey });
  } catch {}
}

async function react(sock, msg, emoji) {
  await sock.sendMessage(msg.key.remoteJid, {
    react: {
      text: emoji,
      key: msg.key
    }
  });
}

function getSaudacao() {
  const hora = new Date().getHours();

  if (hora >= 5 && hora < 12) return "🌅 *Bom dia*";
  if (hora >= 12 && hora < 18) return "☀️ *Boa tarde*";

  return "🌙 *Boa noite*";
}

async function handleTodos(sock, jid) {

  const meta = await sock.groupMetadata(jid);
  const mentions = meta.participants.map(p => p.id);

  const texto = `${getSaudacao()} 👋

📣 *ATENÇÃO PESSOAL!*`;

  await sock.sendMessage(jid, {
    text: texto,
    mentions
  });
}

/* =============================
   🚀 START BOT
============================= */

async function startBot() {

  console.log("🚀 Iniciando TopBot...");

  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    logger,
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    browser: ["TopBot", "Chrome", "1.0"]
  });

  sock.ev.on("connection.update", async (update) => {

    const { connection, qr, lastDisconnect } = update;

    if (qr) {
      console.log("\n📱 QR CODE GERADO\n");

      const qrBase64 = await QRCode.toDataURL(qr);

      console.log(qrBase64);
      console.log("\nCole em: https://base64.guru/converter/decode/image\n");
    }

    if (connection === "open") {

      console.log("✅ BOT CONECTADO");
      console.log("🆔 Meu ID:", sock.user.id);

      setupScheduler(sock);

      console.log("🚀 Bot pronto!");

    }

    if (connection === "close") {

      const reason = lastDisconnect?.error?.output?.statusCode;

      console.log("⚠️ Conexão fechada:", reason);

      if (reason !== DisconnectReason.loggedOut) {

        console.log("🔄 Reconectando...");
        setTimeout(startBot, 5000);

      } else {

        console.log("❌ Sessão expirada delete /auth");

      }

    }

  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("messages.upsert", async (m) => {

    const msg = m.messages?.[0];

    if (!msg) return;
    if (msg.key?.fromMe) return;
    if (!msg.message) return;

    const jid = msg.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");
    const sender = msg.key.participant || jid;

    if (!isAllowedGroup(jid)) return;

    const text = extractText(msg);
    const cmd = text.toLowerCase();

    console.log("📩", jid, text);

    if (cmd === "@tabela") {
      await react(sock, msg, "✅");
      await handleTabela(sock, jid, { pauseMs: 4000 });
      return;
    }

    if (cmd === "@pagamento" || cmd === "@p") {
      await react(sock, msg, "✅");
      await handlePagamento(sock, jid);
      return;
    }

    if (isGroup && isCommand(text)) {

      const admin = await isGroupAdmin(sock, jid, sender);

      if (!admin) return;

      await tryDeleteCommandMessage(sock, jid, msg.key);

      if (cmd === "@todos") {
        await handleTodos(sock, jid);
        return;
      }

      if (cmd === "@abrir") {
        await setGroupOpenClose(sock, jid, true);
        return;
      }

      if (cmd === "@fechar") {
        await setGroupOpenClose(sock, jid, false);
        return;
      }

    }

  });

}

startBot().catch(err => console.log(err));
