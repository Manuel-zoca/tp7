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
const { handleTodos } = require("./handlers/todosHandler");
const { setupScheduler, setGroupOpenClose } = require("./scheduler");

const CONFIG_PATH = path.join(__dirname,"config.json");
const STATE_PATH = path.join(__dirname,"scheduler_state.json");

const config = JSON.parse(fs.readFileSync(CONFIG_PATH));

const logger = P({ level:"silent" });

let sock;

/* ==============================
UTIL
============================== */

function delay(ms){
return new Promise(res=>setTimeout(res,ms))
}

/* ==============================
STATUS BOT
============================== */

const BOT={
connected:false,
groups:[],
logs:[]
};

function log(msg){

const t=new Date().toLocaleTimeString("pt-MZ",{timeZone:"Africa/Maputo"});
const line=`[${t}] ${msg}`;

console.log(line);

BOT.logs.unshift(line);
if(BOT.logs.length>50)BOT.logs.pop();

}

/* ==============================
HORA MAPUTO
============================== */

function mozNow(){
return new Date(
new Date().toLocaleString("en-US",{timeZone:"Africa/Maputo"})
);
}

/* ==============================
STATE
============================== */

function loadState(){

if(!fs.existsSync(STATE_PATH)){

fs.writeFileSync(STATE_PATH,JSON.stringify({
date:"",
executed:[]
},null,2));

}

return JSON.parse(fs.readFileSync(STATE_PATH));

}

function saveState(data){
fs.writeFileSync(STATE_PATH,JSON.stringify(data,null,2));
}

/* ==============================
TAREFAS
============================== */

const TASKS=[
{name:"abrir",time:"06:00"},
{name:"tabela1",time:"06:30"},
{name:"tabela2",time:"10:00"},
{name:"tabela3",time:"15:00"},
{name:"tabela4",time:"20:00"},
{name:"fechar",time:"22:00"}
];

function minutes(t){
const[h,m]=t.split(":").map(Number);
return h*60+m;
}

/* ==============================
EXECUTAR TAREFA COM INTERVALO
============================== */

async function executeTask(name){

for(const jid of config.autoPostGroups){

try{

log(`➡️ Executando ${name} no grupo ${jid}`)

if(name==="abrir"){
await setGroupOpenClose(sock,jid,true)
}

if(name==="fechar"){
await setGroupOpenClose(sock,jid,false)
}

if(name.startsWith("tabela")){
await handleTabela(sock,jid)
}

/* intervalo entre grupos */
await delay(4000)

}catch(e){

log("Erro tarefa "+name+" -> "+e.message)

}

}

log("✅ Executou tarefa "+name)

}

/* ==============================
RECOVER
============================== */

async function recoverTasks(){

const now=mozNow()
const current=now.getHours()*60+now.getMinutes()

let state=loadState()

const today=now.toISOString().slice(0,10)

if(state.date!==today){

state={date:today,executed:[]}
saveState(state)

}

let faltam=[]

for(const t of TASKS){

if(minutes(t.time)<=current && !state.executed.includes(t.name)){

log("⚡ Recuperando tarefa "+t.name)

await executeTask(t.name)

/* intervalo entre tarefas */
await delay(5000)

state.executed.push(t.name)

saveState(state)

}
else if(!state.executed.includes(t.name)){
faltam.push(t)
}

}

log(`🕒 ${faltam.length} tarefas faltam hoje`)

faltam.forEach(t=>{
log(`⏳ ${t.name} às ${t.time}`)
})

}

/* ==============================
WEB SERVER
============================== */

const app=express()
app.use(express.json())

app.get("/",(req,res)=>{

res.send(`
<h1>🤖 TopBot Online</h1>
Status: ${BOT.connected?"ONLINE":"OFFLINE"}
<br><br>
Grupos: ${BOT.groups.length}
<br><br>
<a href="/ping">Ping</a>
`)

})

app.get("/ping",(req,res)=>res.send("pong"))

const PORT=process.env.PORT||3000

app.listen(PORT,()=>{
log("🌐 WebServer ativo "+PORT)
})

/* ==============================
KEEP ALIVE
============================== */

setInterval(async()=>{

try{

const url=process.env.RENDER_EXTERNAL_URL||`http://localhost:${PORT}`
await axios.get(url)

}catch{}

},240000)

/* ==============================
BOT
============================== */

async function startBot(){

log("🚀 Iniciando TopBot")

const{state,saveCreds}=await useMultiFileAuthState("./auth")

const{version}=await fetchLatestBaileysVersion()

sock=makeWASocket({

logger,
version,

auth:{
creds:state.creds,
keys:makeCacheableSignalKeyStore(state.keys,logger)
},

browser:["TopBot","Chrome","1.0"]

})

/* conexão */

sock.ev.on("connection.update",async(update)=>{

const{connection,lastDisconnect,qr}=update

if(qr){

console.log("\n📱 QR CODE GERADO\n")

const qrBase64=await QRCode.toDataURL(qr)
console.log(qrBase64)

}

if(connection==="open"){

BOT.connected=true

log("✅ BOT CONECTADO")

const groups=await sock.groupFetchAllParticipating()
BOT.groups=Object.values(groups)

console.log(`\n📊 ${BOT.groups.length} grupos:\n`)

BOT.groups.forEach((g,i)=>{
console.log(`${i+1}. ${g.subject}`)
console.log(g.id)
})

await recoverTasks()

setupScheduler(sock)

log("🚀 Bot pronto")

}

if(connection==="close"){

const reason=lastDisconnect?.error?.output?.statusCode

log("⚠️ Conexão fechada "+reason)

if(reason!==DisconnectReason.loggedOut){

log("🔄 reconectando...")
setTimeout(startBot,5000)

}else{

log("❌ sessão expirada delete /auth")

}

}

})

/* ==============================
LER MENSAGENS
============================== */

sock.ev.on("messages.upsert", async ({ messages, type }) => {

if(type !== "notify") return

const msg = messages[0]

if(!msg.message) return
if(msg.key.fromMe) return

const jid = msg.key.remoteJid

const text =
msg.message.conversation ||
msg.message.extendedTextMessage?.text ||
""

log(`📩 ${jid} -> ${text}`)

try{

const comandos=[
"@teste",
"@todos",
"@tabela",
".t",
"@pagamento",
".p",
"@abrir",
"@fechar"
]

if(comandos.some(c=>text.startsWith(c))){

if(jid.endsWith("@g.us")){

await sock.sendMessage(jid,{
delete: msg.key
})

}

}

/* comandos */

if(text === "@teste"){
await sock.sendMessage(jid,{text:"✅ Bot funcionando"})
}

else if(text === "@todos"){
await handleTodos(sock,jid)
}

else if(text.startsWith("@tabela") || text === ".t"){
await handleTabela(sock,jid)
}

else if(text.startsWith("@pagamento") || text === ".p"){
await handlePagamento(sock,jid)
}

else if(text === "@abrir"){
await setGroupOpenClose(sock,jid,true)
}

else if(text === "@fechar"){
await setGroupOpenClose(sock,jid,false)
}

}catch(e){

log("Erro comando "+e.message)

}

})

sock.ev.on("creds.update",saveCreds)

}

startBot()
