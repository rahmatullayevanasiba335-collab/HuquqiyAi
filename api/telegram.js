const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

async function sendMessage(chatId, text, extra = {}) {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...extra,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(data.description || "Telegram xatosi");
  }

  return data;
}

async function getLegalAnswer(question) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY sozlanmagan");
  }

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=" +
      encodeURIComponent(GEMINI_API_KEY),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text:
                "Siz O‘zbekiston qonunchiligi bo‘yicha yordam beruvchi huquqiy AI yordamchisiz. " +
                "Foydalanuvchiga o‘zbek tilida tushunarli va ehtiyotkor javob bering. " +
                "Qonun moddasi yoki huquqiy ma’lumotga ishonchingiz komil bo‘lmasa, uni to‘qib chiqarmang. " +
                "Ma’lumot umumiy huquqiy axborot ekanini, murakkab holatda advokatga murojaat qilish kerakligini ayting.",
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
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Gemini API xatosi:", JSON.stringify(data));
    throw new Error(
      data?.error?.message || `Gemini API xatosi: ${response.status}`
    );
  }

  const answer = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error("AI javob qaytarmadi. Qayta urinib ko‘ring.");
  }

  return answer;
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const text = (message.text || "").trim();
  const userId = message.from?.id;

  if (!text) {
    return sendMessage(chatId, "Iltimos, savolingizni matn shaklida yuboring.");
  }

  if (text === "/start") {
    return sendMessage(
      chatId,
      "Assalomu alaykum!\n\n" +
        "⚖️ Huquqiy AI botiga xush kelibsiz.\n\n" +
        "O‘zbekiston qonunchiligi bo‘yicha savolingizni yozing. " +
        "Men tushunarli javob berishga harakat qilaman.\n\n" +
        "Eslatma: javoblar umumiy huquqiy ma’lumot bo‘lib, advokat maslahatining o‘rnini bosmaydi."
    );
  }

  if (text === "/admin") {
    if (
      !ADMIN_TELEGRAM_ID ||
      String(userId) !== String(ADMIN_TELEGRAM_ID)
    ) {
      return sendMessage(chatId, "⛔ Sizda admin huquqi yo‘q.");
    }

    return sendMessage(
      chatId,
      "👨‍💻 Admin panel\n\n" +
        "Bot ishlamoqda.\n" +
        "Majburiy kanal obunasi o‘chirilgan."
    );
  }

  if (text.startsWith("/")) {
    return sendMessage(
      chatId,
      "Mavjud buyruq: /start\n\nHuquqiy savolingizni oddiy matnda yozing."
    );
  }

  await sendMessage(chatId, "⏳ Savolingizga javob tayyorlanmoqda...");

  try {
    const answer = await getLegalAnswer(text);

    // Telegram bitta xabarda cheklov qo‘yadi.
    const maxLength = 4000;

    for (let i = 0; i < answer.length; i += maxLength) {
      await sendMessage(chatId, answer.slice(i, i + maxLength));
    }
  } catch (error) {
    console.error("Huquqiy AI xatosi:", error);

    await sendMessage(
      chatId,
      "Kechirasiz, hozir javob tayyorlashda xatolik yuz berdi. " +
        "Birozdan keyin qayta urinib ko‘ring."
    );
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Huquqiy AI bot ishlamoqda.");
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN sozlanmagan");
    return res.status(500).send("Bot tokeni sozlanmagan.");
  }

  try {
    const update = req.body;

    if (update?.message) {
      await handleMessage(update.message);
    }

    if (update?.callback_query) {
      const callback = update.callback_query;

      await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: callback.id,
          text: "Bu tugma hozir faol emas.",
        }),
      });
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Telegram handler xatosi:", error);
    return res.status(200).send("Xatolik qayd etildi.");
  }
};
