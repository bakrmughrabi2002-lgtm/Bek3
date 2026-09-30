const express = require('express');
const app = express();

app.use(express.json());

// مسار استقبال الـ Webhook من Helius
app.post('/webhook', (req, res) => {
    console.log("Received Webhook data:", req.body);
    res.status(200).send('OK');
});

// مسار فحص صحة السيرفر
app.get('/', (req, res) => {
    res.send('Bot is running live on Render!');
});

// ربط المنفذ بمتغير البيئة الخاص بـ Render
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
