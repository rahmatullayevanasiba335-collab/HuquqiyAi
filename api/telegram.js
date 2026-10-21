
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const CHANNELS_KEY = "huquqiy_ai:channels";
const STATE_PREFIX = "huquqiy_ai:admin_state:";

async function redis(command, ...args) {
  if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
    throw new Error("Upstash Redis URL yoki token sozlanmagan.");
  }

  const redisUrl = UPSTASH_REDIS_REST_URL.trim().replace(/\/+$/, "");
  const response = await fetch(redisUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${UPSTASH_REDIS_REST_TOKEN.trim()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([command, ...args]),
  });

  const data = await response.json();

  if (!response.ok || data.error) {
    throw new Error(data.error || `Redis xatosi: ${response.status}`);
  }

  return data.result;
}

async function getChannels() {
  const result = await redis("GET", CHANNELS_KEY);

  if (!result) return [];

  try {
    const parsed = JSON.parse(result);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveChannels(channels) {
  await redis("SET", CHANNELS_KEY, JSON.stringify(channels));
}

async function getAdminState(userId) {
  const result = await redis("GET", STATE_PREFIX + userId);
  return result || "";
}

async function setAdminState(userId, state) {
  const key = STATE_PREFIX + userId;

  if (!state) {
    await redis("DEL", key);
  } else {
    await redis("SET", key, state, "EX", 600);
  }
}

async function telegram(method, body = {}) {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error("TELEGRAM_BOT_TOKEN sozlanmagan.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.description || `Telegram xatosi: ${method}`);
  }

  return data.result;
}

async function sendMessage(chatId, text, extra = {}) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text,
    ...extra,
  });
}

async function answerCallback(callbackId, text = "") {
  try {
    await telegram("answerCallbackQuery", {
      callback_query_id: callbackId,
      text,
    });
  } catch (error) {
    console.error("Callback javobi xatosi:", error.message);
  }
}

function isAdmin(userId) {
  return (
    ADMIN_TELEGRAM_ID &&
    String(userId) === String(ADMIN_TELEGRAM_ID)
  );
}

function adminKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "➕ Kanal qo‘shish", callback_data: "add_channel" }],
      [{ text: "📋 Kanallar ro‘yxati", callback_data: "list_channels" }],
      [{ text: "➖ Kanalni o‘chirish", callback_data: "remove_channel" }],
    ],
  };
}

async function showAdminMenu(chatId) {
  await sendMessage(chatId, "⚙️ Admin paneli", {
    reply_markup: adminKeyboard(),
  });
}

function normalizeChannel(input) {
  let channel = input.trim();

  channel = channel.replace(/^https?:\/\/t\.me\//i, "");
  channel = channel.replace(/^@/, "");
  channel = channel.replace(/\/+$/, "");

  if (
    !/^[a-zA-Z0-9_]{5,32}$/.test(channel) ||
    channel.includes("?")
  ) {
    return null;
  }

  return {
    username: "@" + channel,
    url: "https://t.me/" + channel,
  };
}

async function checkSubscription(userId, channels) {
  for (const channel of channels) {
    try {
      const member = await telegram("getChatMember", {
        chat_id: channel.username,
        user_id: userId,
      });

      const status = member.status;
      const subscribed =
        status === "creator" ||
        status === "administrator" ||
        status === "member" ||
        (status === "restricted" && member.is_member === true);

      if (!subscribed) return false;
    } catch (error) {
      console.error(
        "Obunani tekshirish xatosi:",
        channel.username,
        error.message
      );

      // Kanalni tekshirib bo‘lmasa, obunani tasdiqlamaymiz.
      return false;
    }
  }

  return true;
}

function subscriptionKeyboard(channels) {
  const rows = channels.map((channel) => [
    {
      text: `📢 ${channel.username} kanaliga obuna bo‘lish`,
      url: channel.url,
    },
  ]);

  rows.push([
    {
      text: "✅ Obunani tekshirish",
      callback_data: "check_subscription",
    },
  ]);

  return { inline_keyboard: rows };
}

async function askForSubscription(chatId, channels) {
  await sendMessage(
    chatId,
    "Botdan foydalanish uchun quyidagi homiy kanallarga obuna bo‘ling. So‘ng «Obunani tekshirish» tugmasini bosing.",
    { reply_markup: subscriptionKeyboard(channels) }
  );
}

async function getLegalAnswer(question) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY sozlanmagan.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text:
                "Siz O‘zbekiston qonunchiligi bo‘yicha huquqiy yordamchi botsiz. " +
                "Foydalanuvchiga o‘zbek tilida aniq, tushunarli va tartibli javob bering. " +
                "Qonun yoki modda raqamini ishonchingiz komil bo‘lmasa, uydirmang. " +
                "Qonunchilik o‘zgarishi mumkinligini hisobga oling. " +
                "Javob umumiy ma’lumot ekanini va murakkab vaziyatda malakali yuristga murojaat qilish kerakligini eslatishingiz mumkin. " +
                "O‘zingizni advokat deb ko‘rsatmang.",
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
          maxOutputTokens: 1500,
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Gemini xatosi:", JSON.stringify(data));
    throw new Error("Gemini xizmatidan javob olish imkoni bo‘lmadi.");
  }

  const answer = data.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error("AI bo‘sh javob qaytardi.");
  }

  return answer;
}

