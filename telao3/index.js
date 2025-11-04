require('dotenv').config();
const { 
  makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion 
} = require("@whiskeysockets/baileys");
const QRCode = require("qrcode");
const { Boom } = require("@hapi/boom");
const express = require("express");
const path = require("path");
const fs = require("fs");
const fetch = require("node-fetch");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// ===================== Handlers (mantidos) =====================
const { handleMessage } = require("./handlers/messageHandler");
const { handleConcorrer } = require("./handlers/concorrerHandler");
const { handleListar } = require("./handlers/listarHandler");
const { handleRemove } = require("./handlers/removeHandler");
const { handlePagamento } = require("./handlers/pagamentoHandler");
const { handleBan } = require("./handlers/banHandler");
const { handleCompra } = require("./handlers/compraHandler");
const { handleTabela } = require("./handlers/tabelaHandler");
const { handleTodos } = require("./handlers/todosHandler");
const { handleReaction } = require("./handlers/reactionHandler");
const { handleAntiLinkMessage } = require("./handlers/antiLink");
const { handleCompra2 } = require("./handlers/compra2Handler");
const { handleGrupoGatekeeper, scheduleGroupAutomation } = require("./handlers/grupoGatekeeper");

// ✅ NOVO: Importar agendador de promoções e handlers de botão
const { schedulePromotions } = require("./handlers/schedulePromotions");
const { handleButtonTest, handleButtonResponse } = require("./handlers/buttonTestHandler");

// ===================== Supabase =====================
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const BUCKET = process.env.BUCKET_NAME || "whatsapp-auth";
const AUTH_FOLDER = process.env.AUTH_FOLDER || "./auth1";

// ===================== Grupos Autorizados =====================
const ALLOWED_GROUPS = [
  "120363281867895477@g.us",
  "120363252308434038@g.us",
  "120363393526547408@g.us",
  "120363280798975952@g.us",
  "120363415196759300@g.us",
  "120363418676894598@g.us",
];

const GRUPOS_PROMO = [ 
  "120363281867895477@g.us",
  "120363252308434038@g.us",
  "120363393526547408@g.us",
  "120363280798975952@g.us",
  "120363418676894598@g.us",
];

// ===================== Controle de mensagens =====================
let pendingMessages = [];
const processedMessages = new Set();

// Simple guard to avoid multiple simultaneous bot instances
let currentSock = null;
let restarting = false;

// ===================== Sincronização com Supabase =====================
async function syncAuthFromSupabase() {
  if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

  try {
    const { data, error } = await supabase.storage.from(BUCKET).list("", { limit: 100 });
    if (error) {
      console.error("❌ Erro ao listar Supabase:", error.message || error);
      return;
    }

    for (const file of data) {
      try {
        const { data: fileData, error: downloadErr } = await supabase.storage.from(BUCKET).download(file.name);
        if (downloadErr) throw downloadErr;

        const buffer = Buffer.from(await fileData.arrayBuffer());
        fs.writeFileSync(path.join(AUTH_FOLDER, file.name), buffer);
      } catch (err) {
        console.error("❌ Erro ao baixar", file.name, ":", err.message || err);
      }
    }
    console.log("✅ Sessão carregada do Supabase para local.");
  } catch (err) {
    console.error("❌ Falha ao sincronizar do Supabase:", err.message || err);
  }
}

let syncTimeout;
async function syncAuthToSupabase() {
  clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      if (!fs.existsSync(AUTH_FOLDER)) return;

      const files = fs.readdirSync(AUTH_FOLDER);
      let enviados = 0;
      for (const file of files) {
        try {
          const filePath = path.join(AUTH_FOLDER, file);
          if (!fs.existsSync(filePath)) continue;
          const content = fs.readFileSync(filePath);
          await supabase.storage.from(BUCKET).upload(file, content, { upsert: true });
          enviados++;
        } catch (err) {
          console.error("❌ Erro ao enviar", file, ":", err.message || err);
        }
      }
      if (enviados > 0) {
        console.log(`☁️ Sessão sincronizada: ${enviados} arquivo(s) enviados ao Supabase.`);
      }
    } catch (err) {
      console.error("❌ Falha ao sincronizar para Supabase:", err.message || err);
    }
  }, 3000);
}

// Periodically push auth to Supabase every 5 minutes
setInterval(() => {
  syncAuthToSupabase().catch(e => console.error('Interval sync error', e));
}, 5 * 60 * 1000);

// ===================== Helpers =====================
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

