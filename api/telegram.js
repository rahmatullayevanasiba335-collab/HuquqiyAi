
const GEMINI_MODEL = "gemini-3.5-flash-lite";

const TELEGRAM_API =
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendMessage(chatId, text) {
  // Telegram xabar uzunligi chegarasiga rioya qilish
  const chunks = [];
  for (let i = 0; i < text.length; i += 3500) {
    chunks.push(text.slice(i, i + 3500));
  }

  for (const chunk of chunks) {
    const response = await fetch(`${TELEGRAM_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        disable_web_page_preview: true,
      }),
    });

    if (!response.ok) {
      console.error("Telegram xatosi:", await response.text());
    }
  }
}

async function getLegalAnswer(question) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY sozlanmagan");

  const prompt = `
Sen HuquqiyAi — O‘zbekiston qonunchiligi bo‘yicha yordamchi AI-san.

FOYDALANUVCHI SAVOLI:
${question}

ASOSIY TALABLAR:
1. Savolga o‘zbek tilida, sodda, aniq va tushunarli javob ber.
2. Avvalo O‘zbekiston Respublikasi qonunchiligiga tayan.
3. Google Search yordamida tegishli huquqiy ma'lumotlarni izla.
4. Lex.uz (https://lex.uz/uz) dagi rasmiy qonun hujjatlariga ustuvorlik ber.
5. Zarur bo‘lsa, Adliya vazirligi (adliya.uz), Hukumat portali
   (gov.uz) va tegishli davlat idoralarining rasmiy manbalaridan foydalan.
6. Qonun nomi, modda raqami va hujjat raqamini faqat manba bilan
   tasdiqlay olsang yoz. Hech qachon modda yoki havola to‘qib chiqarma.
7. Imkon bo‘lsa, tegishli qonunning bevosita havolasini keltir.
   Havola topilmasa, Lex.uz qidiruv sahifasini ko‘rsat:
   https://lex.uz/uz
8. Qonun amaldagi tahrirda ekanini ishonchli tasdiqlay olmasang,
   buni ochiq ayt va Lex.uz orqali tekshirishni tavsiya qil.
9. Javobni quyidagi tartibda tuz:

📌 QISQA JAVOB
Savolga to‘g‘ridan-to‘g‘ri javob.

⚖️ HUQUQIY ASOS
Qonun nomi, tegishli modda va uning mazmuni.
Tasdiqlanmagan raqamlarni keltirma.

📝 AMALIY TAVSIYA
Foydalanuvchi qanday yo‘l tutishi mumkin.

🔗 MANBALAR
Qidiruvda topilgan haqiqiy manba nomlari va URL havolalari.

10. Ishonchli huquqiy manba topilmasa, buni ayt. Taxminni qonun
    sifatida ko‘rsatma.
11. Bu umumiy huquqiy ma'lumot ekanini va murakkab holatlarda
    advokat yoki yuristga murojaat qilish foydali ekanini eslat.
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
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          tools: [
            {
              google_search: {},
            },
          ],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 2200,
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

        throw new Error("AI javobi bo‘sh qaytdi");
      }

      const message = data.error?.message || `HTTP ${response.status}`;
      lastError = new Error(message);
      console.error("Gemini API:", response.status, message);

      if (![429, 500, 502, 503, 504].includes(response.status)) {
        throw lastError;
      }
    } catch (error) {
      lastError = error;
      console.error("AI so‘rovi:", error.message);
    }

    if (attempt < 2) await sleep(1000 * (attempt + 1));
  }

  throw lastError || new Error("AI xizmati vaqtincha ishlamayapti");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("HuquqiyAi bot ishlayapti");
  }

  try {
    const message = req.body?.message;

    if (!message) {
      return res.status(200).json({ ok: true });
    }

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
        "Assalomu alaykum! HuquqiyAi botiga xush kelibsiz! ⚖️\n\n" +
          "Men O‘zbekiston qonunchiligi asosida huquqiy savollaringizga " +
          "javob berishga harakat qilaman.\n\n" +
          "📚 Lex.uz va boshqa rasmiy manbalardan ma'lumot izlayman.\n" +
          "🔗 Javoblarda qonuniy asoslar va manba havolalarini ko‘rsataman.\n\n" +
          "Savolingizni yozing.\n\n" +
          "Misol: Ish beruvchi meni sababsiz ishdan bo‘shatishi mumkinmi?"
      );
      return res.status(200).json({ ok: true });
    }

    if (text === "/admin") {
      if (adminId && userId === adminId) {
        await sendMessage(
          chatId,
          "⚙️ Admin bo‘limi\n\n" +
            "Bot webhook orqali ishlamoqda.\n" +
            "Majburiy kanal obunasi o‘chirilgan."
        );
      } else {
        await sendMessage(chatId, "Bu buyruq faqat admin uchun.");
      }
      return res.status(200).json({ ok: true });
    }

    if (text.startsWith("/")) {
      await sendMessage(
        chatId,
        "Buyruq topilmadi. /start ni bosing yoki huquqiy savolingizni yozing."
      );
      return res.status(200).json({ ok: true });
    }

    await sendMessage(chatId, "🔎 Huquqiy manbalar izlanmoqda. Biroz kuting...");

    try {
      const answer = await getLegalAnswer(text);
      await sendMessage(chatId, answer);
    } catch (error) {
      console.error("Javob xatosi:", error.message);
      await sendMessage(
        chatId,
        "Kechirasiz, hozir huquqiy javobni tayyorlay olmadim.\n\n" +
          "Birozdan so‘ng qayta urinib ko‘ring yoki " +
          "https://lex.uz/uz saytidan qonunchilikni tekshiring."
      );
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Webhook xatosi:", error.message);
    return res.status(200).json({ ok: true });
  }
}
