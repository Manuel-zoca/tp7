async function handleTeste(sock,msg){

const jid = msg.key.remoteJid

await sock.sendMessage(jid,{
text:"✅ BOT FUNCIONANDO!"
})

}

module.exports = { handleTeste }