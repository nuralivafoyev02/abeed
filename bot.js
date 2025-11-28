const TelegramBot = require('node-telegram-bot-api');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const opts = {
        reply_markup: {
            keyboard: [[{ text: "📲 Telefon raqamni yuborish", request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true
        }
    };
    bot.sendMessage(chatId, "Assalomu alaykum! Botdan foydalanish uchun telefon raqamingizni yuboring.", opts);
});

bot.on('contact', async (msg) => {
    const chatId = msg.chat.id;
    const phone = msg.contact.phone_number;
    const userId = msg.from.id;
    const fullName = msg.from.first_name + (msg.from.last_name ? " " + msg.from.last_name : "");

    // Bazaga yozish
    const { data, error } = await supabase
        .from('users')
        .upsert({ id: userId, phone: phone, full_name: fullName }, { onConflict: 'id' })
        .select();

    if (!error) {
        bot.sendMessage(chatId, "Rahmat! Endi Web App orqali ovqat buyurtma qilishingiz mumkin.", {
            reply_markup: {
                remove_keyboard: true,
                inline_keyboard: [[{ text: "🍴 Ovqat Buyurtma Qilish", web_app: { url: "https://SIZNING_VERCEL_APP_URL.vercel.app" } }]]
            }
        });
    } else {
        bot.sendMessage(chatId, "Xatolik yuz berdi. Qayta urinib ko'ring.");
    }
});