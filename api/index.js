const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Supabase va Botni ulash
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN); 

// Yordamchi funksiya: URLni to'g'irlash
const getWebAppUrl = () => {
    // Agar Vercel avtomatik URL bersa, unga https:// qo'shamiz
    if (process.env.VERCEL_URL) {
        return `https://${process.env.VERCEL_URL}`;
    }
    // Agar localda yoki env yo'q bo'lsa, sizning domeningiz
    return "https://abeed.vercel.app"; 
};

// === BOT LOGIKASI (WEBHOOK UCHUN) ===
app.post('/api/bot', async (req, res) => {
    try {
        const { message } = req.body;
        
        // Agar xabar bo'lmasa, jarayonni to'xtatamiz
        if (!message) return res.status(200).send('OK');

        const chatId = message.chat.id;

        // 1. /start komandasi
        if (message.text === '/start') {
            const opts = {
                reply_markup: {
                    keyboard: [[{ text: "📲 Telefon raqamni yuborish", request_contact: true }]],
                    resize_keyboard: true,
                    one_time_keyboard: true
                }
            };
            await bot.sendMessage(chatId, "Assalomu alaykum! Botdan foydalanish uchun telefon raqamingizni yuboring.", opts);
        }

        // 2. Kontakt qabul qilish
        else if (message.contact) {
            const phone = message.contact.phone_number;
            const userId = message.from.id;
            const fullName = message.from.first_name + (message.from.last_name ? " " + message.from.last_name : "");

            // Bazaga yozish (Upsert - agar bor bo'lsa yangilaydi, yo'q bo'lsa qo'shadi)
            const { error } = await supabase
                .from('users')
                .upsert({ id: userId, phone: phone, full_name: fullName }, { onConflict: 'id' })
                .select();

            if (!error) {
                // MUHIM: URLni to'g'irlab olamiz
                const webAppUrl = getWebAppUrl();
                console.log("Web App URL:", webAppUrl); // Loglarda tekshirish uchun

                await bot.sendMessage(chatId, "Rahmat! Tizimga kirdingiz. Quyidagi tugmani bosing:", {
                    reply_markup: {
                        remove_keyboard: true,
                        inline_keyboard: [[{ 
                            text: "🍴 Ovqat Buyurtma Qilish", 
                            web_app: { url: webAppUrl } 
                        }]]
                    }
                });
            } else {
                console.error("Supabase Error:", error);
                await bot.sendMessage(chatId, "Baza bilan xatolik bo'ldi. Iltimos, /start bosib qayta urinib ko'ring.");
            }
        }
    } catch (error) {
        console.error("Bot Error:", error);
    }
    
    // Telegramga har doim 200 OK qaytarish shart
    res.status(200).send('OK');
});

// === WEB APP API LOGIKASI ===

// Userni aniqlash
const getUser = async (telegram_id) => {
    const { data } = await supabase.from('users').select('*').eq('id', telegram_id).single();
    return data;
};

// Login (User info)
app.get('/api/me', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID required' });
    
    const user = await getUser(id);
    if (!user) return res.status(404).json({ error: 'User topilmadi' });
    
    res.json(user);
});

// Menyuni olish
app.get('/api/menu', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('menu').select('*').eq('date', today).eq('is_active', true);
    res.json(data || []);
});

// Buyurtma berish
// Deadline: 10:10
const DEADLINE_HOUR = 10;
const DEADLINE_MINUTE = 10;

app.post('/api/order', async (req, res) => {
    try {
        const { user_id, menu_id } = req.body;
        const now = new Date();
        
        // O'zbekiston vaqti (UTC+5)
        const uzbHours = now.getUTCHours() + 5;
        const uzbMinutes = now.getMinutes();
        
        // Deadline tekshiruvi
        if (uzbHours > DEADLINE_HOUR || (uzbHours === DEADLINE_HOUR && uzbMinutes >= DEADLINE_MINUTE)) {
            return res.status(400).json({ error: 'Buyurtma vaqti tugagan (10:10)!' });
        }

        const user = await getUser(user_id);
        const { data: menuItem } = await supabase.from('menu').select('*').eq('id', menu_id).single();

        if (!user || !menuItem) {
            return res.status(400).json({ error: "Ma'lumot topilmadi" });
        }

        if (user.balance < menuItem.price) {
            return res.status(400).json({ error: 'Balans yetarli emas!' });
        }

        // Tranzaksiya
        await supabase.from('users').update({ balance: user.balance - menuItem.price }).eq('id', user_id);
        await supabase.from('orders').insert({ user_id, menu_id, price_at_moment: menuItem.price });

        res.json({ success: true, new_balance: user.balance - menuItem.price });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Admin: Menyu qo'shish
app.post('/api/add-menu', async (req, res) => {
    const { user_id, title, price } = req.body;
    const user = await getUser(user_id);
    if (!user || !['admin', 'boss'].includes(user.role)) return res.status(403).json({ error: 'Huquq yoq' });

    await supabase.from('menu').insert({ title, price, date: new Date() });
    res.json({ success: true });
});

// Admin: Userlarni ko'rish
app.get('/api/users', async (req, res) => {
    const { user_id } = req.query;
    const user = await getUser(user_id);
    if (!user || !['admin', 'boss'].includes(user.role)) return res.status(403).json({ error: 'Huquq yoq' });

    const { data } = await supabase.from('users').select('*').order('role');
    res.json(data);
});

// Admin: Balans to'ldirish
app.post('/api/update-balance', async (req, res) => {
    const { admin_id, target_id, amount } = req.body;
    const user = await getUser(admin_id);
    if (!user || !['admin', 'boss'].includes(user.role)) return res.status(403).json({ error: 'Huquq yoq' });

    const target = await getUser(target_id);
    const newBalance = parseFloat(target.balance) + parseFloat(amount);
    await supabase.from('users').update({ balance: newBalance }).eq('id', target_id);
    res.json({ success: true });
});

// Boss: Admin tayinlash
app.post('/api/promote', async (req, res) => {
    const { boss_id, target_id } = req.body;
    const boss = await getUser(boss_id);
    if (!boss || boss.role !== 'boss') return res.status(403).json({ error: 'Faqat Boss qila oladi' });

    await supabase.from('users').update({ role: 'admin' }).eq('id', target_id);
    res.json({ success: true });
});

module.exports = app;