const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const IGNORED_MINTS = [
    'So11111111111111111111111111111111111111112', // WSOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'  // USDT
];

// دالة لجلب معلومات التوكن من DEXScreener
async function getTokenMetadata(mint) {
    try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { timeout: 3000 });
        if (res.data && res.data.pairs && res.data.pairs.length > 0) {
            const pair = res.data.pairs[0];
            return {
                name: pair.baseToken.name || 'N/A',
                symbol: pair.baseToken.symbol || 'N/A',
                priceUsd: pair.priceUsd ? `$${parseFloat(pair.priceUsd).toFixed(6)}` : 'N/A',
                marketCap: pair.fdv ? `$${Math.round(pair.fdv).toLocaleString()}` : 'N/A'
            };
        }
    } catch (e) {
        console.log("Could not fetch token details yet (likely brand new token).");
    }
    return null;
}

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
        console.error("Telegram Error:", error.response?.data || error.message);
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

            let targetMint = null;

            if (item.tokenTransfers && item.tokenTransfers.length > 0) {
                for (const t of item.tokenTransfers) {
                    if (t.mint && !IGNORED_MINTS.includes(t.mint)) {
                        targetMint = t.mint;
                        break;
                    }
                }
            }

            if (!targetMint) continue;

            // جلب البيانات الإضافية للتوكن
            const tokenMeta = await getTokenMetadata(targetMint);

            let msg = `🔥 <b>ALPHA ALERT - توكن جديد!</b>\n\n`;
            
            if (tokenMeta) {
                msg += `🏷 <b>الاسم:</b> ${tokenMeta.name} ($${tokenMeta.symbol})\n`;
                msg += `💵 <b>السعر:</b> <code>${tokenMeta.priceUsd}</code>\n`;
                msg += `📊 <b>القيمة السوقية:</b> <code>${tokenMeta.marketCap}</code>\n\n`;
            } else {
                msg += `⚡️ <i>(إطلاق حديث جداً - جاري جلب السعر...)</i>\n\n`;
            }

            msg += `📌 <b>النوع:</b> <code>${type}</code>\n`;
            msg += `💸 <b>الرسوم:</b> ${fee} SOL\n`;
            msg += `🪙 <b>العقد (Mint):</b> <code>${targetMint}</code>\n\n`;
            msg += `🔗 <b>المعرف:</b> <code>${signature.substring(0, 16)}...</code>`;

            const buttons = [
                [
                    { text: '🚀 Photon', url: `https://photon-sol.tinyastro.io/en/lp/${targetMint}` },
                    { text: '📊 DEXScreener', url: `https://dexscreener.com/solana/${targetMint}` }
                ],
                [
                    { text: '💊 Pump.fun', url: `https://pump.fun/${targetMint}` },
                    { text: '🛡 RugCheck', url: `https://rugcheck.xyz/tokens/${targetMint}` }
                ],
                [
                    { text: '🔍 Solscan', url: `https://solscan.io/tx/${signature}` }
                ]
            ];

            await sendTelegramMessage(msg, buttons);
        }
    } catch (err) {
        console.error("Webhook processing error:", err.message);
    }
});

app.get('/', (req, res) => {
    res.send('Bot is active!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