// Exponential backoff reconnect manager
async function safeRestart(deviceName, authFolder, attempt = 1) {
  if (restarting) return;
  restarting = true;
  const waitMs = Math.min(60_000, 1000 * Math.pow(2, Math.min(attempt, 6)));
  console.log(`🔁 Reiniciando em ${waitMs}ms (tentativa ${attempt})...`);
  await delay(waitMs);

  try {
    if (currentSock && currentSock.end) {
      try { currentSock.end(); } catch (e) { /* ignore */ }
    }
  } catch (err) { }

  restarting = false;
  try {
    await iniciarBot(deviceName, authFolder, attempt + 1);
  } catch (err) {
    console.error('❌ Falha ao reiniciar bot:', err?.message || err);
    // tenta novamente após 1 min se falhar
    setTimeout(() => safeRestart(deviceName, authFolder, attempt + 1), 60_000);
  }
}

// ===================== Bot =====================
async function iniciarBot(deviceName, authFolder, attempt = 1) {
  console.log(`🟢 Iniciando o bot para o dispositivo: ${deviceName} (attempt ${attempt})...`);

  await syncAuthFromSupabase();

  const { state, saveCreds } = await useMultiFileAuthState(authFolder);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    qrTimeout: 120_000,
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 30_000,
  });

  currentSock = sock;

  const processPendingMessages = async () => {
    for (const { jid, msg } of pendingMessages) {
      try { 
        await sock.sendMessage(jid, msg); 
        console.log(`📤 Mensagem pendente reenviada para ${jid}`);
      } catch (e) { 
        console.error("❌ Falha ao reenviar mensagem pendente:", e.message || e); 
      }
    }
    pendingMessages = [];
  };

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        const qrBase64 = await QRCode.toDataURL(qr);
        console.log(`📌 Escaneie o QR Code do dispositivo: ${deviceName}`);
        console.log(qrBase64.split(",")[1]);
      } catch (err) {
        console.error("❌ Erro ao gerar QR Code base64:", err.message || err);
      }
    }

    if (connection === "close") {
      const reason = lastDisconnect?.error;
      const statusCode = reason ? (new Boom(reason)?.output?.statusCode) : undefined;
      console.error(`⚠️ Conexão fechada. statusCode=${statusCode} reason=${reason?.message || reason}`);

      if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
        console.log("❌ Bot deslogado. Removendo credenciais locais e forçando re-login...");
        try {
          if (fs.existsSync(authFolder)) fs.rmSync(authFolder, { recursive: true, force: true });
        } catch (err) { console.error('Erro ao remover auth local:', err); }

        await safeRestart(deviceName, authFolder, attempt);
        return;
      }

      await safeRestart(deviceName, authFolder, attempt);

    } else if (connection === "open") {
      console.log(`✅ Bot conectado no dispositivo: ${deviceName}`);
      await processPendingMessages();

      try {
        const groups = await sock.groupFetchAllParticipating();
        console.log("\n📋 GRUPOS ATUAIS:");
        Object.values(groups).forEach(g => {
          console.log(`   🆔 ${g.id} — ${g.subject}`);
        });

        if (ALLOWED_GROUPS.length > 0) scheduleGroupAutomation(sock, ALLOWED_GROUPS);
        if (GRUPOS_PROMO.length > 0) {
          console.log(`🚀 Iniciando agendador de promoções...`);
          schedulePromotions(sock, GRUPOS_PROMO);
        }

      } catch (err) {
        console.error("❌ Não foi possível carregar a lista de grupos:", err.message || err);
      }
    }
  });

  sock.ev.on("creds.update", async () => {
    try {
      await saveCreds();
      await syncAuthToSupabase();
    } catch (err) {
      console.error('❌ Erro ao salvar credenciais:', err?.message || err);
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    if (!messages || !messages.length) return;
    const msg = messages[0];
    if (msg.key.fromMe) return;

    const msgId = msg.key.id;
    if (processedMessages.has(msgId)) return;
    processedMessages.add(msgId);
    if (processedMessages.size > 10000) {
      const arr = Array.from(processedMessages).slice(-5000);
      processedMessages.clear();
      arr.forEach(i => processedMessages.add(i));
    }

    const senderJid = msg.key.remoteJid;
    if (senderJid.endsWith("@g.us") && 
        !ALLOWED_GROUPS.includes(senderJid) && 
        !GRUPOS_PROMO.includes(senderJid)) return;

    let messageText = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.text ||
      ""
    ).replace(/[\u200e\u200f\u2068\u2069]/g, "").trim();
    const lowerText = messageText.toLowerCase();

    console.log(`💬 Nova mensagem de ${senderJid}: "${messageText}"`);

    try { await handleAntiLinkMessage(sock, msg); } 
    catch (err) { console.error("❌ AntiLink:", err.message || err); }

    if (msg.message?.buttonsResponseMessage) {
      await handleButtonResponse(sock, msg);
      return;
    }

    try {
      await handleButtonTest(sock, msg);

      if (lowerText.startsWith(".compra")) await handleCompra2(sock, msg);
      else if (lowerText === "@concorrentes") await handleListar(sock, msg);
      else if (lowerText.startsWith("@remove") || lowerText.startsWith("/remove")) await handleRemove(sock, msg);
      else if (lowerText.startsWith("@ban") || lowerText.startsWith("/ban")) await handleBan(sock, msg);
      else if (lowerText === "@pagamentos") await handlePagamento(sock, msg);
      else if (["@grupo on", "@grupo off"].includes(lowerText)) 
        await handleGrupoGatekeeper(sock, msg, ALLOWED_GROUPS);
      else if (lowerText.startsWith("@compra") || lowerText.startsWith("@rentanas") || lowerText.startsWith("@remove rentanas")) 
        await handleCompra(sock, msg);
      else if (senderJid.endsWith("@g.us") && lowerText === "@concorrencia") 
        await handleConcorrer(sock, msg);
      else if (lowerText === "@tabela") await handleTabela(sock, msg);
      else if (lowerText === "@todos") await handleTodos(sock, msg);
      else if (lowerText.startsWith("@") || lowerText.startsWith("/")) 
        await handleMessage(sock, msg);
      else if (['.n', '.t', '.i', '.s'].includes(lowerText)) 
        await handleTabela(sock, msg);

    } catch (err) {
      console.error("❌ Erro ao processar mensagem:", err.message || err);
      pendingMessages.push({ jid: senderJid, msg: { text: "❌ Ocorreu um erro ao processar sua solicitação." } });
    }
  });

  sock.ev.on("messages.reaction", async reactions => {
    for (const reactionMsg of reactions) {
      try {
        await handleReaction({ reactionMessage: reactionMsg, sock });
      } catch (err) {
        console.error("❌ Erro ao processar reação:", err.message || err);
      }
    }
  });

  sock.ev.on("group-participants.update", async ({ id, participants, action }) => {
    if (!ALLOWED_GROUPS.includes(id)) return;

    if (action === "add") {
      for (let participant of participants) {
        const nome = participant.split("@")[0];
        const mensagem = `@${nome}  *👋 Seja muito bem-vindo(a) ao grupo!*`;

        try {
          const ppUrl = await sock.profilePictureUrl(participant, "image").catch(() => null);
          if (ppUrl) {
            await sock.sendMessage(id, { image: { url: ppUrl }, caption: mensagem, mentions: [participant] });
          } else {
            await sock.sendMessage(id, { text: mensagem, mentions: [participant] });
          }
        } catch (err) {
          console.error("❌ Erro ao enviar boas-vindas:", err.message || err);
        }
      }
    }
  });

  return sock;
}

