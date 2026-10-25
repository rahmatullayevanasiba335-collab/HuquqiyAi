
const MAX_QUESTION_LENGTH = 5000;

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Faqat POST so'rovi qabul qilinadi."
    });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY sozlanmagan.");
      return res.status(500).json({
        error: "Server sozlamalarida xatolik."
      });
    }

    const question =
      typeof req.body?.question === "string"
        ? req.body.question.trim()
        : "";

    if (!question) {
      return res.status(400).json({
        error: "Savolingizni kiriting."
      });
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return res.status(400).json({
        error: "Savol 5000 belgidan oshmasligi kerak."
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    let response;

    try {
      response = await fetch(
        "https://generativelanguage.googleapis.com/v1/interactions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey
          },
          body: JSON.stringify({
            model: "gemini-3.5-flash-lite",
            input: question
          }),
          signal: controller.signal
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      console.error("Gemini API status:", response.status);

      return res.status(502).json({
        error: "Javob olishda xatolik yuz berdi. Qayta urinib ko'ring."
      });
    }

    const data = await response.json();

    const answer =
      data.output_text ||
      (Array.isArray(data.steps)
        ? data.steps
            .flatMap(step => step.content || [])
            .filter(item => item.type === "text")
            .map(item => item.text || "")
            .join("\n")
        : "");

    if (!answer) {
      console.error("Gemini javob matnini qaytarmadi.");

      return res.status(502).json({
        error: "Javob tayyorlanmadi. Qayta urinib ko'ring."
      });
    }

    return res.status(200).json({ answer });
  } catch (error) {
    console.error("Chat API xatosi:", error.name);

    return res.status(500).json({
      error: "Serverda xatolik yuz berdi. Qayta urinib ko'ring."
    });
  }
}
