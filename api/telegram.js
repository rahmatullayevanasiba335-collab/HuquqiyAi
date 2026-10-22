
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Yurdik_bot ishlayapti");
  }

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const geminiKey = process.env.GEMINI_API_KEY;

  async function sendTelegramMessage(chatId, text) {
    const response = await fetch(
      `https://api.telegram.org/bot${telegramToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: String(text).slice(0, 4000)
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Telegram xatosi: ${await response.text()}`
      );
    }
  }

  try {
    if (!telegramToken || !geminiKey) {
      console.error("API token yoki kalit sozlanmagan.");
      return res.status(500).json({
        ok: false,
        error: "Environment variable sozlanmagan"
      });
    }

    const message = req.body?.message;
    const chatId = message?.chat?.id;
    const text = message?.text?.trim();

    if (!chatId || !text) {
      return res.status(200).json({ ok: true });
    }

    if (text === "/start") {
      await sendTelegramMessage(
        chatId,
        "Assalomu alaykum! ⚖️ Yurdik_bot ishga tushdi.\n\n" +
        "O‘zbekiston qonunchiligi bo‘yicha savolingizni yozing."
      );

      return res.status(200).json({ ok: true });
    }

    // Gemini API orqali javob olish
    const aiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": geminiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text:
                  "Siz O‘zbekiston qonunchiligi bo‘yicha yordam beruvchi " +
                  "huquqiy assistantsiz. Faqat o‘zbek tilida javob bering.\n\n" +
                  "Foydalanuvchining savoliga to‘g‘ridan-to‘g‘ri javob bering.\n" +
                  "Javob tuzilishi:\n" +
                  "⚖️ QISQA JAVOB:\n" +
                  "📚 QONUNIY ASOS:\n" +
                  "🔎 TAHLIL:\n" +
                  "✅ XULOSA:\n\n" +
                  "O‘zbekiston qonunchiligiga tayaning. Tegishli qonun va " +
                  "moddani bilsangiz, nomini va raqamini yozing. Ishonchingiz " +
                  "komil bo‘lmasa, modda raqamini uydirmang. Rasmiy manba " +
                  "sifatida https://lex.uz/uz ni ko‘rsating. Qonun matnini " +
                  "tekshirmagan bo‘lsangiz, tekshirdim deb da’vo qilmang. " +
                  "Javob oxirida aniq vaziyatga qarab huquqiy maslahat " +
                  "farq qilishi mumkinligini qisqacha eslatib o‘ting."
              }
            ]
          },
          contents: [
            {
              role: "user",
              parts: [{ text }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1800
          }
        })
      }
    );

    const data = await aiResponse.json();

    if (!aiResponse.ok) {
      console.error("Gemini API xatosi:", data);

      const status = aiResponse.status;
      let errorText = data.error?.message || "AI xizmatida xatolik.";

      if (status === 429) {
        errorText =
          "Gemini API bepul kvotasi tugagan yoki so‘rovlar limiti oshgan. " +
          "Birozdan so‘ng qayta urinib ko‘ring yoki API kvotasini tekshiring.";
      } else if (status === 401 || status === 403) {
        errorText =
          "Gemini API kaliti noto‘g‘ri yoki ushbu modeldan foydalanish ruxsati yo‘q.";
      } else if (status === 404) {
        errorText =
          "Gemini modeli topilmadi. AI Studio’da mavjud model nomini tekshiring.";
      }

      await sendTelegramMessage(chatId, "⚠️ " + errorText);
      return res.status(200).json({ ok: true });
    }

    const answer = data.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || "")
      .join("")
      .trim();

    if (!answer) {
      console.error(
        "Gemini javob bermadi:",
        JSON.stringify(data)
      );

      await sendTelegramMessage(
        chatId,
        "Kechirasiz, AI hozir javob tayyorlay olmadi. Qayta urinib ko‘ring."
      );

      return res.status(200).json({ ok: true });
    }

    await sendTelegramMessage(chatId, answer);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook xatosi:", error);

    return res.status(200).json({ ok: true });
  }
}