// ===================== Global Error Handlers =====================
process.on('unhandledRejection', (reason, p) => {
  console.error('Unhandled Rejection at:', p, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

// ===================== Inicialização =====================
iniciarBot("Dispositivo 1", AUTH_FOLDER).catch(err => {
  console.error('❌ Falha ao iniciar bot:', err?.message || err);
});

const PORT = process.env.PORT || 3000;
app.get("/", (_, res) => res.send("✅ TopBot rodando com sucesso!"));
app.listen(PORT, () => console.log(`🌐 Servidor HTTP ativo na porta ${PORT}`));

// ===================== 🔁 REFORTALECIMENTO CONTÍNUO =====================

// Auto-ping interno
setInterval(() => {
  fetch(`http://localhost:${PORT}`).catch(() => {});
}, 4 * 60 * 1000); // 4 minutos

// Watchdog de conexão
setInterval(async () => {
  if (!currentSock?.ws || currentSock?.ws?.readyState !== 1) {
    console.log("⚠️ Socket parece desconectado. Tentando reiniciar...");
    await safeRestart("Dispositivo 1", AUTH_FOLDER);
  }
}, 5 * 60 * 1000);

// Bloqueio de encerramento acidental
process.on("SIGINT", () => console.log("🛑 Interceptado Ctrl+C, ignorando encerramento."));
process.on("SIGTERM", () => console.log("🛑 Sinal de encerramento ignorado."));
