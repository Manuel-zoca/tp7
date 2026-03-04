require("dotenv").config()

const cron = require("node-cron")
const fs = require("fs")
const path = require("path")
const { createClient } = require("@supabase/supabase-js")

const { handleTabela } = require("./handlers/tabelaHandler")

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

const CONFIG_PATH = path.join(__dirname, "config.json")

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"))
}

const delay = (ms) => new Promise((res) => setTimeout(res, ms))

function getSaudacaoByHour() {
  const hora = new Date().getHours()

  if (hora >= 5 && hora < 12) return "🌅 *Bom dia*"
  if (hora >= 12 && hora < 18) return "☀️ *Boa tarde*"

  return "🌙 *Boa noite*"
}

async function getGroupMentions(sock, jid) {

  const meta = await sock.groupMetadata(jid)

  return meta.participants.map(p => p.id)

}

async function sendPingAll(sock, jid, text) {

  const mentions = await getGroupMentions(sock, jid)

  await sock.sendMessage(jid,{
    text,
    mentions
  })

}

async function setGroupOpenClose(sock, jid, open) {

  const setting = open ? "not_announcement" : "announcement"

  await sock.groupSettingUpdate(jid, setting)

}

async function sendOpenMessage(sock, gid) {

  const text = `${getSaudacaoByHour()} 👋

🟢 *A Lodja já abriu, Amados Clientes*`

  await sendPingAll(sock, gid, text)

}

async function sendClosedMessage(sock, gid) {

  const text = `🔴 *A Lodja fechou por hoje!*`

  await sendPingAll(sock, gid, text)

}

async function sendCommandsMessage(sock, gid) {

  const text = `📌 *COMANDOS DISPONÍVEIS*

Digite:

🛒 *@tabela* → ver tabela de serviços  
💳 *@pagamento* → ver formas de pagamento`

  await sendPingAll(sock, gid, text)

}

function setupScheduler(sock){

  const cfg = loadConfig()

  const TZ = cfg.timezone || "Africa/Maputo"

  const autoGroups = cfg.autoPostGroups || []

  const pauseMs = cfg.tablePauseMs ?? 900

  async function runSequential(fn){

    for(const gid of autoGroups){

      try{

        await fn(gid)

        await delay(120000) // 2 minutos entre grupos

      }catch(e){

        console.log("Erro:",e.message)

      }

    }

  }

  cron.schedule("0 6 * * *", async()=>{

    await runSequential(async(gid)=>{

      await setGroupOpenClose(sock,gid,true)

      await sendOpenMessage(sock,gid)

    })

  },{ timezone:TZ })

  cron.schedule("30 6 * * *", async()=>{

    await runSequential(async(gid)=>{

      await handleTabela(sock,gid,{ pauseMs })

    })

  },{ timezone:TZ })

  cron.schedule("0 10 * * *", async()=>{

    await runSequential(async(gid)=>{

      await handleTabela(sock,gid,{ pauseMs })

    })

  },{ timezone:TZ })

  cron.schedule("0 15 * * *", async()=>{

    await runSequential(async(gid)=>{

      await handleTabela(sock,gid,{ pauseMs })

    })

  },{ timezone:TZ })

  cron.schedule("0 20 * * *", async()=>{

    await runSequential(async(gid)=>{

      await handleTabela(sock,gid,{ pauseMs })

    })

  },{ timezone:TZ })

  cron.schedule("0 9 * * *", async()=>{

    await runSequential(async(gid)=>{

      await sendCommandsMessage(sock,gid)

    })

  },{ timezone:TZ })

  cron.schedule("0 18 * * *", async()=>{

    await runSequential(async(gid)=>{

      await sendCommandsMessage(sock,gid)

    })

  },{ timezone:TZ })

  cron.schedule("0 22 * * *", async()=>{

    await runSequential(async(gid)=>{

      await setGroupOpenClose(sock,gid,false)

      await sendClosedMessage(sock,gid)

    })

  },{ timezone:TZ })

  console.log("🕒 Scheduler ativo.")

}

module.exports = { setupScheduler, setGroupOpenClose }