const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID;

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
    throw new Error(
      data.description || `Telegram xatosi: ${method}`
    );
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

function isAdmin(userId) {
  return (
    ADMIN_TELEGRAM_ID &&
    String(userId) === String(ADMIN_TELEGRAM_ID)
  );
}

function adminKeyboard() {
  return {
    keyboard: [
      [{ text: "🤖 Bot haqida" }],
    ],
    resize_keyboard: true,
  };
}

async function getLegalAnswer(question) {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY sozlanmagan.");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text:
                "Siz O‘zbekiston qonunchiligi bo‘yicha huquqiy yordamchi botsiz. " +
                "O‘zbek tilida aniq va tushunarli javob bering. " +
                "Qonun va modda raqamlarini bilmasangiz, uydirmang. " +
                "Qonunchilik o‘zgarishi mumkinligini hisobga oling. " +
                "Murakkab masalalarda malakali yuristga murojaat qilishni tavsiya eting. " +
                "O‘zingizni advokat deb ko‘rsatmang."
            }
          ]
        },
        contents: [
          {
            role: "user",
            parts: [{ text: question }]
          }
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1500
        }
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    console.error("Gemini API xatosi:", JSON.stringify(data));
    throw new Error(
      data.error?.message || "Gemini xizmatida xatolik."
    );
  }

  const answer = data.candidates?.[0]?.content?.parts
    ?.map(part => part.text || "")
    .join("")
    .trim();

  if (!answer) {
    throw new Error("AI bo‘sh javob qaytardi.");
  }

  return answer;
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = (message.text || "").trim();

  if (!text || !userId) return;

  if (text === "/start") {
    await sendMessage(
      chatId,
      "Assalomu alaykum! Men Huquqiy AI botman.\n\n" +
      "O‘zbekiston qonunchiligi bo‘yicha savolingizni yozing. " +
      "Botdan foydalanish uchun kanalga obuna bo‘lish shart emas.",
      isAdmin(userId)
        ? { reply_markup: adminKeyboard() }
        : {}
    );
    return;
  }

  if (text === "/admin") {
    if (!isAdmin(userId)) {
      await sendMessage(chatId, "⛔ Sizda admin huquqi yo‘q.");
      return;
    }

    await sendMessage(
      chatId,
      "⚙️ Admin rejimi faol.\n" +
      "Majburiy kanal obunasi o‘chirilgan.",
      { reply_markup: adminKeyboard() }
    );
    return;
  }

  if (text === "/cancel") {
    await sendMessage(chatId, "Bekor qilindi.");
    return;
  }

  if (text === "🤖 Bot haqida") {
    await sendMessage(
      chatId,
      "Huquqiy AI — O‘zbekiston qonunchiligi bo‘yicha savollarga yordam beruvchi bot."
    );
    return;
  }

  if (text.startsWith("/")) {
    await sendMessage(
      chatId,
      "Buyruq topilmadi. Huquqiy savolingizni oddiy matnda yozing."
    );
    return;
  }

  await sendMessage(
    chatId,
    "⏳ Savolingizga javob tayyorlanmoqda..."
  );

  try {
    const answer = await getLegalAnswer(text);
    const maxLength = 4000;

    for (let i = 0; i < answer.length; i += maxLength) {
      await sendMessage(
        chatId,
        answer.slice(i, i + maxLength)
      );
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send(
      "Huquqiy AI Telegram webhook ishlayapti."
    );
  }

  try {
    const update = req.body;

    if (update?.message) {
      await handleMessage(update.message);
    }

    // Inline tugmalardan kelgan eski callback'larni
    // Telegram tomonida kutdirib qo‘ymaslik.
    if (update?.callback_query) {
      await telegram("answerCallbackQuery", {
        callback_query_id: update.callback_query.id,
        text: "Kanal boshqaruvi o‘chirilgan."
      });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Telegram handler xatosi:", error);

    return res.status(200).json({ ok: false });
  }
}
