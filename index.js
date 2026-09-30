const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// دالة إرسال رسائل التليجرام مع تنسيق HTML وأزرار تفاعلية
async function sendTelegramMessage(message, inlineKeyboard = null) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
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
        console.error("Error sending Telegram message:", error.response?.data || error.message);
    }
}

// مسار استلام المعاملات وتحليلها
app.post('/webhook', async (req, res) => {
    const data = req.body;

    if (Array.isArray(data) && data.length > 0) {
        for (const tx of data) {
            const signature = tx.signature || 'N/A';
            const type = tx.type || 'SWAP/TRANSFER';
            const fee = tx.fee ? (tx.fee / 1e9).toFixed(4) : '0';
            const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleTimeString('ar-EG') : 'الآن';

            // استخراج التوكن والمحفظة المعنية إن وجدت
            let tokenAddress = '';
            if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
                tokenAddress = tx.tokenTransfers[0].mint;
            } else if (tx.accountData && tx.accountData.length > 0) {
                tokenAddress = tx.accountData[0].account;
            }

            // بناء نص التنبيه المتقدم
            let message = `🎯 <b>تنبيه Alpha - معاملة جديدة!</b>\n\n`;
            message += `⏱ <b>الوقت:</b> ${timestamp}\n`;
            message += `📌 <b>نوع العملية:</b> <code>${type}</code>\n`;
            message += `💸 <b>العمولة:</b> ${fee} SOL\n`;
            
            if (tokenAddress) {
                message += `🪙 <b>العقد (Mint):</b> <code>${tokenAddress}</code>\n`;
            }
            
            message += `\n🔗 <b>المعرف:</b> <code>${signature}</code>\n`;

            // أزرار التحليل والتداول السريع
            const inlineKeyboard = [];
            
            if (tokenAddress) {
                inlineKeyboard.push([
                    { text: '🚀 Photon', url: `https://photon-sol.tinyastro.io/en/lp/${tokenAddress}` },
                    { text: '📊 DexScreener', url: `https://dexscreener.com/solana/${tokenAddress}` }
                ]);
                inlineKeyboard.push([
                    { text: '💊 Pump.fun', url: `https://pump.fun/${tokenAddress}` },
                    { text: '🛡 RugCheck', url: `https://rugcheck.xyz/tokens/${tokenAddress}` }
                ]);
            } else {
                inlineKeyboard.push([
                    { text: '🔍 Solscan', url: `https://solscan.io/tx/${signature}` }
                ]);
            }

            await sendTelegramMessage(message, inlineKeyboard);
        }
    }

    res.status(200).send('OK');
});

app.get('/', (req, res) => {
    res.send('Bot is running live on Render!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
