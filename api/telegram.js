
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Huquqiy AI bot ishlayapti.");
  }

  const {
    TELEGRAM_BOT_TOKEN,
    GEMINI_API_KEY,
    ADMIN_TELEGRAM_ID,
    UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN,
  } = process.env;

  if (
    !TELEGRAM_BOT_TOKEN ||
    !GEMINI_API_KEY ||
    !ADMIN_TELEGRAM_ID ||
    !UPSTASH_REDIS_REST_URL ||
    !UPSTASH_REDIS_REST_TOKEN
  ) {
    console.error("Kerakli environment variable yetishmayapti.");
    return res.status(500).send("Configuration error");
  }

  const telegramApi =
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

  const redisUrl = UPSTASH_REDIS_REST_URL.replace(/\/+$/, "");
  const redisKey = "huquqiy_ai:channels";

  async function telegram(method, body = {}) {
    const response = await fetch(`${telegramApi}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!data.ok) {
      throw new Error(`Telegram ${method}: ${data.description || "API error"}`);
    }

    return data.result;
  }

  async function redis(command, ...args) {
    const response = await fetch(redisUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([command, ...args]),
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      throw new Error(`Redis xatosi: ${data.error || response.status}`);
    }

    return data.result;
  }

  async function getChannels() {
    const value = await redis("GET", redisKey);

    if (!value) return [];

    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function saveChannels(channels) {
    await redis("SET", redisKey, JSON.stringify(channels));
  }

  async function sendMessage(chatId, text, extra = {}) {
    return telegram("sendMessage", {
      chat_id: chatId,
      text,
      ...extra,
    });
  }

  async function isSubscribed(userId, channels) {
    for (const channel of channels) {
      try {
        const member = await telegram("getChatMember", {
          chat_id: channel.id,
          user_id: userId,
        });

        if (
          !["creator", "administrator", "member"].includes(member.status) &&
          !(member.status === "restricted" && member.is_member)
        ) {
          return false;
        }
      } catch (error) {
        console.error("Obunani tekshirish xatosi:", error.message);
        return false;
      }
    }

    return true;
  }

  async function askGemini(question) {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(GEMINI_API_KEY),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              {
                text:
                  "Siz O‘zbekiston qonunchiligi bo‘yicha yordam beruvchi Huquqiy AI assistantsiz. " +
                  "O‘zbek tilida aniq, sodda va ehtiyotkor javob bering. " +
                  "Qonun moddasi yoki raqamini ishonchingiz komil bo‘lmasa, uydirmang. " +
                  "Huquqiy ma’lumot umumiy ekanini, murakkab holatda advokatga murojaat qilish kerakligini ayting. " +
                  "Qonunlar o‘zgarishi mumkinligini hisobga oling.",
              },
            ],
          },
          contents: [
            {
              role: "user",
              parts: [{ text: question }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1200,
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini xatosi:", response.status, data);
      throw new Error("AI javob bera olmadi.");
    }

    return (
      data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim() || "Kechirasiz, hozir javob tayyorlay olmadim."
    );
  }

  const update = req.body;

  try {
    // Telegram webhook tekshiruvi
    if (update?.callback_query) {
      const callback = update.callback_query;
      const userId = String(callback.from.id);
      const chatId = callback.message.chat.id;
      const data = callback.data || "";

      await telegram("answerCallbackQuery", {
        callback_query_id: callback.id,
      });

      if (userId === String(ADMIN_TELEGRAM_ID)) {
        if (data === "admin_add") {
          await sendMessage(
            chatId,
            "Kanalni quyidagi formatda yuboring:\n@kanalusername | https://t.me/kanalusername\n\nBot kanalda admin bo‘lishi kerak."
          );
        } else if (data === "admin_list") {
          const channels = await getChannels();

          await sendMessage(
            chatId,
            channels.length
              ? "Ulangan kanallar:\n" +
                  channels
                    .map((channel, index) => `${index + 1}. ${channel.id} — ${channel.url}`)
                    .join("\n")
              : "Hozircha homiy kanallar qo‘shilmagan."
          );
        } else if (data === "admin_remove") {
          const channels = await getChannels();

          if (!channels.length) {
            await sendMessage(chatId, "O‘chirish uchun kanal yo‘q.");
          } else {
            const keyboard = channels.map((channel, index) => [
              {
                text: `${index + 1}. ${channel.id}`,
                callback_data: `remove_channel:${index}`,
              },
            ]);

            await sendMessage(chatId, "O‘chiriladigan kanalni tanlang:", {
              reply_markup: { inline_keyboard: keyboard },
            });
          }
        } else if (data.startsWith("remove_channel:")) {
          const index = Number(data.split(":")[1]);
          const channels = await getChannels();

          if (Number.isInteger(index) && index >= 0 && index < channels.length) {
            const removed = channels.splice(index, 1)[0];
            await saveChannels(channels);
            await sendMessage(chatId, `Kanal o‘chirildi: ${removed.id}`);
          } else {
            await sendMessage(chatId, "Kanal topilmadi. Ro‘yxatni qayta oching.");
          }
        }
      }

      if (data === "check_subscription") {
        const channels = await getChannels();

        if (!channels.length || await isSubscribed(userId, channels)) {
          await sendMessage(
            chatId,
            "Obuna tekshirildi! Endi huquqiy savolingizni yozishingiz mumkin."
          );
        } else {
          await sendMessage(
            chatId,
            "Iltimos, barcha homiy kanallarga obuna bo‘ling va qayta tekshiring."
          );
        }
      }

      return res.status(200).send("OK");
    }

    const message = update?.message;
    if (!message?.chat || !message?.from) {
      return res.status(200).send("OK");
    }

    const chatId = message.chat.id;
    const userId = String(message.from.id);
    const text = (message.text || "").trim();

    if (!text) {
      await sendMessage(chatId, "Iltimos, savolingizni matn ko‘rinishida yuboring.");
      return res.status(200).send("OK");
    }

    if (text === "/start" || text === "/admin") {
      if (text === "/admin" && userId !== String(ADMIN_TELEGRAM_ID)) {
        await sendMessage(chatId, "Bu buyruq faqat administrator uchun.");
        return res.status(200).send("OK");
      }

      if (userId === String(ADMIN_TELEGRAM_ID)) {
        await sendMessage(chatId, "Admin panel", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "➕ Kanal qo‘shish", callback_data: "admin_add" }],
              [{ text: "📋 Kanallar ro‘yxati", callback_data: "admin_list" }],
              [{ text: "➖ Kanalni o‘chirish", callback_data: "admin_remove" }],
            ],
          },
        });
      }

      const channels = await getChannels();

      if (channels.length) {
        const keyboard = channels.map((channel) => [
          { text: `📢 ${channel.id}`, url: channel.url },
        ]);

        keyboard.push([
          { text: "✅ Obunani tekshirish", callback_data: "check_subscription" },
        ]);

        await sendMessage(
          chatId,
          "Assalomu alaykum! Botdan foydalanish uchun homiy kanallarga obuna bo‘ling.",
          { reply_markup: { inline_keyboard: keyboard } }
        );
      } else {
        await sendMessage(
          chatId,
          "Assalomu alaykum! Men Huquqiy AI botman. O‘zbekiston qonunchiligi bo‘yicha savolingizni yozing."
        );
      }

      return res.status(200).send("OK");
    }

    if (userId === String(ADMIN_TELEGRAM_ID) && text.startsWith("@")) {
      const parts = text.split("|").map((part) => part.trim());
      const channelId = parts[0];
      const url = parts[1];

      if (
        parts.length !== 2 ||
        !/^@[A-Za-z0-9_]{5,}$/.test(channelId) ||
        !/^https:\/\/t\.me\/[A-Za-z0-9_]+\/?$/.test(url)
      ) {
        await sendMessage(
          chatId,
          "Format noto‘g‘ri.\nMisol:\n@kanalusername | https://t.me/kanalusername"
        );
        return res.status(200).send("OK");
      }

      try {
        await telegram("getChat", { chat_id: channelId });
      } catch {
        await sendMessage(
          chatId,
          "Kanal topilmadi yoki bot unga kira olmayapti. Botni kanalga admin qilib qo‘shing."
        );
        return res.status(200).send("OK");
      }

      const channels = await getChannels();

      if (channels.some((channel) => channel.id === channelId)) {
        await sendMessage(chatId, "Bu kanal avval qo‘shilgan.");
      } else {
        channels.push({ id: channelId, url });
        await saveChannels(channels);
        await sendMessage(chatId, `Kanal muvaffaqiyatli qo‘shildi: ${channelId}`);
      }

      return res.status(200).send("OK");
    }

    const channels = await getChannels();

    if (channels.length && !(await isSubscribed(userId, channels))) {
      const keyboard = channels.map((channel) => [
        { text: `📢 ${channel.id}`, url: channel.url },
      ]);

      keyboard.push([
        { text: "✅ Obunani tekshirish", callback_data: "check_subscription" },
      ]);

      await sendMessage(
        chatId,
        "Savol yuborishdan oldin barcha homiy kanallarga obuna bo‘ling.",
        { reply_markup: { inline_keyboard: keyboard } }
      );

      return res.status(200).send("OK");
    }

    const answer = await askGemini(text);
    await sendMessage(chatId, answer);

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Telegram handler xatosi:", error);
    return res.status(200).send("OK");
  }
}
