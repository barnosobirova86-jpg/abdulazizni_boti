require('dotenv').config(); // Environment o'zgaruvchilarni yuklash
const { Telegraf, session, Scenes, Markup } = require('telegraf');

// Bot ob'ektini yaratish
const bot = new Telegraf(process.env.BOT_TOKEN);
const adminChatId = process.env.ADMIN_CHAT_ID;

// Bot statistikasi uchun xotirada saqlanuvchi ob'ekt
const stats = {
    users: new Set(),
    orders: 0
};

// Barcha kirib keluvchi xabarlarni terminalda ko'rsatish (diagnostika uchun)
bot.use(async (ctx, next) => {
    console.log(`📨 Yangi xabar keldi: ${ctx.message?.text || ctx.updateType}`);
    return next();
});

// Buyurtma berish bosqichlari uchun Wizard Scene
const orderWizard = new Scenes.WizardScene(
    'order-wizard',
    (ctx) => {
        // 1-qadam: Telegram Link so'rash
        ctx.reply("Telegram @ user name ingizni yuboring.");
        ctx.wizard.state.orderData = {}; // Ma'lumotlarni saqlash uchun
        return ctx.wizard.next();
    },
    (ctx) => {
        // 2-qadam: xizmatni so'rash
        if (!ctx.message || !ctx.message.text) return ctx.reply("❌ Xato!!! Iltimos, matn kiriting.");
        const text = ctx.message.text.trim();

        // Link yoki username ekanligini tekshirish (qattiq tekshiruv)
        if (!text.startsWith('@') && !text.includes('t.me/') && !text.includes('http')) {
            return ctx.reply("❌ Xato!!! Iltimos, to'g'ri @username yoki Telegram link yuboring.");
        }

        ctx.wizard.state.orderData.link = text;

        // Maxsus klaviatura xizmatlarni tanlash uchun
        const servicesKeyboard = Markup.keyboard([
            ['1 - Account sotish', '2 - Account sotib olish'],
            ['3 - Sotuvdagi mavjud Accountlar', '4 - Garantli hizmati']
        ]).oneTime().resize();

        ctx.reply("Qaysi xizmat kerak?", servicesKeyboard);
        return ctx.wizard.next();
    },
    (ctx) => {
        // 3-qadam: Narxni so'rash
        if (!ctx.message || !ctx.message.text) return ctx.reply("❌ Xato!!! Iltimos, pastdagi tugmalardan birini tanlang.");
        const text = ctx.message.text.trim();

        const validServices = [
            '1 - Account sotish', '2 - Account sotib olish',
            '3 - Sotuvdagi mavjud Accountlar', '4 - Garantli hizmati'
        ];

        // Agar tanlangan xizmat tugmalarda yo'q bo'lsa xato beradi
        if (!validServices.includes(text)) {
            return ctx.reply("❌ Xato!!! Iltimos, faqat pastdagi tugmalardan birini tanlang.");
        }

        ctx.wizard.state.orderData.service = text;

        // Maxsus klaviatura narxlarni tanlash uchun
        const pricesKeyboard = Markup.keyboard([
            ['50-100$', '150-200$'],
            ['250-300$', '350-400$'],
            ['500-1000$']
        ]).oneTime().resize();

        ctx.reply("Qanday narxdaligi kerak?", pricesKeyboard);
        return ctx.wizard.next();
    },
    (ctx) => {
        // 4-qadam: "Buyurtma berish" tasdiqlash tugmasi
        if (!ctx.message || !ctx.message.text) return ctx.reply("❌ Xato!!! Iltimos, narxni tanlang.");
        const text = ctx.message.text.trim();

        const validPrices = ['50-100$', '150-200$', '250-300$', '350-400$', '500-1000$'];

        // Agar narx ro'yxatda bo'lmasa xato beradi
        if (!validPrices.includes(text)) {
            return ctx.reply("❌ Xato!!! Iltimos, faqat pastdagi narxlardan birini tanlang.");
        }

        ctx.wizard.state.orderData.price = text;

        const confirmKeyboard = Markup.keyboard([
            ['✅ Buyurtma berish']
        ]).oneTime().resize();

        ctx.reply("Barcha ma'lumotlar kiritildi. Tasdiqlash uchun pastdagi tugmani bosing.", confirmKeyboard);
        return ctx.wizard.next();
    },
    async (ctx) => {
        // 5-qadam: buyurtmani qabul qilish va adminga yuborish
        if (!ctx.message || !ctx.message.text) return ctx.reply("❌ Xato!!! Iltimos, '✅ Buyurtma berish' tugmasini bosing.");
        const text = ctx.message.text.trim();

        // Qat'iy tekshiruv: Faqat "✅ Buyurtma berish" bosilishi kerak
        if (text !== '✅ Buyurtma berish') {
            return ctx.reply("❌ Xato!!! Iltimos, '✅ Buyurtma berish' tugmasini bosing.");
        }

        const { link, service, price } = ctx.wizard.state.orderData;
        const userId = ctx.from.id;

        const userName = ctx.from.first_name ? ctx.from.first_name : (ctx.from.username || "Mijoz");
        const safeName = userName.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const userMention = `<a href="tg://user?id=${userId}">${safeName}</a>`;

        // Foydalanuvchiga tasdiq xabarini yuborish va asosiy menyuni qaytarish
        await ctx.reply("✅ Buyurtmangiz qabul qilindi! Tez orada aloqaga chiqamiz.", getMainMenu());

        // Statistikadagi buyurtmalar sonini oshirish
        stats.orders += 1;

        // Adminga xabar yuborish
        const safeLink = link.replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const adminMsg = `📦 <b>Yangi Buyurtma!</b>\n\n👤 Mijoz: ${userMention}\n🔗 Telegram Username: ${safeLink}\n🛠 Xizmat: ${service}\n💰 Narxi: ${price}`;

        try {
            await bot.telegram.sendMessage(adminChatId, adminMsg, { parse_mode: 'HTML' });
        } catch (error) {
            console.error("Adminga xabar yuborishda xatolik:", error.message);
        }

        // Ssenariyni tugatish
        return ctx.scene.leave();
    }
);

