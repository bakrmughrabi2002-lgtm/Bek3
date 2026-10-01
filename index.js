const SOLANA_RPC = 'https://shared.us-east-1.getblock.io/37c04339fd954e9eb5783084d0233c25';
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json({ limit: '10mb' }));

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const IGNORED_MINTS = [
    'So11111111111111111111111111111111111111112',
    'EPjFWdd5AufqSSqeM2qn1zxybapC8G4wEGGkZwyTDt1v',
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
];

const sentTokensCache = new Map();

function formatAgeMinutes(createdAt) {
    if (!createdAt) return 99999;
    const diffMs = Date.now() - createdAt;
    return Math.floor(diffMs / (1000 * 60));
}

async function verifyEliteSecurity(mint) {
    try {
        const res = await axios.get(`https://api.rugcheck.xyz/v1/tokens/${mint}/report`);
        if (res.data) {
            const data = res.data;
            const markets = data.markets || [];
            
            let isLpBurned = false;
            for (const market of markets) {
                if (market.lp && (market.lp.lpLockedPct >= 99 || market.lp.lpBurnedPct >= 99)) {
                    isLpBurned = true;
                    break;
                }
            }
            
            const hasDanger = data.risks && data.risks.some(risk => risk.level === 'danger');
            if (hasDanger && !isLpBurned) {
                return { elite: false };
            }

            return {
                elite: true,
                statusText: isLpBurned ? '🔥 LP Burned & Secure' : '✅ Standard Check Passed'
            };
        }
    } catch (e) {
        return { elite: false };
    }
}

async function sendTelegramAlert(message) {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message,
            parse_mode: 'HTML'
        });
    } catch (err) {
        console.error('Telegram Error:', err.message);
    }
}

app.get('/', (req, res) => {
    res.send('Elite Engine is active!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('GetBlock RPC Connected Successfully!');
});

