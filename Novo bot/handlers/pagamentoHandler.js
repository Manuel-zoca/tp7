async function handlePagamento(sock, jid) {
  const MSG = `📱 *Formas de Pagamento Atualizadas* 💳

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

  await sock.sendMessage(jid, { text: MSG });
}

module.exports = { handlePagamento };