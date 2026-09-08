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

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-5-mini",
        input: [
          {
            role: "system",
            content:
              "Siz O'zbekiston qonunchiligi bo'yicha yordam beruvchi Huquqiy AI assistantsiz. Javoblarni o'zbek tilida, tushunarli va ehtiyotkor tarzda bering. Qonun moddasini aniq bilmasangiz, uydirmang."
          },
          {
            role: "user",
            content: question
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.error?.message || "OpenAI API xatosi"
      });
    }

    const answer =
      data.output_text ||
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
