import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const sessions = globalThis.kigazineSessions || new Map();
globalThis.kigazineSessions = sessions;

const SYSTEM_PROMPT = `You are Kigazine AI, a kid-friendly assistant for a creative online magazine platform called Kigazine.

Rules:
- Keep answers friendly, safe, and encouraging.
- Never generate dangerous, hateful, sexual, or violent content.
- Avoid sharing private information.
- Help with school, coding, creativity, robotics, writing, and magazines.
- Use concise formatting.
- Keep responses appropriate for younger users.
`;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const {
      message,
      sessionId,
      mode
    } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        error: "Missing message"
      });
    }

    const safeSessionId =
      typeof sessionId === "string"
        ? sessionId
        : crypto.randomUUID();

    const history =
      sessions.get(safeSessionId) || [];

    const modePrompt = {
      friendly: "Be warm and encouraging.",
      normal: "Be balanced and helpful.",
      work: "Be organized and professional.",
      coding: "Focus on programming and debugging.",
      school: "Explain things clearly for students.",
      creative: "Be imaginative and idea-focused.",
      kids: "Use very simple kid-friendly language."
    };

    history.push({
      role: "user",
      content: message
    });

    const completion = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            SYSTEM_PROMPT +
            "\n\n" +
            (modePrompt[mode] || "")
        },
        ...history.slice(-12)
      ],
      temperature: 0.8,
      max_tokens: 500
    });

    const reply =
      completion.choices?.[0]?.message?.content ||
      "I could not generate a response.";

    history.push({
      role: "assistant",
      content: reply
    });

    sessions.set(
      safeSessionId,
      history.slice(-20)
    );

    return res.status(200).json({
      reply,
      sessionId: safeSessionId
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error:
        error?.message ||
        "Server error"
    });
  }
}
