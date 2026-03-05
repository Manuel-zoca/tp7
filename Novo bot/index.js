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

const CONFIG_PATH = path.join(__dirname,"config.json");
const STATE_PATH = path.join(__dirname,"scheduler_state.json");

const config = JSON.parse(fs.readFileSync(CONFIG_PATH));

const logger = P({ level:"silent" });

let sock;

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
EXECUTAR TAREFA
============================== */

async function executeTask(name){

for(const jid of config.autoPostGroups){

if(name==="abrir")
await setGroupOpenClose(sock,jid,true);

if(name==="fechar")
await setGroupOpenClose(sock,jid,false);

if(name.startsWith("tabela"))
await handleTabela(sock,jid);

}

log("Executou tarefa "+name);

}

/* ==============================
RECOVER
============================== */

async function recoverTasks(){

const now=mozNow();

const current=now.getHours()*60+now.getMinutes();

let state=loadState();

const today=now.toISOString().slice(0,10);

if(state.date!==today){

state={date:today,executed:[]};

saveState(state);

}

for(const t of TASKS){

if(minutes(t.time)<=current && !state.executed.includes(t.name)){

log("⚡ executando "+t.name);

await executeTask(t.name);

state.executed.push(t.name);

saveState(state);

}

}

}

/* ==============================
WEB SERVER
============================== */

const app=express();

app.use(express.json());

app.get("/",(req,res)=>{

res.send(`
<html>
<head>
<title>TopBot Control Center</title>

<style>

body{
font-family:Arial;
background:#0f172a;
color:white;
padding:20px;
}

.card{
background:#1e293b;
padding:20px;
border-radius:10px;
margin-bottom:20px;
}

button{
padding:8px;
margin:5px;
}

</style>

</head>

<body>

<h1>🤖 TopBot Control Center</h1>

<div class="card">
Status: ${BOT.connected?"🟢 ONLINE":"🔴 OFFLINE"}
</div>

<div class="card">
<h3>Grupos</h3>

${BOT.groups.map(g=>`
<div>${g.subject}<br>${g.id}</div>
`).join("")}

</div>

<div class="card">

<input id="gid" placeholder="Group ID">

<br><br>

<button onclick="cmd('tabela')">Tabela</button>
<button onclick="cmd('pagamento')">Pagamento</button>
<button onclick="cmd('abrir')">Abrir</button>
<button onclick="cmd('fechar')">Fechar</button>

</div>

<div class="card">

<h3>Logs</h3>

${BOT.logs.map(l=>`<div>${l}</div>`).join("")}

</div>

<script>

async function cmd(command){

const group=document.getElementById("gid").value;

await fetch("/api/cmd",{
method:"POST",
headers:{"Content-Type":"application/json"},
body:JSON.stringify({group,command})
});

alert("Comando enviado");

}

</script>

</body>
</html>
`);

});

app.post("/api/cmd",async(req,res)=>{

const{group,command}=req.body;

try{

if(command==="tabela")
await handleTabela(sock,group);

if(command==="pagamento")
await handlePagamento(sock,group);

if(command==="abrir")
await setGroupOpenClose(sock,group,true);

if(command==="fechar")
await setGroupOpenClose(sock,group,false);

log("Comando manual "+command);

res.json({ok:true});

}catch(e){

res.json({error:e.message});

}

});

app.get("/ping",(req,res)=>res.send("pong"));

const PORT=process.env.PORT||3000;

app.listen(PORT,()=>{

log("🌐 WebServer ativo "+PORT);

});

/* ==============================
KEEP ALIVE
============================== */

setInterval(async()=>{

try{

const url=process.env.RENDER_EXTERNAL_URL||`http://localhost:${PORT}`;

await axios.get(url);

}catch{}

},240000);

/* ==============================
BOT
============================== */

async function startBot(){

log("🚀 Iniciando TopBot");

const{state,saveCreds}=await useMultiFileAuthState("./auth");

const{version}=await fetchLatestBaileysVersion();

sock=makeWASocket({

logger,
version,

auth:{
creds:state.creds,
keys:makeCacheableSignalKeyStore(state.keys,logger)
},

browser:["TopBot","Chrome","1.0"]

});

/* conexão */

sock.ev.on("connection.update",async(update)=>{

const{connection,lastDisconnect,qr}=update;

/* QR BASE64 */

if(qr){

console.log("\n📱 QR CODE GERADO\n");

const qrBase64=await QRCode.toDataURL(qr);

console.log("COPIE ESTA STRING BASE64:\n");

console.log(qrBase64);

console.log("\nCole no site:");
console.log("https://base64.guru/converter/decode/image\n");

}

if(connection==="open"){

BOT.connected=true;

log("✅ BOT CONECTADO");

const groups=await sock.groupFetchAllParticipating();

BOT.groups=Object.values(groups);

console.log(`\n📊 ${BOT.groups.length} grupos:\n`);

BOT.groups.forEach((g,i)=>{

console.log(`${i+1}. ${g.subject}`);
console.log(g.id);

});

await recoverTasks();

setupScheduler(sock);

log("🚀 Bot pronto");

}

if(connection==="close"){

const reason=lastDisconnect?.error?.output?.statusCode;

log("⚠️ Conexão fechada "+reason);

if(reason!==DisconnectReason.loggedOut){

log("🔄 reconectando...");

setTimeout(startBot,5000);

}else{

log("❌ sessão expirada delete /auth");

}

}

});

/* salvar sessão */

sock.ev.on("creds.update",saveCreds);

}

startBot();
