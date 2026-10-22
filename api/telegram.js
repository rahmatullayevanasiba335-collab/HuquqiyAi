const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;
const GEMINI_MODEL = "gemini-3.8-flash";

async function sendMessage(chatId, text) {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: String(text).slice(0, 4000),
    }),
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(
      result.description || `Telegram xatosi: ${response.status}`
    );
  }

  return result;
}

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

async function getLegalAnswer(question) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY Vercel sozlamalarida topilmadi.");
  }

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  let lastError = "AI hozir javob bera olmadi.";

  for (let attempt = 0; attempt < 3; attempt++) {
    let response;

    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text:
                  "Siz O‘zbekiston qonunchiligi bo‘yicha yordam beruvchi huquqiy AI yordamchisiz. " +
                  "O‘zbek tilida sodda, tushunarli va ehtiyotkor javob bering. " +
                  "Qonun moddalarini, sanalarni va huquqiy manbalarni to‘qib chiqarmang. " +
                  "Ma’lumot yetarli bo‘lmasa, buni ochiq ayting. " +
                  "Javob umumiy huquqiy axborot ekanini va murakkab holatlarda advokatga murojaat qilish lozimligini eslatib o‘ting.",
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
      });

      const data = await response.json();

      if (response.ok) {
        const answer = data?.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("")
          .trim();

        if (answer) return answer;

        lastError =
          data?.promptFeedback?.blockReason
            ? `Savol xavfsizlik qoidasi sabab bloklandi: ${data.promptFeedback.blockReason}`
            : "AI bo‘sh javob qaytardi.";
        break;
      }

      lastError =
        data?.error?.message ||
        `Gemini API xatosi: ${response.status}`;

      console.error(
        `Gemini API xatosi (${response.status}), urinish ${attempt + 1}:`,
        lastError
      );

      // Faqat vaqtinchalik server yoki tezlik cheklovi xatolarida qayta urinish.
      if (
        ![429, 500, 502, 503, 504].includes(response.status) ||
        attempt === 2
      ) {
        break;
      }
    } catch (error) {
      lastError = error.message || "Tarmoq xatosi";
      console.error("Gemini bilan ulanish xatosi:", lastError);

      if (attempt === 2) break;
    }

    await sleep(1500 * (attempt + 1));
  }

  throw new Error(lastError);
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = (message.text || "").trim();

  if (!text) {
    await sendMessage(chatId, "Iltimos, savolingizni matn shaklida yuboring.");
    return;
  }

  if (text === "/start") {
    await sendMessage(
      chatId,
      "Assalomu alaykum!\n\n" +
        "⚖️ Huquqiy AI botiga xush kelibsiz!\n\n" +
        "O‘zbekiston qonunchiligi bo‘yicha savolingizni yozing.\n\n" +
        "Eslatma: javoblar umumiy huquqiy ma’lumotdir. " +
        "Muhim masalalarda malakali yurist yoki advokat bilan maslahatlashing."
    );
    return;
  }

  if (text === "/admin") {
    if (
      !ADMIN_TELEGRAM_ID ||
      String(userId) !== String(ADMIN_TELEGRAM_ID)
    ) {
      await sendMessage(chatId, "⛔ Sizda admin huquqi yo‘q.");
      return;
    }

    await sendMessage(
      chatId,
      "👨‍💻 Admin panel\n\nBot webhook orqali ishlamoqda.\nMajburiy kanal obunasi o‘chirilgan."
    );
    return;
  }

  if (text.startsWith("/")) {
    await sendMessage(
      chatId,
      "Mavjud buyruqlar: /start va /admin\n\nHuquqiy savolingizni oddiy matnda yuboring."
    );
    return;
  }

  await sendMessage(chatId, "⏳ Savolingizga javob tayyorlanmoqda...");

  try {
    const answer = await getLegalAnswer(text);

    // Telegram xabarlari uchun xavfsizroq uzunlik.
    const chunks = answer.match(/[\s\S]{1,4000}/g) || [answer];

    for (const chunk of chunks) {
      await sendMessage(chatId, chunk);
    }
  } catch (error) {
    console.error("Huquqiy AI xatosi:", error);

    await sendMessage(
      chatId,
      "Kechirasiz, AI xizmati hozir vaqtincha ishlamayapti.\n\n" +
        "Iltimos, birozdan keyin qayta urinib ko‘ring."
    );
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Huquqiy AI bot ishlamoqda.");
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN sozlanmagan.");
    return res.status(500).send("Bot sozlamasi to‘liq emas.");
  }

  try {
    const update = req.body;

    if (update?.message) {
      await handleMessage(update.message);
    }

    if (update?.callback_query) {
      await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          callback_query_id: update.callback_query.id,
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
