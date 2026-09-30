const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(message, inlineKeyboard = null) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log("Missing Telegram Credentials!");
        return;
    }
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    
    const payload = {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'HTML',
        disable_web_page_preview: true
    };

    if (inlineKeyboard) {
        payload.reply_markup = { inline_keyboard: inlineKeyboard };
    }

    try {
        await axios.post(url, payload);
    } catch (error) {
        console.error("Telegram API Error:", error.response?.data || error.message);
    }
}

app.post('/webhook', async (req, res) => {
    // إرجاع استجابة فورية لـ Helius لمنع انتهاء مهلة الطلب
    res.status(200).send('OK');

    try {
        const data = req.body;
        console.log("Incoming Webhook Event Received");

        const transactions = Array.isArray(data) ? data : [data];

        for (const tx of transactions) {
            if (!tx) continue;

            const signature = tx.signature || 'N/A';
            const type = tx.type || 'SWAP/TRANSFER';
            const fee = tx.fee ? (tx.fee / 1e9).toFixed(5) : '0';

            // استخراج المينت (Mint) الخاص بالتوكن بأكثر من طريقة
            let tokenAddress = null;
            
            if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
                tokenAddress = tx.tokenTransfers[0].mint;
            } else if (tx.instructions && tx.instructions.length > 0) {
                for (const inst of tx.instructions) {
                    if (inst.parsed?.info?.mint) {
                        tokenAddress = inst.parsed.info.mint;
                        break;
                    }
                }
            }

            let message = `🎯 <b>تنبيه Alpha - حركة جديدة!</b>\n\n`;
            message += `📌 <b>النوع:</b> <code>${type}</code>\n`;
            message += `💸 <b>الرسوم:</b> ${fee} SOL\n`;

            if (tokenAddress) {
                message += `🪙 <b>العقد:</b> <code>${tokenAddress}</code>\n`;
            }

            message += `\n🔗 <b>التوقيع:</b> <code>${signature.substring(0, 20)}...</code>\n`;

            const inlineKeyboard = [];

            if (tokenAddress) {
                inlineKeyboard.push([
                    { text: '🚀 Photon', url: `https://photon-sol.tinyastro.io/en/lp/${tokenAddress}` },
                    { text: '📊 DEXScreener', url: `https://dexscreener.com/solana/${tokenAddress}` }
                ]);
                inlineKeyboard.push([
                    { text: '💊 Pump.fun', url: `https://pump.fun/${tokenAddress}` },
                    { text: '🛡 RugCheck', url: `https://rugcheck.xyz/tokens/${tokenAddress}` }
                ]);
            }

            inlineKeyboard.push([
                { text: '🔍 Solscan', url: `https://solscan.io/tx/${signature}` }
            ]);

            await sendTelegramMessage(message, inlineKeyboard);
        }
    } catch (err) {
        console.error("Error processing webhook:", err.message);
    }
});

app.get('/', (req, res) => {
    res.send('Bot is running live on Render!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
