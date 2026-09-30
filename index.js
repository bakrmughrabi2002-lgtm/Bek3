const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function sendTelegramMessage(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML',
            disable_web_page_preview: true
        });
    } catch (error) {
        console.error("Error sending Telegram message:", error.message);
    }
}

app.post('/webhook', async (req, res) => {
    const data = req.body;
    if (Array.isArray(data) && data.length > 0) {
        const tx = data[0];
        const signature = tx.signature || 'N/A';
        const type = tx.type || 'UNKNOWN';
        
        const message = `🚀 <b>تنبيه معاملة جديدة على Solana!</b>\n\n` +
                        `<b>النوع:</b> ${type}\n` +
                        `<b>المعرف:</b> <code>${signature}</code>\n\n` +
                        `<a href="https://solscan.io/tx/${signature}">عرض المعاملة على Solscan</a>`;
        
        await sendTelegramMessage(message);
    }
    res.status(200).send('OK');
});

app.get('/', (req, res) => {
    res.send('Bot is running live on Render!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
