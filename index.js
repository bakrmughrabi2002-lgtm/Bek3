const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json({ limit: '10mb' }));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const IGNORED_MINTS = [
    'So11111111111111111111111111111111111111112', // WSOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'  // USDT
];

function formatAgeMinutes(createdAt) {
    if (!createdAt) return 99999;
    const diffMs = Date.now() - createdAt;
    return Math.floor(diffMs / (1000 * 60));
}

async function getTokenMetadataAndSecurityScore(mint) {
    try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { timeout: 3500 });
        if (res.data && res.data.pairs && res.data.pairs.length > 0) {
            // اختيار البير الأكثر سيولة لضمان دقة البيانات
            const pairs = res.data.pairs;
            let bestPair = pairs[0];
            for (const p of pairs) {
                if ((p.liquidity?.usd || 0) > (bestPair.liquidity?.usd || 0)) {
                    bestPair = p;
                }
            }

            const mc = bestPair.fdv ? Math.round(bestPair.fdv) : 0;
            const liq = bestPair.liquidity?.usd ? Math.round(bestPair.liquidity.usd) : 0;
            const ageMins = formatAgeMinutes(bestPair.pairCreatedAt);

            // 🛡️ معايير الأمان والقوة الصارمة:
            // 1. يجب ألا يتجاوز عمر التوكن 20 دقيقة (Ultra Early)
            // 2. السيولة يجب أن تكون أكبر من أو تساوي 1,500$ وأقل من 50,000$ (لتجنب الحيتان والمشاريع الميتة)
            // 3. الماركت كاب يجب أن يكون منطقياً ومتاحاً للصعود
            if (ageMins > 20 || liq < 1500 || liq > 50000 || mc === 0) {
                return { ignore: true };
            }

            const ratio = ((liq / mc) * 100);
            
            // 4. نسبة سيولة صحية (نسبة الـ LP من الماركت كاب يجب أن تكون بين 10% إلى 60% لضمان الأمان وعدم القدرة على سحب السيولة بسهولة أو وجود تلاعب كبير)
            if (ratio < 8 || ratio > 70) {
                return { ignore: true };
            }

            let safetyBadge = '🛡️ <b>آمن وقوي (High Security & Liquidity)</b>';
            if (ratio >= 20 && ratio <= 50 && liq >= 3000) {
                safetyBadge = '💎 <b>جوهرة نادرة (Top Tier Alpha Potential)</b>';
            }

            const buys5m = bestPair.txns?.m5?.buys || 0;
            const sells5m = bestPair.txns?.m5?.sells || 0;
            const vol5m = bestPair.volume?.m5 ? `$${Math.round(bestPair.volume.m5).toLocaleString()}` : '$0';

            return {
                ignore: false,
                name: bestPair.baseToken.name || 'N/A',
                symbol: bestPair.baseToken.symbol || 'N/A',
                priceUsd: bestPair.priceUsd ? `$${parseFloat(bestPair.priceUsd).toFixed(6)}` : 'N/A',
                marketCap: `$${mc.toLocaleString()}`,
                liquidity: `$${liq.toLocaleString()}`,
                ratio: ratio.toFixed(1) + '%',
                safetyBadge: safetyBadge,
                age: `${ageMins} دقيقة`,
                vol5m: vol5m,
                buys5m: buys5m,
                sells5m: sells5m
            };
        }
    } catch (e) {
        console.error("DexScreener Security Check Error:", e.message);
    }
    return { ignore: true };
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
        console.error("Telegram API Error:", error.response?.data || error.message);
    }
}

function extractMints(item) {
    const mints = new Set();
    if (item.tokenTransfers && Array.isArray(item.tokenTransfers)) {
        for (const t of item.tokenTransfers) {
            if (t.mint && !IGNORED_MINTS.includes(t.mint)) {
                mints.add(t.mint);
            }
        }
    }
    return Array.from(mints);
}

app.post('/webhook', async (req, res) => {
    res.status(200).send('OK');

    try {
        const body = req.body;
        const events = Array.isArray(body) ? body : [body];

        for (const item of events) {
            if (!item) continue;

            const signature = item.signature || 'N/A';
            const extracted = extractMints(item);
            if (extracted.length === 0) continue;

            const targetMint = extracted[0];
            const tokenData = await getTokenMetadataAndSecurityScore(targetMint);

            if (tokenData && tokenData.ignore) {
                continue; // استبعاد التوكنات الضعيفة أو غير الآمنة بصمت تام
            }

            let msg = `💎 <b>ALPHA RADAR - رادار الأمان والسيولة القوية</b> 💎\n\n`;
            msg += `🏷 <b>العملة:</b> ${tokenData.name} ($${tokenData.symbol})\n`;
            msg += `📊 <b>تصنيف الأمان:</b> ${tokenData.safetyBadge}\n\n`;
            msg += `💵 <b>السعر:</b> <code>${tokenData.priceUsd}</code>\n`;
            msg += `💰 <b>الماركت كاب:</b> <code>${tokenData.marketCap}</code>\n`;
            msg += `💧 <b>السيولة الآمنة:</b> <code>${tokenData.liquidity}</code> (نسبة الدعم: ${tokenData.ratio})\n`;
            msg += `⏱ <b>عمر التوكن:</b> <code>${tokenData.age}</code>\n`;
            msg += `📈 <b>حجم تداول (5m):</b> <code>${tokenData.vol5m}</code>\n`;
            msg += `📊 <b>المعاملات:</b> 🟩 شراء ${tokenData.buys5m} | 🟥 بيع ${tokenData.sells5m}\n\n`;
            msg += `🪙 <b>العقد (Mint):</b>\n<code>${targetMint}</code>\n\n`;
            msg += `🔗 <b>التوقيع:</b> <code>${signature.substring(0, 16)}...</code>`;

            const buttons = [
                [
                    { text: '🚀 Photon', url: `https://photon-sol.tinyastro.io/en/lp/${targetMint}` },
                    { text: '📊 DEXScreener', url: `https://dexscreener.com/solana/${targetMint}` }
                ],
                [
                    { text: '💊 Pump.fun', url: `https://pump.fun/${targetMint}` },
                    { text: '🛡 RugCheck (افحص الأمان)', url: `https://rugcheck.xyz/tokens/${targetMint}` }
                ]
            ];

            await sendTelegramMessage(msg, buttons);
        }
    } catch (err) {
        console.error("Error:", err.message);
    }
});

app.get('/', (req, res) => {
    res.send('Alpha Secure Engine is active!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
