export default async function handler(req, res) {
if (req.method !== "POST") {
return res.status(405).json({ error: "Method not allowed" });
}

try {
const message = req.body?.message;
const chatId = message?.chat?.id;
const text = message?.text;

if (!chatId || !text) {
  return res.status(200).json({ ok: true });
}

const aiResponse = await fetch(
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY
    },
    body: JSON.stringify({
      system_instruction: {
        parts: [{
          text: `Siz Huquqiy AI Telegram botisiz.

O'zbekiston qonunchiligi bo'yicha o'zbek tilida sodda va tushunarli javob bering.
Javobni quyidagi shaklda yozing:
QONUNIY ASOS:
TAHLIL:
XULOSA:
Modda raqamini aniq bilmasangiz, uydirmang.
Bu umumiy huquqiy ma'lumot.`
}]
},
contents: [{
role: "user",
parts: [{ text }]
}]
})
}
);

const data = await aiResponse.json();

if (!aiResponse.ok) {
  console.error("Gemini xatosi:", data);
  const errorText =
    data.error?.message || "AI xizmatida xatolik yuz berdi.";

  await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `AI xatosi: ${errorText}`.slice(0, 4000)
      })
    }
  );

  return res.status(200).json({ ok: true });
}

const answer =
  data.candidates?.[0]?.content?.parts
    ?.map(p => p.text || "")
    .join("") || "AI javob qaytarmadi. Iltimos, qayta urinib ko'ring.";

const telegramResponse = await fetch(
  `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: answer.slice(0, 4000)
    })
  }
);

if (!telegramResponse.ok) {
  console.error(
    "Telegram xatosi:",
    await telegramResponse.text()
  );
}

return res.status(200).json({ ok: true });

} catch (error) {
console.error("Webhook xatosi:", error);
return res.status(500).json({ error: "Server xatosi" });
}
}
