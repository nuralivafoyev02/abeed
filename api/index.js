const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN); // Polling kerak emas

// === BOT LOGIKASI (WEBHOOK UCHUN) ===
app.post('/api/bot', async (req, res) => {
    try {
        const { message } = req.body;
        
        if (message) {
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

                // Bazaga yozish
                const { error } = await supabase
                    .from('users')
                    .upsert({ id: userId, phone: phone, full_name: fullName }, { onConflict: 'id' })
                    .select();

                if (!error) {
                    await bot.sendMessage(chatId, "Rahmat! Endi Web App orqali ovqat buyurtma qilishingiz mumkin.", {
                        reply_markup: {
                            remove_keyboard: true,
                            inline_keyboard: [[{ 
                                text: "🍴 Ovqat Buyurtma Qilish", 
                                // DIQQAT: Bu yerga Vercel domeningizni qo'ying!
                                web_app: { url: process.env.VERCEL_URL || "https://abeed.vercel.app" } 
                            }]]
                        }
                    });
                } else {
                    await bot.sendMessage(chatId, "Baza bilan xatolik bo'ldi. Qayta urinib ko'ring.");
                }
            }
        }
    } catch (error) {
        console.error("Bot Error:", error);
    }
    
    // Telegramga har doim 200 OK qaytarish shart, bo'lmasa qayta yuboraveradi
    res.status(200).send('OK');
});

// === WEB APP API LOGIKASI ===
const getUser = async (telegram_id) => {
    const { data } = await supabase.from('users').select('*').eq('id', telegram_id).single();
    return data;
};

app.get('/api/me', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID required' });
    const user = await getUser(id);
    if (!user) return res.status(404).json({ error: 'User topilmadi' });
    res.json(user);
});

app.get('/api/menu', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('menu').select('*').eq('date', today).eq('is_active', true);
    res.json(data || []);
});

// Deadline: 10:10
const DEADLINE_HOUR = 10;
const DEADLINE_MINUTE = 10;

app.post('/api/order', async (req, res) => {
    const { user_id, menu_id } = req.body;
    const now = new Date();
    
    // O'zbekiston vaqtini olish (UTC+5)
    const uzbHours = now.getUTCHours() + 5;
    
    if (uzbHours > DEADLINE_HOUR || (uzbHours === DEADLINE_HOUR && now.getMinutes() >= DEADLINE_MINUTE)) {
        return res.status(400).json({ error: 'Buyurtma vaqti tugagan (10:10)!' });
    }

    const user = await getUser(user_id);
    const { data: menuItem } = await supabase.from('menu').select('*').eq('id', menu_id).single();

    if (user.balance < menuItem.price) {
        return res.status(400).json({ error: 'Balans yetarli emas!' });
    }

    await supabase.from('users').update({ balance: user.balance - menuItem.price }).eq('id', user_id);
    await supabase.from('orders').insert({ user_id, menu_id, price_at_moment: menuItem.price });

    res.json({ success: true, new_balance: user.balance - menuItem.price });
});

// Admin funksiyalari
app.post('/api/add-menu', async (req, res) => {
    const { user_id, title, price } = req.body;
    const user = await getUser(user_id);
    if (!['admin', 'boss'].includes(user.role)) return res.status(403).json({ error: 'Huquq yoq' });

    await supabase.from('menu').insert({ title, price, date: new Date() });
    res.json({ success: true });
});

app.get('/api/users', async (req, res) => {
    const { user_id } = req.query;
    const user = await getUser(user_id);
    if (!['admin', 'boss'].includes(user.role)) return res.status(403).json({ error: 'Huquq yoq' });

    const { data } = await supabase.from('users').select('*').order('role');
    res.json(data);
});

app.post('/api/update-balance', async (req, res) => {
    const { admin_id, target_id, amount } = req.body;
    const user = await getUser(admin_id);
    if (!['admin', 'boss'].includes(user.role)) return res.status(403).json({ error: 'Huquq yoq' });

    const target = await getUser(target_id);
    const newBalance = parseFloat(target.balance) + parseFloat(amount);
    await supabase.from('users').update({ balance: newBalance }).eq('id', target_id);
    res.json({ success: true });
});

app.post('/api/promote', async (req, res) => {
    const { boss_id, target_id } = req.body;
    const boss = await getUser(boss_id);
    if (boss.role !== 'boss') return res.status(403).json({ error: 'Faqat Boss qila oladi' });

    await supabase.from('users').update({ role: 'admin' }).eq('id', target_id);
    res.json({ success: true });
});

module.exports = app;