async function handleAdminCallback(callback) {
  const chatId = callback.message.chat.id;
  const userId = callback.from.id;
  const action = callback.data;

  if (!isAdmin(userId)) {
    await answerCallback(callback.id, "Bu funksiya faqat admin uchun.");
    return;
  }

  await answerCallback(callback.id);

  if (action === "add_channel") {
    await setAdminState(userId, "add_channel");
    await sendMessage(
      chatId,
      "Qo‘shmoqchi bo‘lgan ochiq Telegram kanalingiz username'ini yuboring.\n\nMasalan: @mening_kanalim\n\nBekor qilish uchun /cancel yozing."
    );
    return;
  }

  if (action === "list_channels") {
    const channels = await getChannels();

    if (!channels.length) {
      await sendMessage(chatId, "Hozircha kanallar qo‘shilmagan.");
      return;
    }

    const text = channels
      .map((channel, index) => `${index + 1}. ${channel.username}`)
      .join("\n");

    await sendMessage(chatId, "📋 Homiy kanallar:\n\n" + text, {
      reply_markup: adminKeyboard(),
    });
    return;
  }

  if (action === "remove_channel") {
    const channels = await getChannels();

    if (!channels.length) {
      await sendMessage(chatId, "O‘chirish uchun kanal mavjud emas.");
      return;
    }

    await sendMessage(chatId, "O‘chirmoqchi bo‘lgan kanalni tanlang:", {
      reply_markup: {
        inline_keyboard: channels.map((channel) => [
          {
            text: `❌ ${channel.username}`,
            callback_data: "delete_channel:" + channel.username,
          },
        ]),
      },
    });
    return;
  }

  if (action.startsWith("delete_channel:")) {
    const username = action.slice("delete_channel:".length);
    const channels = await getChannels();
    const updated = channels.filter(
      (channel) => channel.username !== username
    );

    await saveChannels(updated);
    await sendMessage(chatId, `✅ ${username} ro‘yxatdan o‘chirildi.`, {
      reply_markup: adminKeyboard(),
    });
  }
}

