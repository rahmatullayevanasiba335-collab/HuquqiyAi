
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Huquqiy AI bot ishlayapti");
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
    console.error("Kerakli environment variables yetishmayapti.");
    return res.status(500).send("Environment variables yetishmayapti");
  }

  async function telegram(method, body) {
    const r = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    return r.json();
  }

  async function redis(command, ...args) {
    const r = await fetch(UPSTASH_REDIS_REST_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([command, ...args]),
    });
    const data = await r.json();
    if (!r.ok || data.error) {
      throw new Error(data.error || "Redis xatosi");
    }
    return data.result;
  }

  async function getChannels() {
    return (await redis("GET", "huquqiy_ai:channels")) || [];
  }

  async function saveChannels(channels) {
    await redis("SET", "huquqiy_ai:channels", JSON.stringify(channels));
  }

  async function send(chatId, text, extra = {}) {
    return telegram("sendMessage", {
      chat_id: chatId,
      text,
      ...extra,
    });
  }

  try {
    const update = req.body;
    const message = update.message;
    const callback = update.callback_query;

    if (callback) {
      const userId = String(callback.from.id);
      const chatId = callback.message.chat.id;
      const data = callback.data;

      await telegram("answerCallbackQuery", {
        callback_query_id: callback.id,
      });

      if (data === "check_subscription") {
        const channels = await getChannels();
        let missing = [];

        for (const channel of channels) {
          try {
            const result = await telegram("getChatMember", {
              chat_id: channel.id,
              user_id: Number(userId),
            });

            const status = result.result?.status;
            if (
              !result.ok ||
              !["creator", "administrator", "member", "restricted"].includes(status)
            ) {
              missing.push(channel);
            }
          } catch {
            missing.push(channel);
          }
        }

        if (missing.length) {
          return await send(
            chatId,
            "Hali barcha kanallarga obuna bo‘lmagansiz. Obuna bo‘ling va qayta tekshiring."
          ).then(() => res.status(200).send("OK"));
        }

        await send(chatId, "Obuna tasdiqlandi! Endi huquqiy savolingizni yuboring.");
        return res.status(200).send("OK");
      }

      if (userId !== String(ADMIN_TELEGRAM_ID)) {
        await send(chatId, "Bu amal faqat admin uchun.");
        return res.status(200).send("OK");
      }

      if (data === "admin_add") {
        await redis("SETEX", `huquqiy_ai:admin_state:${userId}`, 600, "add");
        await send(
          chatId,
          "Kanalni shu formatda yuboring:\n@kanalusername | https://t.me/kanalusername\n\nBekor qilish: /cancel"
        );
      } else if (data === "admin_list") {
        const channels = await getChannels();
        await send(
          chatId,
          channels.length
            ? channels.map((c, i) => `${i + 1}. ${c.id} — ${c.url}`).join("\n")
            : "Hozircha kanal qo‘shilmagan."
        );
      } else if (data.startsWith("admin_remove:")) {
        const index = Number(data.split(":")[1]);
        const channels = await getChannels();

        if (Number.isInteger(index) && index >= 0 && index < channels.length) {
          channels.splice(index, 1);
          await saveChannels(channels);
          await send(chatId, "Kanal o‘chirildi.");
        } else {
          await send(chatId, "Kanal topilmadi.");
        }
      }

      return res.status(200).send("OK");
    }

    if (!message || !message.chat || !message.from) {
      return res.status(200).send("OK");
    }

    const chatId = message.chat.id;
    const userId = String(message.from.id);
    const text = (message.text || "").trim();

    if (text === "/cancel") {
      await redis("DEL", `huquqiy_ai:admin_state:${userId}`);
      await send(chatId, "Amal bekor qilindi.");
      return res.status(200).send("OK");
    }

    if (userId === String(ADMIN_TELEGRAM_ID)) {
      const state = await redis("GET", `huquqiy_ai:admin_state:${userId}`);

      if (state === "add" && text && !text.startsWith("/")) {
        const parts = text.split("|").map((p) => p.trim());

        if (parts.length !== 2 || !parts[0] || !parts[1]) {
          await send(chatId, "Format noto‘g‘ri. Misol:\n@kanalusername | https://t.me/kanalusername");
          return res.status(200).send("OK");
        }

        const channels = await getChannels();

        if (channels.some((c) => c.id === parts[0])) {
          await send(chatId, "Bu kanal allaqachon qo‘shilgan.");
        } else {
          channels.push({ id: parts[0], url: parts[1] });
          await saveChannels(channels);
          await send(chatId, "Kanal ro‘yxatga qo‘shildi. Bot kanal administratori bo‘lishi kerak.");
        }

        await redis("DEL", `huquqiy_ai:admin_state:${userId}`);
        return res.status(200).send("OK");
      }
    }

    if (text === "/start") {
      if (userId === String(ADMIN_TELEGRAM_ID)) {
        await send(chatId, "Assalomu alaykum, admin!", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "➕ Kanal qo‘shish", callback_data: "admin_add" }],
              [{ text: "📋 Kanallar ro‘yxati", callback_data: "admin_list" }],
              [{ text: "➖ Kanal o‘chirish", callback_data: "admin_remove:0" }],
            ],
          },
        });
      }

      const channels = await getChannels();

      if (channels.length) {
        const rows = channels.map((c) => [
          { text: "📢 Kanalga obuna bo‘lish", url: c.url },
        ]);
        rows.push([
          { text: "✅ Obunani tekshirish", callback_data: "check_subscription" },
        ]);

        await send(chatId, "Botdan foydalanish uchun quyidagi kanallarga obuna bo‘ling:", {
          reply_markup: { inline_keyboard: rows },
        });
      } else {
        await send(chatId, "Assalomu alaykum! Huquqiy savolingizni yuboring.");
      }

      return res.status(200).send("OK");
    }

    if (text === "/admin") {
      if (userId !== String(ADMIN_TELEGRAM_ID)) {
        await send(chatId, "Sizda admin huquqi yo‘q.");
      } else {
        await send(chatId, "Admin panel:", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "➕ Kanal qo‘shish", callback_data: "admin_add" }],
              [{ text: "📋 Kanallar ro‘yxati", callback_data: "admin_list" }],
              [{ text: "➖ Birinchi kanalni o‘chirish", callback_data: "admin_remove:0" }],
            ],
          },
        });
      }
      return res.status(200).send("OK");
    }

    const channels = await getChannels();

    for (const channel of channels) {
      const member = await telegram("getChatMember", {
        chat_id: channel.id,
        user_id: Number(userId),
      });

      if (
        !member.ok ||
        !["creator", "administrator", "member", "restricted"].includes(member.result?.status)
      ) {
        const rows = channels.map((c) => [
          { text: "📢 Obuna bo‘lish", url: c.url },
        ]);
        rows.push([{ text: "✅ Tekshirish", callback_data: "check_subscription" }]);

        await send(chatId, "Savol berishdan oldin barcha kanallarga obuna bo‘ling.", {
          reply_markup: { inline_keyboard: rows },
        });
        return res.status(200).send("OK");
      }
    }

    if (!text) {
      await send(chatId, "Iltimos, huquqiy savolingizni matn ko‘rinishida yuboring.");
      return res.status(200).send("OK");
    }

    const gemini = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        encodeURIComponent(GEMINI_API_KEY),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    "Siz o‘zbek tilida javob beruvchi huquqiy yordamchi botsiz. " +
                    "O‘zbekiston qonunchiligi bo‘yicha tushunarli javob bering. " +
                    "Noaniq holatlarda qo‘shimcha ma’lumot so‘rang. Bu umumiy axborot, " +
                    "rasmiy advokat maslahati emas.\n\nSavol: " +
                    text,
                },
              ],
            },
          ],
        }),
      }
    );

    const result = await gemini.json();

    if (!gemini.ok) {
      console.error("Gemini xatosi:", gemini.status, result);
      await send(chatId, "AI xizmatida vaqtinchalik xato yuz berdi. Keyinroq urinib ko‘ring.");
      return res.status(200).send("OK");
    }

    const answer =
      result.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("\n") ||
      "Kechirasiz, javob tayyorlab bo‘lmadi.";

    await send(chatId, answer.slice(0, 4000));
    return res.status(200).send("OK");
  } catch (error) {
    console.error("Telegram handler xatosi:", error);
    return res.status(200).send("OK");
  }
}
