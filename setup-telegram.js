export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    return res.status(500).json({ ok: false, error: "Token topilmadi" });
  }

  const webhookUrl =
    "https://huquqiy-ai-teal.vercel.app/api/telegram";

  const response = await fetch(
    `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`
  );

  const data = await response.json();

  return res.status(response.ok ? 200 : 500).json(data);
}
