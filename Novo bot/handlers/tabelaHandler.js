const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const MSG1 = `INTERNET DA VODACOM

🛍️PACOTES DIÁRIOS

1000MB = 25MT 💵
2000MB = 50MT 💵
3000MB = 75MT 💵
4000MB = 100MT 💵
5000MB = 125MT 💵
7000MB = 175MT 💵
10000MB = 250MT 💵

🛍️PACOTES MENSAIS 
4857MB   150MT
8057MB    230MT
10257MB  285MT
13257MB  355MT
15857MB   425 MT
18857MB   500MT
22857MB  600MT
30857MB  800MT
50857MB  1300MT`;

const MSG2 = `💎 PACOTES DIAMANTE MENSAIS
Chamadas + SMS ilimitadas + 11GB = 450MT 💵
Chamadas + SMS ilimitadas + 15GB = 550MT 💵
Chamadas + SMS ilimitadas + 21GB = 750MT 💵
Chamadas+SMS ilimitadas +31GB
=1000MT💵
Chamadas + SMS ilimitadas + 51GB = 1450MT 💵

✅NB: Válido apenas para Vodacom`;

const MSG3 = `📱 *Formas de Pagamento Atualizadas* 💳

1. M-PESA 📱  
   - Número: 851470605
   - MANUEL ZOCA 

2. E-MOLA 💸  
   - Número: 872960710  
   - MANUEL ZOCA  

3. BIM 🏦  
   - Conta nº: 1059773792  
   - CHONGO MANUEL  

Após efetuar o pagamento, por favor, envie o comprovante da transferência juntamente com seu contato.`;

const MSG4 = `⚠️ NOTAS IMPORTANTES

• Mensais → NÃO usar Txuna ativo
• Ilimitados (Diamante) → NÃO usar Txuna ativo`;

async function handleTabela(sock, jid, opts = {}) {
  const pauseMs = typeof opts.pauseMs === "number" ? opts.pauseMs : 900;

  await sock.sendMessage(jid, { text: MSG1 });
  await delay(pauseMs);

  await sock.sendMessage(jid, { text: MSG2 });
  await delay(pauseMs);

  await sock.sendMessage(jid, { text: MSG3 });
  await delay(pauseMs);

  await sock.sendMessage(jid, { text: MSG4 });
}

module.exports = { handleTabela };