
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const MAX_QUESTION_LENGTH = 5000;
const RATE_LIMIT = 10;
const RATE_WINDOW = "1 m";

let rateLimiter;

function getRateLimiter() {
  if (rateLimiter) return rateLimiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("Rate limit sozlamalari mavjud emas.");
  }

  const redis = new Redis({ url, token });

  rateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      RATE_LIMIT,
      RATE_WINDOW
    ),
    prefix: "huquqiyai:chat",
  });

  return rateLimiter;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Faqat POST so'rovi qabul qilinadi.",
    });
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const { question } = req.body || {};

    if (
      typeof question !== "string" ||
      !question.trim()
    ) {
      return res.status(400).json({
        error: "Iltimos, savolingizni kiriting.",
      });
    }

    const cleanQuestion = question.trim();

    if (cleanQuestion.length > MAX_QUESTION_LENGTH) {
      return res.status(400).json({
        error: "Savol 5000 belgidan oshmasligi kerak.",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY sozlanmagan.");

      return res.status(500).json({
        error: "Server sozlamalarida xatolik yuz berdi.",
      });
    }

    // Vercel tomonidan berilgan IP sarlavhasidan
    // foydalanish; mijoz yuborgan X-Forwarded-For
    // qiymatiga ishonmaslik kerak.
    const ip = req.headers["x-real-ip"];

    if (typeof ip !== "string" || !ip.trim()) {
      return res.status(400).json({
        error: "So'rovni tekshirib bo'lmadi.",
      });
    }

    let limiter;

    try {
      limiter = getRateLimiter();
      const result = await limiter.limit(ip);

      res.setHeader(
        "X-RateLimit-Limit",
        String(result.limit)
      );
      res.setHeader(
        "X-RateLimit-Remaining",
        String(result.remaining)
      );

      if (!result.success) {
        return res.status(429).json({
          error:
            "So'rovlar soni oshib ketdi. Bir oz kutib qayta urinib ko'ring.",
        });
      }
    } catch (error) {
      console.error("Rate limit xizmati ishlamadi.");

      // Limit xizmati ishlamasa, Gemini'ga so'rov yubormaymiz.
      return res.status(503).json({
        error:
          "Xizmat vaqtincha ishlamayapti. Keyinroq urinib ko'ring.",
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      20000
    );

    let response;

    try {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1/interactions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify({
            model: "gemini-3.5-flash-lite",
            system_instruction: `
Siz Huquqiy AI — O'zbekiston qonunchiligi bo'yicha
umumiy huquqiy ma'lumot beruvchi yordamchisiz.

Javoblarni o'zbek tilida sodda va tushunarli yozing.

1. QONUNIY ASOS:
Tegishli qonun yoki normativ-huquqiy hujjatni ko'rsating.
Modda raqamini aniq bilmasangiz, o'ylab topmang.

2. TAHLIL:
Vaziyatni huquqiy jihatdan tushuntiring.
Zarur bo'lsa, aniqlashtiruvchi savol bering.

3. XULOSA:
Qisqa va amaliy tavsiya bering.

O'zbekiston qonunchiligiga asoslaning.
Amaldagi holat noaniq bo'lsa, LexUZ orqali tekshirishni tavsiya qiling.
Mavjud bo'lmagan qonun va moddalarni uydirmang.
Bu umumiy huquqiy ma'lumot ekanini eslatib o'ting.
`,
            input: cleanQuestion,
          }),
          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    let data;

    try {
      data = await response.json();
    } catch {
      console.error("Gemini javobini o'qib bo'lmadi.");

      return res.status(502).json({
        error: "AI xizmatidan noto'g'ri javob keldi.",
      });
    }

    if (!response.ok) {
      // API kaliti yoki foydalanuvchi ma'lumotlarini log qilmang.
      console.error(
        "Gemini HTTP xatosi:",
        response.status
      );

      return res.status(
        response.status === 429 ? 429 : 502
      ).json({
        error:
          response.status === 429
            ? "AI xizmati band. Birozdan keyin qayta urinib ko'ring."
            : "AI xizmati bilan bog'lanishda xatolik yuz berdi.",
      });
    }

    const answer =
      data?.output_text ||
      data?.steps
        ?.filter((step) => step.type === "model_output")
        ?.flatMap((step) => step.content || [])
        ?.filter((item) => item.type === "text")
        ?.map((item) => item.text)
        ?.join("") ||
      "";

    if (!answer.trim()) {
      return res.status(502).json({
        error: "AI javob qaytarmadi. Qayta urinib ko'ring.",
      });
    }

    return res.status(200).json({
      answer:
        answer +
        "\n\nEslatma: ushbu ma'lumot umumiy huquqiy ma'lumot bo'lib, professional yuridik maslahat o'rnini bosmaydi.",
    });
  } catch (error) {
    // Xato tafsilotlarini foydalanuvchiga chiqarmaymiz.
    console.error(
      "Chat API ichki xatosi:",
      error?.name || "UnknownError"
    );

    return res.status(500).json({
      error: "Serverda xatolik yuz berdi. Keyinroq urinib ko'ring.",
    });
  }
}
