
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendMessage(chatId, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram API error: ${await response.text()}`);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).send("Yurdik_bot ishlayapti");
  }

  if (!TELEGRAM_TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN sozlanmagan");
    return res.status(500).send("Bot tokeni sozlanmagan");
  }

  try {
    const update = req.body;
    const message = update && update.message;

    if (!message || !message.chat || !message.text) {
      return res.status(200).send("OK");
    }

    const chatId = message.chat.id;
    const text = message.text.trim();

    if (!text) {
      await sendMessage(chatId, "Iltimos, savolingizni yozing.");
      return res.status(200).send("OK");
    }

    if (text === "/start") {
      await sendMessage(
        chatId,
        "Assalomu alaykum! ⚖️ Yurdik_bot'ga xush kelibsiz.\n\n" +
        "O‘zbekiston qonunchiligiga oid savolingizni yuboring.\n\n" +
        "Men Lex.uz bo‘yicha hujjatlarni qidirish havolasini beraman.\n\n" +
        "Masalan: mehnat ta'tili, aliment, ijara shartnomasi."
      );

      return res.status(200).send("OK");
    }

    const query = encodeURIComponent(`site:lex.uz ${text}`);
    const googleUrl = `https://www.google.com/search?q=${query}`;
    const lexUrl = "https://lex.uz/uz";

    const answer =
      "⚖️ Qonunchilik bo‘yicha qidiruv\n\n" +
      `Savolingiz: ${text}\n\n` +
      "🔎 Lex.uz hujjatlarini qidirish:\n" +
      googleUrl + "\n\n" +
      "📚 Rasmiy qonunchilik bazasi:\n" +
      lexUrl + "\n\n" +
      "Eslatma: tegishli hujjatni ochib, amaldagi tahriri va moddasini tekshiring.";

    await sendMessage(chatId, answer);
    return res.status(200).send("OK");
  } catch (error) {
    console.error("Telegram bot xatosi:", error);
    return res.status(200).send("OK");
  }
};
