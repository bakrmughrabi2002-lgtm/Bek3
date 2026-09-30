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

// دالة جلب البيانات وتطبيق خوارزمية تقييم الأرقام المثالية
async function getTokenMetadataAndScore(mint) {
    try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { timeout: 3500 });
        if (res.data && res.data.pairs && res.data.pairs.length > 0) {
            const pair = res.data.pairs[0];
            const mc = pair.fdv ? Math.round(pair.fdv) : 0;
            const liq = pair.liquidity?.usd ? Math.round(pair.liquidity.usd) : 0;
            
            let scoreTag = '🟡 مخاطرة متوسطة / متابعة';
            let ratioText = 'N/A';

            if (mc > 0 && liq > 0) {
                const ratio = ((liq / mc) * 100).toFixed(1);
                ratioText = `${ratio}%`;

                // تطبيق الشروط الذهبية للاقتناص (MC بين 5,000$ و 35,000$ وسيولة ممتازة)
                if (mc >= 5000 && mc <= 35000 && ratio >= 12 && ratio <= 40) {
                    scoreTag = '🟢 <b>فرصة ذهبية (High Potential 10x-100x)</b>';
                } else if (mc > 35000 && mc <= 100000) {
                    scoreTag = '🔵 <b>زخم متوسط (Momentum Phase)</b>';
                } else if (mc < 5000) {
                    scoreTag = '⚡️ <b>إطلاق حديث جداً (Micro Cap)</b>';
                }
            }

            return {
                name: pair.baseToken.name || 'N/A',
                symbol: pair.baseToken.symbol || 'N/A',
                priceUsd: pair.priceUsd ? `$${parseFloat(pair.priceUsd).toFixed(6)}` : 'N/A',
                marketCap: mc ? `$${mc.toLocaleString()}` : 'N/A',
                liquidity: liq ? `$${liq.toLocaleString()}` : 'N/A',
                ratio: ratioText,
                scoreTag: scoreTag
            };
        }
    } catch (e) {
        // عدم توفر بيانات الشارت بعد
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

            const tokenData = await getTokenMetadataAndScore(targetMint);

            let msg = `🎯 <b>ALPHA RADAR - تحليل الفرصة</b> 🎯\n\n`;
            
            if (tokenData) {
                msg += `🏷 <b>التوكن:</b> ${tokenData.name} ($${tokenData.symbol})\n`;
                msg += `📊 <b>التقييم:</b> ${tokenData.scoreTag}\n\n`;
                msg += `💵 <b>السعر:</b> <code>${tokenData.priceUsd}</code>\n`;
                msg += `💰 <b>الماركت كاب:</b> <code>${tokenData.marketCap}</code>\n`;
                msg += `💧 <b>السيولة:</b> <code>${tokenData.liquidity}</code> (نسبة LP: ${tokenData.ratio})\n\n`;
            } else {
                msg += `⚡️ <b>التقييم:</b> 🟢 <b>إطلاق أولي مبكر جداً (Ultra Early LP)</b>\n\n`;
            }

            msg += `📌 <b>العملية:</b> <code>${type}</code>\n`;
            msg += `🪙 <b>العقد (Mint):</b> <code>${targetMint}</code>\n\n`;
            msg += `🔗 <b>المعرف:</b> <code>${signature.substring(0, 16)}...</code>`;

            const buttons = [
                [
                    { text: '🚀 Photon (تداول سريع)', url: `https://photon-sol.tinyastro.io/en/lp/${targetMint}` },
                    { text: '📊 DEXScreener', url: `https://dexscreener.com/solana/${targetMint}` }
                ],
                [
                    { text: '💊 Pump.fun', url: `https://pump.fun/${targetMint}` },
                    { text: '🛡 RugCheck (فحص أمان الحرق)', url: `https://rugcheck.xyz/tokens/${targetMint}` }
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
    res.send('Alpha Smart Engine is running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
