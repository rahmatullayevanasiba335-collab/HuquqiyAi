
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const LAW_URL = "https://lex.uz/uz/acts/-6257288";

function getAnswer(question) {
  const q = question.toLowerCase();

  if (
    (q.includes("transport") || q.includes("mashina") ||
     q.includes("avtomobil") || q.includes("mashina")) &&
    (q.includes("olib qoch") || q.includes("olib ketsa") ||
     q.includes("ugon") || q.includes("o'g'irla") ||
     q.includes("o‘g‘irla"))
  ) {
    return (
      "⚖️ JAVOB: Ha, transport vositasini qonunga xilof ravishda " +
      "olib qochish jinoyat hisoblanishi mumkin.\n\n" +
      "📚 HUQUQIY ASOS:\n" +
      "O‘zbekiston Respublikasi Jinoyat kodeksining 267-moddasi — " +
      "\"Transport vositasini olib qochish\".\n\n" +
      "🔗 Rasmiy qonun matni:\n" +
      "https://lex.uz/uz/docs/-111453#-267110\n\n" +
      "❗ Javobgarlik va jazo ishning holatlari, qilmishning xususiyati " +
      "va qonunning amaldagi tahririga bog‘liq. Transportni olib qochish " +
      "bilan uni o‘g‘irlashning huquqiy farqi ham muhim."
    );
  }

  if (
    (q.includes("ishdan bo'shat") ||
      q.includes("ishdan bo‘shat") ||
      q.includes("ishdan bushat")) &&
    (q.includes("sababsiz") ||
      q.includes("mumkinmi") ||
      q.includes("ish beruvchi") ||
      q.includes("ishdan bo'shat"))
  ) {
    return (
      "⚖️ JAVOB: Ish beruvchi xodimni istalgan sababsiz ishdan " +
      "bo'shata olmaydi. Mehnat shartnomasini bekor qilish uchun " +
      "qonuniy asos va belgilangan tartib bo'lishi kerak.\n\n" +
      "📚 Huquqiy asos:\n" +
      "O'zbekiston Respublikasi Mehnat kodeksi, 161-modda — " +
      "mehnat shartnomasini ish beruvchining tashabbusiga ko'ra bekor qilish.\n\n" +
      "🔗 Rasmiy qonun:\n" + LAW_URL + "\n\n" +
      "✅ Nima qilish mumkin?\n" +
      "• Ishdan bo'shatish haqidagi buyruq nusxasini so'rang.\n" +
      "• Buyruqda ko'rsatilgan asosni tekshiring.\n" +
      "• Huquqingiz buzilgan deb hisoblasangiz, mehnat inspeksiyasi yoki " +
      "yuristga murojaat qiling.\n\n" +
      "⚠️ Aniq xulosa ishdan bo'shatish sababi va hujjatlarga bog'liq."
    );
  }

  if (
    q.includes("aliment") ||
    q.includes("bola uchun pul")
  ) {
    return (
      "⚖️ Aliment bo'yicha huquqiy ma'lumot olish uchun " +
      "Lex.uz qonunchilik bazasidan qidiring:\n\n" +
      "🔎 https://www.google.com/search?q=" +
      encodeURIComponent("site:lex.uz aliment Oila kodeksi") +
      "\n\n📚 Rasmiy baza: https://lex.uz/uz"
    );
  }

  if (
    q.includes("mehnat ta'tili") ||
    q.includes("mehnat tatili") ||
    q.includes("otpusk")
  ) {
    return (
      "⚖️ Mehnat ta'tili bo'yicha qoidalar Mehnat kodeksida belgilanadi.\n\n" +
      "🔎 Qonunchilikni qidirish:\n" +
      "https://www.google.com/search?q=" +
      encodeURIComponent("site:lex.uz Mehnat kodeksi yillik mehnat ta'tili") +
      "\n\n📚 Rasmiy baza: " + LAW_URL
    );
  }

  const searchUrl =
    "https://www.google.com/search?q=" +
    encodeURIComponent("site:lex.uz " + question);

  return (
    "⚖️ Savolingiz bo'yicha qonunchilik manbalari\n\n" +
    "Savol: " + question + "\n\n" +
    "Hozircha bu savol uchun tekshirilgan tayyor javobim yo'q. " +
    "Noto'g'ri modda aytmaslik uchun Lex.uz manbasini qidirishga yuboryapman.\n\n" +
    "🔎 Qonun hujjatlarini qidirish:\n" + searchUrl +
    "\n\n📚 Rasmiy qonunchilik bazasi:\nhttps://lex.uz/uz"
  );
}

async function sendMessage(chatId, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${TOKEN}/sendMessage`,
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
    throw new Error(await response.text());
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(200).send("Yurdik_bot ishlayapti");
  }

  if (!TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN topilmadi");
    return res.status(500).send("Bot tokeni sozlanmagan");
  }

  // Telegram webhook'iga tezda javob beramiz.
  res.status(200).send("OK");

  try {
    const message = req.body && req.body.message;
    if (!message || !message.chat || !message.text) return;

    const chatId = message.chat.id;
    const text = message.text.trim();

    if (text === "/start") {
      await sendMessage(
        chatId,
        "Assalomu alaykum! ⚖️ Yurdik_bot ishlayapti.\n\n" +
        "O'zbekiston qonunchiligi bo'yicha savolingizni yozing.\n" +
        "Masalan: Ish beruvchi meni sababsiz ishdan bo'shatishi mumkinmi?"
      );
      return;
    }

    if (text === "/help") {
      await sendMessage(
        chatId,
        "Savolingizni oddiy tilda yozing. Masalan:\n" +
        "• Ishdan bo'shatish\n• Aliment\n• Mehnat ta'tili"
      );
      return;
    }

    await sendMessage(chatId, getAnswer(text));
  } catch (error) {
    console.error("Bot xatosi:", error);
  }
};
