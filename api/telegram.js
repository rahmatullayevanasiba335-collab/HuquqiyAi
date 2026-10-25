
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("Yurdik_bot ishlayapti");
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const apiKey = process.env.GEMINI_API_KEY;

  async function sendMessage(chatId, text) {
    const r = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: String(text).slice(0, 4000)
        })
      }
    );

    if (!r.ok) {
      throw new Error("Telegram: " + await r.text());
    }
  }

  try {
    if (!token || !apiKey) {
      console.error("Environment variable yetishmayapti.");
      return res.status(500).send("Token yoki API kalit sozlanmagan");
    }

    const message = req.body && req.body.message;
    const chatId = message && message.chat && message.chat.id;
    const text = message && message.text && message.text.trim();

    if (!chatId || !text) {
      return res.status(200).json({ ok: true });
    }

    if (text === "/start") {
      await sendMessage(
        chatId,
        "Assalomu alaykum! ⚖️ Yurdik_bot ishlayapti.\n\n" +
        "O‘zbekiston qonunchiligi bo‘yicha savolingizni yuboring."
      );
      return res.status(200).json({ ok: true });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text:
                "Siz O‘zbekiston qonunchiligi bo‘yicha yordamchi botsiz. " +
                "O‘zbek tilida sodda va tushunarli javob bering. " +
                "Javobda QONUNIY ASOS, TAHLIL va XULOSA bo‘lsin. " +
                "Modda raqamini bilmasangiz, uydirmang. " +
                "Rasmiy manba: https://lex.uz/uz. " +
                "Qonun matnini tekshirmagan bo‘lsangiz, tekshirdim demang."
            }]
          },
          contents: [{
            role: "user",
            parts: [{ text: text }]
          }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1800
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API xatosi:", data);

      const msg = response.status === 429
        ? "Gemini bepul kvotasi yoki so‘rov limiti tugagan. Keyinroq urinib ko‘ring."
        : "Gemini API xatosi: " +
          (data.error && data.error.message
            ? data.error.message
            : "Noma’lum xato");

      await sendMessage(chatId, msg);
      return res.status(200).json({ ok: true });
    }

    const answer = data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts
        .map(part => part.text || "")
        .join("")
        .trim();

    if (!answer) {
      await sendMessage(
        chatId,
        "AI javob tayyorlay olmadi. Birozdan so‘ng qayta urinib ko‘ring."
      );
    } else {
      await sendMessage(chatId, answer);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook xatosi:", error);
    return res.status(200).json({ ok: true });
  }
}
