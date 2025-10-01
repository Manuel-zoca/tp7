const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node_modules', '@whiskeysockets', 'baileys', 'lib', 'Utils', 'auth-utils.js');

if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');

    // Procura a linha problemática e substitui
    const pattern = /logger\.trace\(\{ items: idsToFetch\.length \}, 'loading from store'\);/;
    const replacement = `if (typeof logger.trace === 'function') {
        logger.trace({ items: idsToFetch.length }, 'loading from store');
    } else {
        logger.debug({ items: idsToFetch.length }, 'loading from store');
    }`;

    if (pattern.test(content)) {
        content = content.replace(pattern, replacement);
        fs.writeFileSync(filePath, content, 'utf8');
        console.log('✅ Correção aplicada com sucesso em auth-utils.js');
    } else {
        console.log('⚠️ Padrão não encontrado. Verifique manualmente o arquivo.');
    }
} else {
    console.log('❌ Arquivo auth-utils.js não encontrado. Baileys não está instalado?');
}