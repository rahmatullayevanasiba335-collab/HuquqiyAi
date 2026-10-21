
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      TELEGRAM_BOT_TOKEN,
      GEMINI_API_KEY,
      ADMIN_TELEGRAM_ID,
      UPSTASH_REDIS_REST_URL,
      UPSTASH_REDIS_REST_TOKEN
    } = process.env;

    if (
      !TELEGRAM_BOT_TOKEN ||
      !GEMINI_API_KEY ||
      !ADMIN_TELEGRAM_ID ||
      !UPSTASH_REDIS_REST_URL ||
      !UPSTASH_REDIS_REST_TOKEN
    ) {
      console.error("Kerakli environment variables yetishmayapti.");
      return res.status(500).json({
        error: "Server sozlamalari to'liq emas."
      });
    }

    // Redis orqali doimiy ma'lumot saqlash
    async function redis(...args) {
      const response = await fetch(
        UPSTASH_REDIS_REST_URL,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(args)
        }
      );

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error("Redis bilan bog'lanishda xatolik");
      }

      return data.result;
    }

    async function getChannels() {
      const value = await redis("GET", "huquqiy_ai:channels");
      return value ? JSON.parse(value) : [];
    }

    async function saveChannels(channels) {
      await redis(
        "SET",
        "huquqiy_ai:channels",
        JSON.stringify(channels)
      );
    }

    async function telegram(method, body) {
      const response = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body)
        }
      );

      const data = await response.json();

      if (!response.ok || !data.ok) {
        console.error(`Telegram ${method} xatosi:`, data);
        throw new Error(`Telegram ${method} xatosi`);
      }

      return data.result;
    }

    async function send(chatId, text, reply_markup) {
      return telegram("sendMessage", {
        chat_id: chatId,
        text: String(text).slice(0, 4000),
        ...(reply_markup ? { reply_markup } : {})
      });
    }

    async function isSubscribed(userId, channel) {
      try {
        const member = await telegram("getChatMember", {
          chat_id: channel.chatId,
          user_id: userId
        });

        return (
          member.status === "creator" ||
          member.status === "administrator" ||
          member.status === "member" ||
          (member.status === "restricted" && member.is_member === true)
        );
      } catch (error) {
        // Tekshirish ishlamasa, obunani tasdiqlamaymiz.
        console.error("Obunani tekshirish amalga oshmadi.");
        return false;
      }
    }

    async function checkAllSubscriptions(userId, channels) {
      for (const channel of channels) {
        if (!(await isSubscribed(userId, channel))) {
          return false;
        }
      }

      return true;
    }

    async function showSubscription(chatId, channels) {
      if (channels.length === 0) {
        await send(
          chatId,
          "Hozircha homiy kanallar belgilanmagan. Savolingizni yuborishingiz mumkin."
        );
        return;
      }

      const keyboard = channels.map((channel) => [
        {
          text: `📢 ${channel.title || channel.chatId}`,
          url: channel.url
        }
      ]);

      keyboard.push([
        {
          text: "✅ Obunani tekshirish",
          callback_data: "check_subscription"
        }
      ]);

      await send(
        chatId,
        "Botdan foydalanish uchun quyidagi homiy kanallarga obuna bo'ling. Keyin tekshirish tugmasini bosing.",
        { inline_keyboard: keyboard }
      );
    }

    async function showAdmin(chatId) {
      await send(chatId, "⚙️ Huquqiy AI — admin panel", {
        inline_keyboard: [
          [{ text: "➕ Kanal qo'shish", callback_data: "admin_add" }],
          [{ text: "📋 Kanallar ro'yxati", callback_data: "admin_list" }]
        ]
      });
    }

    async function showChannelList(chatId) {
      const channels = await getChannels();

      if (channels.length === 0) {
        await send(chatId, "Hozircha kanallar yo'q.", {
          inline_keyboard: [
            [{ text: "➕ Kanal qo'shish", callback_data: "admin_add" }]
          ]
        });
        return;
      }

      const keyboard = channels.map((channel, index) => [
        {
          text: `❌ O'chirish: ${channel.title || channel.chatId}`,
          callback_data: `admin_remove:${index}`
        }
      ]);

      keyboard.push([
        { text: "➕ Kanal qo'shish", callback_data: "admin_add" }
      ]);
      keyboard.push([
        { text: "⬅️ Admin menyusi", callback_data: "admin_home" }
      ]);

      await send(chatId, "Saqlangan homiy kanallar:", {
        inline_keyboard: keyboard
      });
    }

    const update = req.body || {};
    const message = update.message;
    const callback = update.callback_query;

    const user = message?.from || callback?.from;
    const chatId = message?.chat?.id || callback?.message?.chat?.id;
    const userId = user?.id;
    const text = message?.text?.trim();

    if (!userId || !chatId) {
      return res.status(200).json({ ok: true });
    }

    const isAdmin = String(userId) === String(ADMIN_TELEGRAM_ID);

    // Tugma bosilganda
    if (callback) {
      const action = callback.data || "";

      await telegram("answerCallbackQuery", {
        callback_query_id: callback.id
      });

      if (action === "check_subscription") {
        const channels = await getChannels();
        const subscribed = await checkAllSubscriptions(userId, channels);

        if (subscribed) {
          await send(
            chatId,
            "✅ Obuna tasdiqlandi! Endi huquqiy savolingizni yuborishingiz mumkin."
          );
        } else {
          await showSubscription(chatId, channels);
        }

        return res.status(200).json({ ok: true });
      }

      // Admin tugmalarini faqat admin ishlata oladi
      if (action.startsWith("admin_")) {
        if (!isAdmin) {
          await send(chatId, "⛔ Sizda admin huquqi yo'q.");
          return res.status(200).json({ ok: true });
        }

        if (action === "admin_home") {
          await showAdmin(chatId);
        } else if (action === "admin_add") {
          await redis(
            "SET",
            `huquqiy_ai:admin_state:${userId}`,
            "adding_channel",
            "EX",
            "600"
          );

          await send(
            chatId,
            "Kanal ma'lumotini shu shaklda yuboring:\n\n@kanalusername | https://t.me/kanalusername\n\nBu misolni o'z kanalingiz ma'lumotlari bilan almashtiring. Amalni bekor qilish uchun /cancel yozing."
          );
        } else if (action === "admin_list") {
          await showChannelList(chatId);
        } else if (action.startsWith("admin_remove:")) {
          const index = Number(action.split(":")[1]);

          if (!Number.isInteger(index) || index < 0) {
            await send(chatId, "Noto'g'ri kanal raqami.");
          } else {
            const channels = await getChannels();

            if (index >= channels.length) {
              await send(chatId, "Kanal topilmadi. Ro'yxatni qayta oching.");
            } else {
              const removed = channels.splice(index, 1)[0];
              await saveChannels(channels);
              await send(
                chatId,
                `✅ Kanal o'chirildi: ${removed.title || removed.chatId}`
              );
              await showChannelList(chatId);
            }
          }
        }
      }

      return res.status(200).json({ ok: true });
    }

    if (!text) {
      return res.status(200).json({ ok: true });
    }

    if (text === "/cancel" && isAdmin) {
      await redis("DEL", `huquqiy_ai:admin_state:${userId}`);
      await send(chatId, "Amal bekor qilindi.");
      return res.status(200).json({ ok: true });
    }

    if (text === "/start") {
      if (isAdmin) {
        await send(
          chatId,
          "Assalomu alaykum, admin! Kanallarni boshqarish uchun /admin buyrug'ini yuboring."
        );
      }

      const channels = await getChannels();
      const subscribed = await checkAllSubscriptions(userId, channels);

      if (subscribed) {
        await send(
          chatId,
          "Assalomu alaykum! Men Huquqiy AI botiman. O'zbekiston qonunchiligi bo'yicha savolingizni yuboring."
        );
      } else {
        await showSubscription(chatId, channels);
      }

      return res.status(200).json({ ok: true });
    }

    if (text === "/admin") {
      if (!isAdmin) {
        await send(chatId, "⛔ Sizda admin huquqi yo'q.");
      } else {
        await showAdmin(chatId);
      }

      return res.status(200).json({ ok: true });
    }

    // Admin kanal qo'shish bosqichida bo'lsa
    if (isAdmin) {
      const state = await redis(
        "GET",
        `huquqiy_ai:admin_state:${userId}`
      );

      if (state === "adding_channel") {
        const parts = text.split("|").map((part) => part.trim());
        const chat = parts[0];
        const url = parts[1];

        const validChat =
          /^@[A-Za-z0-9_]{5,}$/.test(chat) ||
          /^-100\d+$/.test(chat || "");

        let validUrl = false;

        try {
          const parsed = new URL(url);
          validUrl =
            (parsed.hostname === "t.me" ||
              parsed.hostname === "www.t.me") &&
            parsed.protocol === "https:";
        } catch {
          validUrl = false;
        }

        if (!validChat || !validUrl) {
          await send(
            chatId,
            "❗ Ma'lumot noto'g'ri.\n\nMasalan:\n@kanalusername | https://t.me/kanalusername\n\nKanal username'i yoki -100 bilan boshlanuvchi chat ID va t.me havolasini yuboring."
          );
          return res.status(200).json({ ok: true });
        }

        const channels = await getChannels();

        if (channels.some((channel) => channel.chatId === chat)) {
          await redis("DEL", `huquqiy_ai:admin_state:${userId}`);
          await send(chatId, "Bu kanal ro'yxatda allaqachon mavjud.");
          return res.status(200).json({ ok: true });
        }

        channels.push({
          chatId: chat,
          url,
          title: chat
        });

        await saveChannels(channels);
        await redis("DEL", `huquqiy_ai:admin_state:${userId}`);

        await send(
          chatId,
          "✅ Kanal ro'yxatga qo'shildi.\n\nMuhim: botni ushbu kanalga administrator qilib qo'ying, aks holda obunani tekshira olmasligi mumkin."
        );

        await showAdmin(chatId);
        return res.status(200).json({ ok: true });
      }
    }

    // Majburiy obuna tekshiruvi — Gemini chaqirilishidan oldin
    const channels = await getChannels();
    const subscribed = await checkAllSubscriptions(userId, channels);

    if (!subscribed) {
      await showSubscription(chatId, channels);
      return res.status(200).json({ ok: true });
    }

    // AI javobini olish
    const aiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: `Siz Huquqiy AI Telegram botisiz.
O'zbekiston qonunchiligi bo'yicha o'zbek tilida sodda va tushunarli javob bering.

Javob shakli:
QONUNIY ASOS:
TAHLIL:
XULOSA:

Modda raqamini aniq bilmasangiz, uydirmang. Qonun amaldaligiga ishonchingiz komil bo'lmasa, LexUZ orqali tekshirishni tavsiya qiling. Bu umumiy huquqiy ma'lumot ekanini eslatib o'ting.`
            }]
          },
          contents: [{
            role: "user",
            parts: [{ text }]
          }]
        })
      }
    );

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error("Gemini xatosi:", data);

      await send(
        chatId,
        "AI xizmatida vaqtinchalik xatolik yuz berdi. Keyinroq qayta urinib ko'ring."
      );

      return res.status(200).json({ ok: true });
    }

    const answer =
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("") ||
      "AI javob qaytarmadi. Iltimos, qayta urinib ko'ring.";

    await send(
      chatId,
      answer.slice(0, 3700) +
        "\n\n⚠️ Bu umumiy huquqiy ma'lumot bo'lib, professional yuridik maslahat o'rnini bosmaydi."
    );

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error("Webhook xatosi:", error);

    // Telegram webhook'iga qayta-qayta xato qaytarmaslik
    return res.status(200).json({ ok: true });
  }
}
