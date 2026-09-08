        export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const message = req.body?.message;
    const chatId = message?.chat?.id;
    const text = message?.text;

    if (!chatId || !text) {
      return res.status(200).json({ ok: true });
    }

    // /start komandasi
    if (text === "/start") {
      await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            chat_id: chatId,
            text:
              "⚖️ HUQUQIY AI\n\n" +
              "Assalomu alaykum!\n" +
              "Men O'zbekiston qonunchiligi bo'yicha huquqiy savollaringizga javob beruvchi AI yordamchiman.\n\n" +
              "📌 Menga huquqiy savolingizni yozing.\n\n" +
              "Masalan:\n" +
              "• Ish beruvchi maoshni vaqtida bermasa nima qilish kerak?\n" +
              "• Telefonim o'g'irlandi, nima qilishim kerak?\n" +
              "• Ajrashish tartibi qanday?\n\n" +
              "⚠️ Javoblar umumiy huquqiy ma'lumot hisoblanadi."
          }
        }
      );

      return res.status(200).json({ ok: true });
    }

    // AI javobi
    const aiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{
              text: `Siz Huquqiy AI Telegram botisiz.
O'zbekiston qonunchiligi bo'yicha o'zbek tilida
sodda va tushunarli javob bering.

Javobni:
QONUNIY ASOS:
TAHLIL:
XULOSA:
ko'rinishida yozing.

Modda raqamini aniq bilmasangiz, uydirmang.
⚠️ Bu umumiy huquqiy ma'lumot.`
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

    const answer =
      data.candidates?.[0]?.content?.parts
        ?.map(p => p.text || "")
        .join("") ||
      "Javob olinmadi.";

    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: answer
        })
      }
    );

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server xatosi" });
  }
}