// Stage yaratamiz va wizard'ni ro'yxatdan o'tkazamiz
const stage = new Scenes.Stage([orderWizard]);

// Ssenariylar ishlashi uchun session va stage middleware'larni ulaymiz
bot.use(session());
bot.use(stage.middleware());

// Asosiy Menyu yaratish funksiyasi
function getMainMenu() {
    return Markup.keyboard([
        ['📋 Xizmatlarimiz', '🛒 Buyurtma berish'],
        ['📞 Admin Bilan Bog\'lanish', '💳 TO\'LO\'V']
    ]).resize();
}

// SALOMLASHISH: /start komandasi
bot.start((ctx) => {
    stats.users.add(ctx.from.id);
    ctx.reply("Assalomu alaykum! Viral YT Accountiga hush kelibsiz.\n\nKerakli menyuni tanlang:", getMainMenu());
});

// MENYU: "Xizmatlarimiz" tugmasi bosilganda
bot.hears('📋 Xizmatlarimiz', (ctx) => {
    stats.users.add(ctx.from.id);
    const services = `
<b>Bizning xizmatlarimiz:</b>
1 - Account sotish.
2 - Account sotib olish.
3 - Sotuvdagi mavjud Accountlar.
4 - Garantli hizmati.
    `;
    ctx.reply(services, { parse_mode: 'HTML' });
});


// MENYU: "Buyurtma berish" tugmasi bosilganda
bot.hears(/Buyurtma berish/i, (ctx) => {
    stats.users.add(ctx.from.id);
    if (!ctx.scene.current) {
        ctx.scene.enter('order-wizard');
    }
});

// MENYU: "Admin Bilan Bog'lanish" tugmasi bosilganda
bot.hears('📞 Admin Bilan Bog\'lanish', (ctx) => {
    stats.users.add(ctx.from.id);
    const contact = `
<b>Kontaktlarimiz:</b>
- Telegram: @Viral_YT_UZ
- Telefon: +998 77 749 37 77
- Ish vaqti: 24/7 
    `;
    ctx.reply(contact, { parse_mode: 'HTML' });
});

// MENYU: "TO'LO'V" tugmasi bosilganda
bot.hears('💳 TO\'LO\'V', (ctx) => {
    stats.users.add(ctx.from.id);
    const faq = `
- "Qancha vaqtda tayyor bo'ladi?" — "30 minutda admin sizga tashlab beradi!"
- "To'lov cartdan"

💳 Humo 

🏦 TBC bank
🧾 Karta Raqam:
<code>9860350143023652</code>

🤑 Abduhakimov A
    `;
    ctx.reply(faq, { parse_mode: 'HTML' });
});

// ADMIN UCHUN: /admin komandasi
bot.command('admin', (ctx) => {
    if (ctx.from.id.toString() === adminChatId) {
        const msg = `📊 <b>Bot Statistikasi</b>\n\n👥 Botdan foydalanganlar soni: ${stats.users.size} ta\n📦 Jami buyurtmalar: ${stats.orders} ta`;
        ctx.reply(msg, { parse_mode: 'HTML' });
    } else {
        ctx.reply("Kechirasiz, bu buyruq faqat adminlar uchun.");
    }
});

bot.on('text', (ctx) => {
    stats.users.add(ctx.from.id);
});

// Bot uchun global xatolik ushlagich (Internet uzilsa bot o'chib qolmasligi uchun)
bot.catch((err, ctx) => {
    console.error(`Xatolik yuz berdi (${ctx.updateType}):`, err.message || err);
});

bot.launch().then(() => {
    console.log("Viral YT Bot muvaffaqiyatli ishga tushdi!");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
