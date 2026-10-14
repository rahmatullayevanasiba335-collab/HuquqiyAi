export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Faqat POST so'rovi qabul qilinadi"
    });
  }

  try {
    const { question } = req.body || {};

    if (
      typeof question !== "string" ||
      !question.trim()
    ) {
      return res.status(400).json({
        error: "Savol kiritilmagan"
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "GEMINI_API_KEY topilmadi"
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1/interactions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          model: "gemini-3.1-flash-lite",

          system_instruction: `
Siz "Huquqiy AI" — O'zbekiston qonunchiligi
bo'yicha umumiy huquqiy ma'lumot beruvchi
AI assistantsiz.

Javoblarni o'zbek tilida, sodda va tushunarli bering.

JAVOB TUZILISHI:

1. QONUNIY ASOS:
Tegishli qonun, kodeks yoki normativ-huquqiy hujjatni
ko'rsating. Modda raqamini aniq bilmasangiz, uydirmang.

2. TAHLIL:
Foydalanuvchining holatini huquqiy jihatdan tushuntiring.

3. XULOSA:
Qisqa, aniq va amaliy javob bering.

MUHIM QOIDALAR:
- O'zbekiston qonunchiligiga asoslaning.
- Amaldagi qonun haqida ishonchingiz komil bo'lmasa,
  LexUZ orqali tekshirishni tavsiya qiling.
- Mavjud bo'lmagan qonun yoki moddalarni o'ylab topmang.
- Kerak bo'lsa, foydalanuvchidan qo'shimcha ma'lumot so'rang.
- Javobni tushunarli va xolis yozing.
- Bu umumiy huquqiy ma'lumot ekanini eslatib o'ting.
`,

          input: question.trim()
        })
      }
    );

    const data = await response.json();

    console.log("Gemini HTTP status:", response.status);

    if (!response.ok) {
      console.error(
        "Gemini API xatosi:",
        JSON.stringify(data)
      );

      return res.status(response.status === 429 ? 429 : 500).json({
        error:
          data?.error?.message ||
          data?.message ||
          "Gemini API xatosi"
      });
    }

    const answer =
      data?.output_text ||
      data?.steps
        ?.filter(step => step.type === "model_output")
        ?.flatMap(step => step.content || [])
        ?.filter(item => item.type === "text")
        ?.map(item => item.text)
        ?.join("") ||
      "Javob olinmadi. Iltimos, qayta urinib ko'ring.";

    return res.status(200).json({
      answer:
        answer +
        "\n\n⚠️ Ushbu ma'lumot umumiy huquqiy ma'lumot bo'lib, professional yuridik maslahat o'rnini bosmaydi."
    });

  } catch (error) {
    console.error("Server xatosi:", error);

    return res.status(500).json({
      error: "Serverda xatolik yuz berdi. Keyinroq urinib ko'ring."
    });
  }
}
