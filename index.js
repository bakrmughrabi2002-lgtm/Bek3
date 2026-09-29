require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const app = express();
app.use(bodyParser.json());

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// نقطة استقبال الـ Webhook
app.post('/helius-webhook', async (req, res) => {
    res.status(200).send('OK');

    const events = req.body;
    if (!Array.isArray(events) || events.length === 0) return;

    for (let event of events) {
        try {
            const tokenAddress = extractTokenAddress(event);
            if (!tokenAddress) continue;

            const dexData = await fetchTokenMarketData(tokenAddress);
            if (!dexData) continue;

            const marketCap = dexData.fdv || 0;
            const volume5m = dexData.volume?.m5 || 0;
            const buys5m = dexData.txns?.m5?.buys || 0;

            // الفلاتر: Market Cap بين $15K و $35K مع فوليوم وشراء متزايد
            if (marketCap >= 15000 && marketCap <= 35000 && volume5m >= 2000 && buys5m >= 10) {
                sendAlert(dexData);
            }
        } catch (err) {
            console.error('Error processing event:', err.message);
        }
    }
});

function extractTokenAddress(event) {
    if (event.tokenTransfers && event.tokenTransfers.length > 0) {
        return event.tokenTransfers[0].mint;
    }
    return null;
}

async function fetchTokenMarketData(tokenAddress) {
    try {
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`);
        if (response.data && response.data.pairs && response.data.pairs.length > 0) {
            return response.data.pairs[0];
        }
    } catch (e) {
        return null;
    }
    return null;
}

function sendAlert(pair) {
    const msg = `🚀 **رادار الفرص - عملة جديدة!**\n\n` +
                `🪙 **الرمز:** ${pair.baseToken.symbol}\n` +
                `💰 **القيمة السوقية:** $${Math.round(pair.fdv).toLocaleString()}\n` +
                `📊 **حجم التداول (5د):** $${Math.round(pair.volume?.m5 || 0).toLocaleString()}\n` +
                `🛒 **عدد الشراء (5د):** ${pair.txns?.m5?.buys} صفقة\n\n` +
                `📝 **العقد:** \`${pair.baseToken.address}\` \n\n` +
                `🔗 [DEXScreener](${pair.url}) | [Photon](https://photon-sol.tinyastro.io/en/r/@solana/${pair.baseToken.address})`;

    bot.sendMessage(CHAT_ID, msg, { parse_mode: 'Markdown', disable_web_page_preview: true });
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 الرادار يعمل الآن على المنفذ ${PORT}`));

