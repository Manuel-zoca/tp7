const fs = require("fs");
const path = require("path");
const cron = require("cron");

/**
 * Função principal que envia promoções para grupos em horários agendados.
 * Os IDs dos grupos serão importados de um array externo (ex: index.js ou groups.js).
 * @param {Object} sock - Instância do Baileys
 * @param {Array<string>} groupIds - Lista de IDs dos grupos para envio (máx. 4)
 */
async function schedulePromotions(sock, groupIds) {
    // Limitar para no máximo 4 grupos
    const targetGroups = groupIds.slice(0, 4);

    // ⏰ Definir horários de execução (4x ao dia) - formato: minuto hora * * *
    const cronTimes = [
        "37 10 * * *",   // 10:35
        "35 12 * * *",   // 12:35
        "35 17 * * *",   // 17:35
        "35 21 * * *",   // 21:35
    ];

    cronTimes.forEach(cronTime => {
        new cron.CronJob(cronTime, async () => {
            const now = new Date().toLocaleString("pt-BR", { timeZone: "Africa/Maputo" });
            console.log(`\n[PROMO SCHEDULER] 🕒 Iniciando disparo agendado às ${now} (Horário de Moçambique)`);

            for (const groupId of targetGroups) {
                try {
                    console.log(`[PROMO] 🚀 Iniciando envio para grupo: ${groupId}`);

                    // ✅ Obter participantes para menção
                    const groupMetadata = await sock.groupMetadata(groupId).catch(() => null);
                    if (!groupMetadata) {
                        console.warn(`[PROMO] ⚠️ Não consegui carregar os dados do grupo ${groupId}`);
                        continue; // Pula para o próximo grupo
                    }
                    const mentions = groupMetadata.participants.map(p => p.id);

                    // 🔎 Caminho das imagens (usa a pasta "fotos/")
                    const tabelaImg = path.join(__dirname, "../fotos/tabela.jpg");
                    const ilimitadoImg = path.join(__dirname, "../fotos/ilimitado.png");
                    const netflixImg = path.join(__dirname, "../fotos/Netflix.jpeg");

                    // ⏳ Função auxiliar para esperar
                    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

                    // 1️⃣ Envia tabela de pacotes
                    if (fs.existsSync(tabelaImg)) {
                        await sock.sendMessage(groupId, {
                            image: fs.readFileSync(tabelaImg),
                            caption: "📊 *Tabela Completa de Pacotes Atualizada!*"
                        });
                        await sleep(5000);
                    }

                    // 2️⃣ Envia plano Ilimitado
                    if (fs.existsSync(ilimitadoImg)) {
                        const legendaIlimitado = `📞 *TUDO TOP VODACOM*\n📍 Chamadas e SMS ilimitadas para Todas Redes\n\n📆 30 dias\n\n450MT 🔥 11GB + ilimitado chamadas/SMS\n550MT 🔥 16GB + ilimitado chamadas/SMS\n650MT 🔥 21GB + ilimitado chamadas/SMS\n850MT 🔥 31GB + ilimitado chamadas/SMS\n1080MT 🔥 41GB + ilimitado chamadas/SMS\n1300MT 🔥 51GB + ilimitado chamadas/SMS\n\n> TOPAINETGIGAS 🛜✅`;
                        await sock.sendMessage(groupId, {
                            image: fs.readFileSync(ilimitadoImg),
                            caption: legendaIlimitado
                        });
                        await sleep(5000);
                    }

                    // 3️⃣ Envia promoção Netflix
                    if (fs.existsSync(netflixImg)) {
                        await sock.sendMessage(groupId, {
                            image: fs.readFileSync(netflixImg),
                            caption: "🎬 *Promoção Netflix Ativada!*"
                        });
                        await sleep(5000);
                    }

                    // 4️⃣ Envia formas de pagamento
                    const formasPagamento = `📱 *Formas de Pagamento Atualizadas* 💳\n
1. M-PESA 📱  
   - Número: 848619531  
   - DINIS MARTA  

2. E-MOLA 💸  
   - Número: 872960710  
   - MANUEL ZOCA  

3. BIM 🏦  
   - Conta nº: 1059773792  
   - CHONGO MANUEL  

Após efetuar o pagamento, por favor, envie o comprovante da transferência juntamente com seu contato.`;
                    await sock.sendMessage(groupId, { text: formasPagamento });
                    await sleep(4000);

                    // 5️⃣ Envia link + menção a todos
                    const linkMsg = `🌐 *Acesse nosso site:* https://topai-net-gigas.netlify.app/      

💎 Quem fizer pedidos pelo site ganha bônus exclusivo: *Bacela* 🎁  

@todos`;
                    await sock.sendMessage(groupId, {
                        text: linkMsg,
                        mentions
                    });

                    console.log(`[PROMO] ✅ Promoções enviadas com sucesso para: ${groupId}`);

                } catch (err) {
                    console.error(`❌ Erro ao enviar promoções para ${groupId}:`, err.message);
                }
            }

            console.log(`[PROMO SCHEDULER] ✅ Ciclo de disparos concluído às ${now} (Horário de Moçambique)`);

        }, null, true, "Africa/Maputo"); // ✅ FUSO HORÁRIO CORRETO PARA MOÇAMBIQUE
    });

    console.log(`[PROMO SCHEDULER] ✅ Agendamento configurado para 4x ao dia nos horários: 10:35, 12:35, 17:35, 21:35 (África/Maputo)`);
    console.log(`[PROMO SCHEDULER] 📩 Grupos alvo:`, targetGroups);
}

module.exports = { schedulePromotions };