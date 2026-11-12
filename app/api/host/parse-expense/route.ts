// app/api/host/parse-expense/route.ts
import { NextResponse } from "next/server";

const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
];

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const imageFile = formData.get("image") as File | null;
    const audioFile = formData.get("audio") as File | null;
    const voiceTranscript = (formData.get("transcript") as string) || "";
    const categoriesJson = (formData.get("categories") as string) || "{}";
    const roomsJson = (formData.get("rooms") as string) || "[]";

    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Chave da API Gemini não configurada." },
        { status: 500 },
      );
    }

    const parts: any[] = [];

    const prompt = `
Você é um assistente financeiro de clínicas de saúde.
Analise a foto da nota fiscal/recibo e/ou o comando de voz do anfitrião.
Categorias disponíveis (chave: nome): ${categoriesJson}
Salas disponíveis (id e nome): ${roomsJson}
Transcrição de voz (se houver): "${voiceTranscript}"
Data de hoje: ${new Date().toISOString().slice(0, 10)}

Retorne APENAS um JSON válido (sem markdown) no formato:
{
  "title": "Descrição clara da despesa",
  "vendor": "Nome do fornecedor ou estabelecimento (se houver)",
  "amount": 0.00,
  "expense_date": "YYYY-MM-DD",
  "category_key": "chave da categoria existente ou um novo nome pedido pelo usuário",
  "category_label": "Nome amigável da categoria",
  "is_new_category": false,
  "cost_type": "fixed ou variable",
  "room_id": "ID da sala se mencionada, ou vazio para custo geral",
  "payment_status": "paid ou pending",
  "notes": "Observação extraída"
}
`.trim();

    parts.push({ text: prompt });

    if (imageFile && imageFile.size > 0) {
      const arrayBuffer = await imageFile.arrayBuffer();
      parts.push({
        inlineData: {
          mimeType: imageFile.type || "image/jpeg",
          data: Buffer.from(arrayBuffer).toString("base64"),
        },
      });
    }

    if (audioFile && audioFile.size > 0) {
      const audioBuffer = await audioFile.arrayBuffer();
      parts.push({
        inlineData: {
          mimeType: audioFile.type || "audio/webm",
          data: Buffer.from(audioBuffer).toString("base64"),
        },
      });
    }

    let lastError = "";

    for (const modelName of FALLBACK_MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json",
              },
            }),
          },
        );

        if (!response.ok) {
          lastError = await response.text();
          continue;
        }

        const result = await response.json();
        const rawText =
          result?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
        const cleaned = rawText
          .replace(/```json/gi, "")
          .replace(/```/g, "")
          .trim();

        return NextResponse.json({
          success: true,
          modelUsed: modelName,
          data: JSON.parse(cleaned),
        });
      } catch (err: any) {
        lastError = err.message || "Erro na leitura";
      }
    }

    return NextResponse.json(
      { error: `Falha ao processar comprovante: ${lastError}` },
      { status: 503 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro interno." },
      { status: 500 },
    );
  }
}