function getSaudacao() {
  const hora = new Date().getHours();
  if (hora >= 5 && hora < 12) return "🌅 *Bom dia*";
  if (hora >= 12 && hora < 18) return "☀️ *Boa tarde*";
  return "🌙 *Boa noite*";
}

async function handleTodos(sock, jid, opts = {}) {
  if (opts.silent) return;

  if (!jid.endsWith("@g.us")) {
    return sock.sendMessage(jid, {
      text: "⚠️ O comando *@todos* funciona apenas em grupos."
    });
  }

  const meta = await sock.groupMetadata(jid);
  const participants = meta?.participants || [];

  const mentions = participants.map((p) => p.id).filter(Boolean);

  const texto = `${getSaudacao()} 👋

📣 *ATENÇÃO* 👀`;

  await sock.sendMessage(jid, { text: texto, mentions });
}

module.exports = { handleTodos };