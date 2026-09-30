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

function formatAge(createdAt) {
    if (!createdAt) return 'N/A';
    const diffMs = Date.now() - createdAt;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    if (diffMins < 60) return `${diffMins} دقيقة`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} ساعة`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} يوم`;
}

async function getTokenMetadataAndScore(mint) {
    try {
        const res = await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { timeout: 3500 });
        if (res.data && res.data.pairs && res.data.pairs.length > 0) {
            const pair = res.data.pairs[0];
            const mc = pair.fdv ? Math.round(pair.fdv) : 0;
            const liq = pair.liquidity?.usd ? Math.round(pair.liquidity.usd) : 0;
            
            if (liq < 1000 && mc > 0) {
                return { ignore: true };
            }

            let scoreTag = '🟡 مخاطرة متوسطة / متابعة';
            let ratioText = 'N/A';

            if (mc > 0 && liq > 0) {
                const ratio = ((liq / mc) * 100).toFixed(1);
                ratioText = `${ratio}%`;

                if (mc >= 5000 && mc <= 35000 && ratio >= 12 && ratio <= 40) {
                    scoreTag = '🟢 <b>فرصة ذهبية (High Potential 10x-100x)</b>';
                } else if (mc > 35000 && mc <= 100000) {
                    scoreTag = '🔵 <b>زخم متوسط (Momentum Phase)</b>';
                } else if (mc < 5000) {
                    scoreTag = '⚡️ <b>إطلاق حديث جداً (Micro Cap)</b>';
                }
            }

            const buys5m = pair.txns?.m5?.buys || 0;
            const sells5m = pair.txns?.m5?.sells || 0;
            const vol5m = pair.volume?.m5 ? `$${Math.round(pair.volume.m5).toLocaleString()}` : '$0';
            const age = formatAge(pair.pairCreatedAt);

            return {
                ignore: false,
                name: pair.baseToken.name || 'N/A',
                symbol: pair.baseToken.symbol || 'N/A',
                priceUsd: pair.priceUsd ? `$${parseFloat(pair.priceUsd).toFixed(6)}` : 'N/A',
                marketCap: mc ? `$${calcMC(mc)}` : 'N/A',
                liquidity: liq ? `$${liq.toLocaleString()}` : 'N/A',
                ratio: ratioText,
                scoreTag: scoreTag,
                age: age,
                vol5m: vol5m,
                buys5m: buys5m,
                sells5m: sells5m
            };
        }
    } catch (e) {
        console.error("DexScreener Fetch Error:", e.message);
    }
    return null;
}

function calcMC(mc) {
    return mc ? mc.toLocaleString() : 'N/A';
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

    if (item.instructions && Array.isArray(item.instructions)) {
        for (const inst of item.instructions) {
            if (inst.accounts && Array.isArray(inst.accounts)) {
                for (const acc of inst.accounts) {
                    if (typeof acc === 'string' && acc.length >= 32 && acc.length <= 44 && !IGNORED_MINTS.includes(acc)) {
                        // Basic check
                    }
                }
            }
        }
    }

    if (item.accountData && Array.isArray(item.accountData)) {
        for (const ad of item.accountData) {
            if (ad.account && !IGNORED_MINTS.includes(ad.account)) {
                mints.add(ad.account);
            }
        }
    }

    return Array.from(mints);
}

app.post('/webhook', async (req, res) => {
    // دائماً نرد بسرعة بـ 200 لمنع Helius من عمل Pause للـ Webhook
    res.status(200).send('OK');

    try {
        const body = req.body;
        const events = Array.isArray(body) ? body : [body];

        for (const item of events) {
            if (!item) continue;

            const signature = item.signature || (item.transaction ? item.transaction.signatures?.[0] : 'N/A') || 'N/A';
            const type = item.type || 'SWAP';

            const extracted = extractMints(item);
            if (extracted.length === 0) continue;

            const targetMint = extracted[0];

            console.log(`Processing Mint: ${targetMint}`);

            const tokenData = await getTokenMetadataAndScore(targetMint);

            if (tokenData && tokenData.ignore) {
                console.log(`Skipping low liquidity token: ${targetMint}`);
                continue;
            }

            let msg = `🎯 <b>ALPHA RADAR - تحليل الفرصة</b> 🎯\n\n`;
            
            if (tokenData) {
                msg += `🏷 <b>اسم العملة:</b> ${tokenData.name} ($${tokenData.symbol})\n`;
                msg += `📊 <b>التقييم:</b> ${tokenData.scoreTag}\n\n`;
                msg += `💵 <b>السعر الحالي:</b> <code>${tokenData.priceUsd}</code>\n`;
                msg += `💰 <b>الماركت كاب (MC):</b> <code>${tokenData.marketCap}</code>\n`;
                msg += `💧 <b>السيولة (LP):</b> <code>${tokenData.liquidity}</code> (نسبة LP: ${tokenData.ratio})\n`;
                msg += `⏱ <b>عمر التوكن:</b> <code>${tokenData.age}</code>\n`;
                msg += `📈 <b>حجم تداول (5m Vol):</b> <code>${tokenData.vol5m}</code>\n`;
                msg += `📊 <b>معاملات 5m:</b> 🟩 شراء ${tokenData.buys5m} | 🟥 بيع ${tokenData.sells5m}\n\n`;
            } else {
                msg += `⚡️ <b>التقييم:</b> 🟢 <b>إطلاق أولي مبكر جداً (Ultra Early LP)</b>\n`;
                msg += `ℹ️ <b>الحالة:</b> قيد الإنشاء / بداية منحنى Pump.fun\n\n`;
            }

            msg += `📌 <b>نوع العملية:</b> <code>${type}</code>\n`;
            msg += `🪙 <b>العقد (Mint):</b>\n<code>${targetMint}</code>\n\n`;
            msg += `🔗 <b>المعرف:</b> <code>${signature.substring(0, 16)}...</code>`;

            const buttons = [
                [
                    { text: '🚀 Photon (تداول سريع)', url: `https://photon-sol.tinyastro.io/en/lp/${targetMint}` },
                    { text: '📊 DEXScreener', url: `https://dexscreener.com/solana/${targetMint}` }
                ],
                [
                    { text: '💊 Pump.fun', url: `https://pump.fun/${targetMint}` },
                    { text: '🛡 RugCheck (تقرير تفصيلي)', url: `https://rugcheck.xyz/tokens/${targetMint}` }
                ],
                [
                    { text: '🔍 Solscan', url: `https://solscan.io/tx/${signature}` }
                ]
            ];

            await sendTelegramMessage(msg, buttons);
        }
    } catch (err) {
        console.error("Webhook Error:", err.message);
    }
});

app.get('/', (req, res) => {
    res.send('Alpha Smart Engine is active!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
