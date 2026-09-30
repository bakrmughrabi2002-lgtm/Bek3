const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WSOL_ADDRESS = 'So11111111111111111111111111111111111111112';

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
        console.error("Telegram API Error:", error.response?.data || error.message);
    }
}

app.post('/webhook', async (req, res) => {
    res.status(200).send('OK');

    try {
        const body = req.body;
        const events = Array.isArray(body) ? body : [body];

        for (const item of events) {
            if (!item) continue;

            const signature = item.signature || 'N/A';
            const type = item.type || 'SWAP';
            const fee = item.fee ? (item.fee / 1e9).toFixed(5) : '0';

            // استخراج التوكن الفعلي وتجاهل WSOL
            let targetMint = null;

            if (item.tokenTransfers && item.tokenTransfers.length > 0) {
                for (const t of item.tokenTransfers) {
                    if (t.mint && t.mint !== WSOL_ADDRESS) {
                        targetMint = t.mint;
                        break;
                    }
                }
                // إذا كانت الصفقة بين WSOL و WSOL أو لم ينطبق الشرط، نأخذ الأول
                if (!targetMint && item.tokenTransfers[0].mint) {
                    targetMint = item.tokenTransfers[0].mint;
                }
            }

            let msg = `🎯 <b>تنبيه Alpha - اقتناص توكن!</b>\n\n`;
            msg += `📌 <b>النوع:</b> <code>${type}</code>\n`;
            msg += `💸 <b>الرسوم:</b> ${fee} SOL\n`;

            if (targetMint) {
                msg += `🪙 <b>العقد المستهدف:</b> <code>${targetMint}</code>\n`;
            }

            msg += `\n🔗 <b>المعرف:</b> <code>${signature.substring(0, 16)}...</code>`;

            const buttons = [];
            if (targetMint && targetMint !== WSOL_ADDRESS) {
                buttons.push([
                    { text: '🚀 Photon', url: `https://photon-sol.tinyastro.io/en/lp/${targetMint}` },
                    { text: '📊 DEXScreener', url: `https://dexscreener.com/solana/${targetMint}` }
                ]);
                buttons.push([
                    { text: '💊 Pump.fun', url: `https://pump.fun/${targetMint}` },
                    { text: '🛡 RugCheck', url: `https://rugcheck.xyz/tokens/${targetMint}` }
                ]);
            }
            buttons.push([{ text: '🔍 Solscan', url: `https://solscan.io/tx/${signature}` }]);

            await sendTelegramMessage(msg, buttons);
        }
    } catch (err) {
        console.error("Webhook processing error:", err.message);
    }
});

app.get('/', (req, res) => {
    res.send('Bot is active and running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
