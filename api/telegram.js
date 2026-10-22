
const GEMINI_MODEL = "gemini-3.5-flash-lite";

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendMessage(chatId, text) {
  const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });

  if (!response.ok) {
    console.error("Telegram xatosi:", await response.text());
  }
}

async function getLegalAnswer(question) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error("GEMINI_API_KEY sozlanmagan");
  }

  const prompt = `
Sen O‘zbekiston qonunchiligi bo‘yicha yordamchi AI assistantsan.
Foydalanuvchiga o‘zbek tilida, sodda va tushunarli javob ber.

Qoidalar:
- Qonun moddasi yoki raqamini aniq bilmasang, to‘qib chiqarmagin.
- Huquqiy ma'lumotlar o‘zgarishi mumkinligini eslat.
- Zarur bo‘lsa, lex.uz saytidan tekshirishni tavsiya qil.
- Bu umumiy ma'lumot, rasmiy advokat maslahatining o‘rnini bosmaydi.

Foydalanuvchining savoli:
${question}
`;

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

  let lastError;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1500,
          },
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const answer = data.candidates?.[0]?.content?.parts
          ?.map((part) => part.text || "")
          .join("")
          .trim();

        if (answer) return answer;

        throw new Error("Gemini javob qaytarmadi");
      }

      const message =
        data.error?.message || `HTTP ${response.status}`;

      lastError = new Error(message);

      console.error("Gemini API xatosi:", response.status, message);

      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      console.error("AI so‘rov xatosi:", error.message);
    }

    if (attempt < 2) {
      await sleep(1000 * (attempt + 1));
    }
  }

  throw lastError || new Error("AI xizmati hozir ishlamayapti");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("HuquqiyAi bot ishlayapti");
  }

  try {
    const update = req.body;

    if (!update?.message) {
      return res.status(200).json({ ok: true });
    }

    const message = update.message;
    const chatId = message.chat?.id;
    const text = message.text?.trim();

    if (!chatId || !text) {
      return res.status(200).json({ ok: true });
    }

    const adminId = process.env.ADMIN_TELEGRAM_ID;
    const userId = String(message.from?.id || "");

    if (text === "/start") {
      await sendMessage(
        chatId,
        "Assalomu alaykum! HuquqiyAi botiga xush kelibsiz.\n\n" +
          "Men O‘zbekiston qonunchiligi bo‘yicha umumiy ma’lumot beraman.\n\n" +
          "Savolingizni yozib yuboring.\n\n" +
          "Masalan: Mehnat shartnomasi nima?"
      );

      return res.status(200).json({ ok: true });
    }

    if (text === "/admin") {
      if (adminId && userId === adminId) {
        await sendMessage(
          chatId,
          "Admin bo‘limi\n\nBot ishlayapti.\nMajburiy obuna talabi o‘chirilgan."
        );
      } else {
        await sendMessage(chatId, "Bu buyruq faqat admin uchun.");
      }

      return res.status(200).json({ ok: true });
    }

    if (text.startsWith("/")) {
      await sendMessage(
        chatId,
        "Buyruq tanilmadi. Botni boshlash uchun /start ni yuboring yoki savolingizni yozing."
      );

      return res.status(200).json({ ok: true });
    }

    await sendMessage(chatId, "Savolingiz ko‘rib chiqilmoqda...");

    try {
      const answer = await getLegalAnswer(text);
      await sendMessage(chatId, answer);
    } catch (error) {
      console.error("Javob tayyorlashda xato:", error.message);

      await sendMessage(
        chatId,
        "Kechirasiz, AI xizmati hozir javob bera olmayapti. Birozdan so‘ng qayta urinib ko‘ring."
      );
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook xatosi:", error.message);
    return res.status(200).json({ ok: true });
  }
}