async function handleCallback(callback) {
  const userId = callback.from.id;
  const chatId = callback.message?.chat?.id;

  if (!chatId) {
    await answerCallback(callback.id);
    return;
  }

  if (
    callback.data === "add_channel" ||
    callback.data === "list_channels" ||
    callback.data === "remove_channel" ||
    callback.data.startsWith("delete_channel:")
  ) {
    await handleAdminCallback(callback);
    return;
  }

  if (callback.data === "check_subscription") {
    await answerCallback(callback.id, "Obuna tekshirilmoqda...");

    const channels = await getChannels();

    if (channels.length) {
      const subscribed = await checkSubscription(userId, channels);

      if (!subscribed) {
        await askForSubscription(chatId, channels);
        return;
      }
    }

    await sendMessage(
      chatId,
      "✅ Obuna tasdiqlandi! Endi huquqiy savolingizni yozishingiz mumkin."
    );
  }
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = (message.text || "").trim();

  if (!text) return;

  if (text === "/cancel") {
    if (isAdmin(userId)) {
      await setAdminState(userId, "");
      await sendMessage(chatId, "Amal bekor qilindi.");
    }
    return;
  }

  if (text === "/start") {
    if (isAdmin(userId)) {
      await sendMessage(
        chatId,
        "Assalomu alaykum, admin! Huquqiy AI bot boshqaruv paneliga xush kelibsiz.",
        { reply_markup: adminKeyboard() }
      );
    } else {
      await sendMessage(
        chatId,
        "Assalomu alaykum! Men Huquqiy AI botman. O‘zbekiston qonunchiligi bo‘yicha savollaringizga yordam beraman."
      );
    }

    const channels = await getChannels();

    if (channels.length && !(await checkSubscription(userId, channels))) {
      await askForSubscription(chatId, channels);
    } else if (!isAdmin(userId)) {
      await sendMessage(
        chatId,
        "Savolingizni shu chatga yozishingiz mumkin."
      );
    }

    return;
  }

  if (text === "/admin") {
    if (!isAdmin(userId)) {
      await sendMessage(chatId, "⛔ Sizda admin huquqi yo‘q.");
      return;
    }

    await showAdminMenu(chatId);
    return;
  }

  if (isAdmin(userId)) {
    const state = await getAdminState(userId);

    if (state === "add_channel") {
      const channel = normalizeChannel(text);

      if (!channel) {
        await sendMessage(
          chatId,
          "Username noto‘g‘ri. @kanal_nomi shaklida yuboring. Bekor qilish uchun /cancel yozing."
        );
        return;
      }

      const channels = await getChannels();

      if (channels.some((item) => item.username === channel.username)) {
        await setAdminState(userId, "");
        await sendMessage(chatId, "Bu kanal allaqachon ro‘yxatda bor.", {
          reply_markup: adminKeyboard(),
        });
        return;
      }

      channels.push(channel);
      await saveChannels(channels);
      await setAdminState(userId, "");

      await sendMessage(
        chatId,
        `✅ ${channel.username} homiy kanal sifatida qo‘shildi.\n\nMuhim: botni ushbu kanalga administrator qilib qo‘shing, aks holda obunani tekshira olmasligi mumkin.`,
        { reply_markup: adminKeyboard() }
      );
      return;
    }
  }

  const channels = await getChannels();

  if (channels.length) {
    const subscribed = await checkSubscription(userId, channels);

    if (!subscribed) {
      await askForSubscription(chatId, channels);
      return;
    }
  }

  if (text.startsWith("/")) {
    await sendMessage(
      chatId,
      "Buyruq topilmadi. Savolingizni oddiy matn shaklida yozing."
    );
    return;
  }

  await sendMessage(chatId, "⏳ Savolingiz ko‘rib chiqilmoqda...");

  try {
    const answer = await getLegalAnswer(text);
    const maxLength = 4000;

    for (let i = 0; i < answer.length; i += maxLength) {
      await sendMessage(chatId, answer.slice(i, i + maxLength));
    }
  } catch (error) {
    console.error("Huquqiy AI xatosi:", error.message);
    await sendMessage(
      chatId,
      "Kechirasiz, hozir javob tayyorlashda xatolik yuz berdi. Birozdan keyin qayta urinib ko‘ring."
    );
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Huquqiy AI Telegram webhook ishlayapti.");
  }

  try {
    const update = req.body;

    if (update?.callback_query) {
      await handleCallback(update.callback_query);
    } else if (update?.message) {
      await handleMessage(update.message);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram handler xatosi:", error);

    // Telegram qayta-qayta so‘rov yubormasligi uchun.
    return res.status(200).json({ ok: false });
  }
}
