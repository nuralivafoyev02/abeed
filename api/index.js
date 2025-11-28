const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Deadline vaqti (Masalan 10:10)
const DEADLINE_HOUR = 10;
const DEADLINE_MINUTE = 10;

// Xavfsizlik uchun oddiy tekshiruv (Haqiqiy loyihada Telegram initData validate qilinishi kerak)
const getUser = async (telegram_id) => {
    const { data, error } = await supabase.from('users').select('*').eq('id', telegram_id).single();
    return data;
};

// 1. User ma'lumotlarini olish (Login)
app.get('/api/me', async (req, res) => {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'ID required' });
    
    const user = await getUser(id);
    if (!user) return res.status(404).json({ error: 'User not found. Please start bot first.' });
    
    res.json(user);
});

// 2. Menyuni olish
app.get('/api/menu', async (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    const { data } = await supabase.from('menu').select('*').eq('date', today).eq('is_active', true);
    res.json(data || []);
});

// 3. Buyurtma berish (User)
app.post('/api/order', async (req, res) => {
    const { user_id, menu_id } = req.body;
    
    // Deadline tekshirish
    const now = new Date();
    if (now.getHours() > DEADLINE_HOUR || (now.getHours() === DEADLINE_HOUR && now.getMinutes() >= DEADLINE_MINUTE)) {
        return res.status(400).json({ error: 'Buyurtma vaqti tugagan (10:10)!' });
    }

    const user = await getUser(user_id);
    const { data: menuItem } = await supabase.from('menu').select('*').eq('id', menu_id).single();

    if (user.balance < menuItem.price) {
        return res.status(400).json({ error: 'Balans yetarli emas!' });
    }

    // Tranzaksiya: Balansdan ayirish va buyurtma qo'shish
    await supabase.from('users').update({ balance: user.balance - menuItem.price }).eq('id', user_id);
    const { error } = await supabase.from('orders').insert({
        user_id, menu_id, price_at_moment: menuItem.price
    });

    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true, new_balance: user.balance - menuItem.price });
});

// 4. Admin/Boss: Menyu qo'shish
app.post('/api/add-menu', async (req, res) => {
    const { user_id, title, price } = req.body;
    const user = await getUser(user_id);
    
    if (!['admin', 'boss'].includes(user.role)) return res.status(403).json({ error: 'Huquq yoq' });

    const { error } = await supabase.from('menu').insert({ title, price, date: new Date() });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// 5. Boss/Admin: Userlar ro'yxati va Balans to'ldirish
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

    // Hozirgi balansni olib qo'shamiz
    const target = await getUser(target_id);
    const newBalance = parseFloat(target.balance) + parseFloat(amount);

    await supabase.from('users').update({ balance: newBalance }).eq('id', target_id);
    res.json({ success: true });
});

// 6. Faqat Boss: Admin tayinlash
app.post('/api/promote', async (req, res) => {
    const { boss_id, target_id } = req.body;
    const boss = await getUser(boss_id);
    
    if (boss.role !== 'boss') return res.status(403).json({ error: 'Faqat Boss admin tayinlay oladi' });

    await supabase.from('users').update({ role: 'admin' }).eq('id', target_id);
    res.json({ success: true });
});

module.exports = app;