// handlers/buttonTestHandler.js

async function handleButtonTest(sock, msg) {
  try {
    const jid = msg.key.remoteJid;
    const messageText = (
      msg.message?.conversation ||
      msg.message?.extendedTextMessage?.text ||
      msg.message?.text ||
      ""
    ).trim().toLowerCase();

    if (messageText !== "@menu") return;

    const isGroup = jid.endsWith("@g.us");

    if (isGroup) {
      // Envia menu em texto para grupos
      const menuText = `👋 *Olá! Escolha uma opção abaixo:*\n\n` +
        `📊 Digite *@tabela* para ver pacotes\n` +
        `💳 Digite *@pagamentos* para ver formas de pagamento\n` +
        `🛒 Digite *@compra <pacote>* para comprar\n` +
        `🎁 Digite *@promo* para ver promoções\n` +
        `🌐 Site: https://topai-net-gigas.netlify.app/`;

      await sock.sendMessage(jid, { text: menuText });
      return;
    }

    // ✅ FORMATO UNIVERSAL DE BOTÕES — TESTADO E FUNCIONAL
    const buttons = [
      {
        buttonId: 'btn_tabela',
        buttonText: { displayText: '📊 Tabela de Pacotes' },
        type: 1
      },
      {
        buttonId: 'btn_pagamento',
        buttonText: { displayText: '💳 Formas de Pagamento' },
        type: 1
      },
      {
        buttonId: 'btn_comprar',
        buttonText: { displayText: '🛒 Como Comprar' },
        type: 1
      }
    ];

    const buttonMessage = {
      text: "👋 *Olá! Sou a Topaí, sua assistente virtual!*",
      footer: "👇 Escolha uma opção abaixo",
      buttons: buttons,
      headerType: 1
    };

    // ✅ ENVIA COM MENSAGEM DE TEXTO + BOTÕES
    await sock.sendMessage(jid, {
      text: buttonMessage.text,
      footer: buttonMessage.footer,
      templateButtons: buttons, // ⚠️ IMPORTANTE: Algumas versões usam "templateButtons"
      ...buttonMessage
    });

    console.log(`[BOTÕES] Menu enviado para ${jid}`);

  } catch (err) {
    console.error("❌ Erro ao enviar botões:", err.message);
    // Fallback: envia menu em texto se der erro
    await sock.sendMessage(msg.key.remoteJid, {
      text: "⚠️ *Desculpe, os botões não estão disponíveis no momento.*\n\n" +
            "Por favor, use os comandos:\n" +
            "📊 *@tabela*\n" +
            "💳 *@pagamentos*\n" +
            "🛒 *@compra <pacote>*"
    });
  }
}

async function handleButtonResponse(sock, msg) {
  try {
    const jid = msg.key.remoteJid;

    const buttonId = 
      msg.message?.buttonsResponseMessage?.selectedButtonId ||
      msg.message?.templateButtonReplyMessage?.selectedId;

    if (!buttonId) return;

    console.log(`[BOTÃO CLICADO] ${buttonId} por ${jid}`);

    switch (buttonId) {
      case 'btn_tabela':
        await sock.sendMessage(jid, {
          text: `📱 *PACOTES VODACOM*\n\n` +
                `🕒 *24h:*\n1GB, 2GB, 3GB, 5GB, 10GB\n\n` +
                `📆 *7 dias:*\n2GB+700MB/dia até 10GB+700MB/dia\n\n` +
                `📅 *30 dias:*\n5GB, 10GB, 20GB, 40GB, 50GB, 80GB\n\n` +
                `🎬 *Netflix:*\nBacela + 1GB (7d) ou 2GB (30d)\n\n` +
                `🎵 *Spotify:*\nBacela + 1GB (7d) ou 2GB (30d)\n\n` +
                `📞 *Ilimitados:*\nChamadas/SMS + 9.5GB a 27.5GB\n\n` +
                `> Digite @tabela para ver tudo com detalhes!`
        });
        break;

      case 'btn_pagamento':
        await sock.sendMessage(jid, {
          text: `💳 *FORMAS DE PAGAMENTO*\n\n` +
                `1️⃣ *M-PESA*\nNúmero: 848619531\nNome: DINIS MARTA\n\n` +
                `2️⃣ *E-MOLA*\nNúmero: 872960710\nNome: MANUEL ZOCA\n\n` +
                `3️⃣ *BIM*\nConta: 1059773792\nNome: CHONGO MANUEL\n\n` +
                `✅ *Após pagar, envie o comprovante aqui!*`
        });
        break;

      case 'btn_comprar':
        await sock.sendMessage(jid, {
          text: `🛒 *COMO COMPRAR:*\n\n` +
                `1. Escolha seu pacote no site 👉 https://topai-net-gigas.netlify.app/\n` +
                `2. Ou digite: *@compra <nome do pacote>*\nEx: *@compra 10GB 30 dias*\n\n` +
                `3. Pague via M-PESA, E-MOLA ou BIM.\n` +
                `4. Envie o comprovante aqui.\n\n` +
                `💎 *BÔNUS: Quem compra pelo site ganha BACELA!*`
        });
        break;

      default:
        await sock.sendMessage(jid, { text: "❌ Opção não reconhecida. Tente novamente." });
    }

  } catch (err) {
    console.error("❌ Erro ao processar resposta de botão:", err.message);
  }
}

module.exports = { handleButtonTest, handleButtonResponse };