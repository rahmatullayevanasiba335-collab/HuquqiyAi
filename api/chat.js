export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Faqat POST so'rovi qabul qilinadi"
    });
  }

  try {
    const { question } = req.body || {};

    if (!question || !question.trim()) {
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
          model: "gemini-3.6-flash",

          system_instruction: `
Siz "Huquqiy AI" — O'zbekiston qonunchiligi bo'yicha
umumiy huquqiy ma'lumot beruvchi AI assistantsiz.

Javoblarni o'zbek tilida, sodda va tushunarli bering.

QONUNIY ASOS:
Tegishli kodeks, qonun yoki normativ-huquqiy hujjat.

TAHLIL:
Foydalanuvchining holatini huquqiy jihatdan tushuntiring.

XULOSA:
Qisqa va aniq javob bering.

Muhim:
- Qonun yoki modda raqamini aniq bilmasangiz, uydirmang.
- Amaldagi qonunchilikni tekshirish uchun LexUZ'dan foydalanishni tavsiya qiling.
- Bu umumiy huquqiy ma'lumot ekanini eslatib o'ting.
`,

          input: question.trim()
        })
      }
    );

    const data = await response.json();

    console.log("Gemini status:", response.status);
    console.log("Gemini response:", JSON.stringify(data));

    if (!response.ok) {
      return res.status(500).json({
        error: data?.error?.message || "Gemini API xatosi"
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
      "Javob olinmadi.";

    return res.status(200).json({
      answer:
        answer +
        "\n\n⚠️ Ushbu ma'lumot umumiy huquqiy ma'lumot bo'lib, professional yuridik maslahat o'rnini bosmaydi."
    });

  } catch (error) {
    console.error("Server xatosi:", error);

    return res.status(500).json({
      error: error.message || "Server xatosi"
    });
  }
}
