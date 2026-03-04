const { handleTeste } = require("./testeHandler")

async function handleMessage(sock, msg){

const jid = msg.key.remoteJid

const text =
msg.message?.conversation ||
msg.message?.extendedTextMessage?.text ||
msg.message?.imageMessage?.caption ||
""

const message = text.toLowerCase().trim()

console.log("📩 comando:", message)

if(message === "@teste"){
return handleTeste(sock,msg)
}

}

module.exports = { handleMessage }