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
      console.error("GEMINI_API_KEY topilmadi");

      return res.status(500).json({
        error: "GEMINI_API_KEY Vercel Environment Variables'da topilmadi"
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: `
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
`
              }
            ]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: question.trim()
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    console.log("Gemini status:", response.status);
    console.log("Gemini response:", JSON.stringify(data));

    if (!response.ok) {
      return res.status(500).json({
        error:
          data?.error?.message ||
          `Gemini API xatosi: ${response.status}`
      });
    }

    const answer =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") ||
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
