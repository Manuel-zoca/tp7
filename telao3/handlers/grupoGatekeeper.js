// handlers/grupoGatekeeper.js
/**
 * Controla o estado de abertura/fechamento do grupo manualmente
 * @param {Object} sock - Instância do socket do Baileys
 * @param {Object} msg - Mensagem recebida
 * @param {Array} allowedGroups - Lista de IDs de grupos autorizados
 */
async function handleGrupoGatekeeper(sock, msg, allowedGroups) {
    const senderJid = msg.key.remoteJid;
    const sender = msg.key.participant || senderJid;

    if (!senderJid.endsWith("@g.us")) {
        await sock.sendMessage(senderJid, { text: "❌ Este comando só funciona em grupos." });
        return;
    }

    if (!allowedGroups.includes(senderJid)) {
        await sock.sendMessage(senderJid, { text: "🔒 Este grupo não está autorizado a usar este comando." });
        return;
    }

    const groupMetadata = await sock.groupMetadata(senderJid).catch(() => null);
    if (!groupMetadata) {
        await sock.sendMessage(senderJid, { text: "❌ Não foi possível obter informações do grupo." });
        return;
    }

    const groupAdmins = groupMetadata.participants
        .filter(p => p.admin)
        .map(p => p.id);

    if (!groupAdmins.includes(sender)) {
        await sock.sendMessage(senderJid, { text: "👮‍♂️ Apenas administradores podem usar este comando." });
        return;
    }

    let messageText = (
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        ""
    ).trim().toLowerCase();

    try {
        if (messageText === "@grupo off") {
            // ✅ Fechar grupo
            await sock.groupSettingUpdate(senderJid, "announcement");
            await sock.sendMessage(senderJid, { text: "✅ Grupo fechado manualmente! Apenas admins podem enviar mensagens." });
        } else if (messageText === "@grupo on") {
            // ✅ Abrir grupo
            await sock.groupSettingUpdate(senderJid, "not_announcement");
            await sock.sendMessage(senderJid, { text: "✅ Grupo aberto manualmente! Todos podem enviar mensagens." });
        }
    } catch (err) {
        console.error("❌ Erro ao alterar configuração do grupo:", err.message);
        await sock.sendMessage(senderJid, { text: "❌ Falha ao alterar configuração do grupo. Verifique se o bot é administrador." });
    }
}

/**
 * Agenda fechamento/abertura automática dos grupos autorizados
 * @param {Object} sock - Instância do socket do Baileys
 * @param {Array} allowedGroups - Lista de IDs de grupos autorizados
 */
function scheduleGroupAutomation(sock, allowedGroups) {
    // Configuração de horários — ALTERE AQUI se precisar
    const SCHEDULE = {
        OPEN:  { hours: 6,  minutes: 30 }, // ⬅️ Abre às 06:30 (Maputo)
        CLOSE: { hours: 22, minutes: 30 }  // ⬅️ Fecha às 22:30 (Maputo)
    };

    /**
     * Obtém a hora e minuto atual em Maputo (Africa/Maputo)
     * @returns {{ hours: number, minutes: number }}
     */
    const getMaputoTime = () => {
        const date = new Date();
        // converte para string com timezone e recria Date para garantir compatibilidade em Node
        const maputoStr = date.toLocaleString("en-US", { timeZone: "Africa/Maputo" });
        const maputoDate = new Date(maputoStr);
        return {
            hours: maputoDate.getHours(),
            minutes: maputoDate.getMinutes()
        };
    };

    // Armazena o último horário processado para evitar repetição no mesmo minuto
    let lastProcessedTime = null;

    // Verifica estado a cada minuto
    setInterval(async () => {
        const now = getMaputoTime();
        const timeKey = `${now.hours}:${now.minutes}`;

        // Evita processar o mesmo minuto múltiplas vezes
        if (lastProcessedTime === timeKey) return;
        lastProcessedTime = timeKey;

        // FECHAR: se for horário de fechar
        if (now.hours === SCHEDULE.CLOSE.hours && now.minutes === SCHEDULE.CLOSE.minutes) {
            for (const groupId of allowedGroups) {
                try {
                    const groupData = await sock.groupMetadata(groupId);
                    const isClosed = !!groupData?.announce; // announce = true => anúncio (fechado)
                    console.log(`[DEBUG] Estado atual do grupo ${groupId}: ${isClosed ? '🔒 FECHADO' : '🔓 ABERTO'}`);

                    if (isClosed) {
                        console.log(`[INFO] Grupo ${groupId} já está fechado. Pulando...`);
                        continue;
                    }

                    // ✅ Fechar grupo
                    await sock.groupSettingUpdate(groupId, "announcement");
                    await sock.sendMessage(groupId, {
                        text: `🌙 *Grupo fechado automaticamente*\n\n📞 *Se precisar dos nossos serviços, ligue:* *848619531*`
                    });
                    console.log(`${new Date().toLocaleString()} ✅ Grupo fechado automaticamente: ${groupId}`);
                } catch (err) {
                    console.error(`❌ Falha ao fechar grupo ${groupId}:`, err.message);
                }
            }
        }
        // ABRIR: se for horário de abrir
        else if (now.hours === SCHEDULE.OPEN.hours && now.minutes === SCHEDULE.OPEN.minutes) {
            for (const groupId of allowedGroups) {
                try {
                    const groupData = await sock.groupMetadata(groupId);
                    const isClosed = !!groupData?.announce;
                    console.log(`[DEBUG] Estado atual do grupo ${groupId}: ${isClosed ? '🔒 FECHADO' : '🔓 ABERTO'}`);

                    if (!isClosed) {
                        console.log(`[INFO] Grupo ${groupId} já está aberto. Pulando...`);
                        continue;
                    }

                    // ✅ Abrir grupo
                    await sock.groupSettingUpdate(groupId, "not_announcement");
                    await sock.sendMessage(groupId, {
                        text: `☀️ *Grupo aberto automaticamente*\n\n🛒 *Já podemos fazer os pedidos!*`
                    });
                    console.log(`${new Date().toLocaleString()} ✅ Grupo aberto automaticamente: ${groupId}`);
                } catch (err) {
                    console.error(`❌ Falha ao abrir grupo ${groupId}:`, err.message);
                }
            }
        }
    }, 60 * 1000); // Verifica a cada 1 minuto

    console.log(`⏰ Sistema de automação de grupos ativado (Abertura: ${String(SCHEDULE.OPEN.hours).padStart(2,'0')}:${String(SCHEDULE.OPEN.minutes).padStart(2,'0')} | Fechamento: ${String(SCHEDULE.CLOSE.hours).padStart(2,'0')}:${String(SCHEDULE.CLOSE.minutes).padStart(2,'0')} - Horário de Maputo)`);
}

module.exports = { handleGrupoGatekeeper, scheduleGroupAutomation };
