export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Faqat POST so'rovi qabul qilinadi"
    });
  }

  try {
    const { question } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({
        error: "Savol kiritilmagan"
      });
    }

    const systemInstruction = `
Siz "Huquqiy AI" — O'zbekiston Respublikasi qonunchiligi
bo'yicha huquqiy ma'lumot beruvchi yordamchisiz.

Javob berish qoidalari:

1. Faqat o'zbek tilida javob bering.
2. Javobni sodda va tushunarli yozing.
3. Imkon qadar tegishli kodeks, qonun yoki normativ-huquqiy hujjatni ko'rsating.
4. Modda raqamini aniq bilmasangiz, hech qachon o'ylab topmang.
5. Javobni quyidagi tartibda bering:

QONUNIY ASOS:
Tegishli qonun yoki kodeks.

TAHLIL:
Foydalanuvchining holatini tushuntirish.

XULOSA:
Qisqa va aniq javob.

6. Zarur bo'lsa, foydalanuvchiga LexUZ orqali amaldagi tahrirni tekshirishni tavsiya qiling.
7. Javob oxirida:
"⚠️ Ushbu ma'lumot umumiy huquqiy ma'lumot bo'lib, professional yuridik maslahat o'rnini bosmaydi."
deb yozing.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: systemInstruction
              }
            ]
          },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: question
                }
              ]
            }
          ]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "Gemini API xatosi"
      });
    }

    const answer =
      data.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("") ||
      "Javob olinmadi.";

    return res.status(200).json({
      answer
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server xatosi"
    });
  }
}
