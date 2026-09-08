export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Faqat POST so'rovi qabul qilinadi"
    });
  }

  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({
        error: "Savol kiritilmagan"
      });
    }

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
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
                text: "Siz O'zbekiston qonunchiligi bo'yicha yordam beruvchi Huquqiy AI assistantsiz. Javoblarni o'zbek tilida, tushunarli va ehtiyotkor tarzda bering. Qonun moddasini aniq bilmasangiz, uydirmang."
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
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Javob olinmadi.";

    return res.status(200).json({
      answer: answer
    });

  } catch (error) {
    return res.status(500).json({
      error: "Server xatosi"
    });
  }
}
