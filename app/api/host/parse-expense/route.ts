// app/api/host/parse-expense/route.ts
import { NextResponse } from "next/server";

// Modelos rápidos com suporte nativo a Visão + Áudio na v1beta
const FAST_VISION_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

function parseNumericAmount(raw: any): number {
  if (typeof raw === "number" && !isNaN(raw)) return raw;
  if (!raw) return 0;
  const str = String(raw).trim();
  const clean = str.replace(/[^\d.,-]/g, "");
  if (!clean) return 0;

  if (clean.includes(",") && clean.includes(".")) {
    const lastComma = clean.lastIndexOf(",");
    const lastDot = clean.lastIndexOf(".");
    if (lastComma > lastDot) {
      return parseFloat(clean.replace(/\./g, "").replace(",", ".")) || 0;
    } else {
      return parseFloat(clean.replace(/,/g, "")) || 0;
    }
  }
  if (clean.includes(",")) {
    return parseFloat(clean.replace(",", ".")) || 0;
  }
  return parseFloat(clean) || 0;
}

function extractJsonFromParts(parts: any[]): any | null {
  if (!Array.isArray(parts) || parts.length === 0) return null;

  const textContent = parts
    .filter((p) => !p?.thought && typeof p?.text === "string")
    .map((p) => p.text)
    .join("\n")
    .trim();

  const raw =
    textContent ||
    parts
      .map((p) => p?.text || "")
      .join("\n")
      .trim();

  if (!raw) return null;

  const cleaned = raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned);
}

export async function POST(req: Request) {
  try {
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Chave GEMINI_API_KEY não configurada no servidor." },
        { status: 500 },
      );
    }

    const body = await req.json();
    const imageBase64: string = body.imageBase64 || "";
    const imageMimeType: string = body.imageMimeType || "image/jpeg";
    const audioBase64: string = body.audioBase64 || "";
    const audioMimeType: string = body.audioMimeType || "audio/webm";
    const voiceTranscript: string = body.transcript || "";
    const categoriesJson =
      typeof body.categories === "string"
        ? body.categories
        : JSON.stringify(body.categories || {});
    const roomsJson =
      typeof body.rooms === "string"
        ? body.rooms
        : JSON.stringify(body.rooms || []);

    const todayStr = new Date().toISOString().slice(0, 10);

    // Prompt enxuto e direto para minimizar tempo de processamento (TTFT)
    const prompt = `Extraia os dados deste comprovante/nota fiscal e/ou comando de voz.
Categorias (chave:nome): ${categoriesJson}
Salas: ${roomsJson}
Voz: "${voiceTranscript}"
Hoje: ${todayStr}

Retorne APENAS JSON:
{"title":"descrição curta da compra/conta","vendor":"nome da loja/fornecedor","amount":0.00,"expense_date":"YYYY-MM-DD","category_key":"chave existente ou outros","category_label":"nome se nova categoria","cost_type":"fixed ou variable","room_id":"id da sala se citada ou vazio","payment_status":"paid","notes":"resumo dos itens"}`;

    const parts: any[] = [{ text: prompt }];

    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, ""),
        },
      });
    }

    if (audioBase64) {
      parts.push({
        inlineData: {
          mimeType: audioMimeType,
          data: audioBase64.replace(/^data:audio\/[a-zA-Z0-9+.-]+;base64,/, ""),
        },
      });
    }

    const errorsLog: string[] = [];

    for (const modelName of FAST_VISION_MODELS) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 9500);

      try {
        // Desativa o thinkingBudget nos modelos 2.5 para resposta em ~1.3s
        const generationConfig: Record<string, any> = {
          temperature: 0.1,
          responseMimeType: "application/json",
        };
        if (modelName.startsWith("gemini-2.5")) {
          generationConfig.thinkingConfig = { thinkingBudget: 0 };
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ parts }],
              generationConfig,
            }),
            signal: controller.signal,
          },
        );

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errJson = await response.json().catch(() => null);
          errorsLog.push(
            `${modelName}: ${errJson?.error?.message || response.status}`,
          );
          continue;
        }

        const result = await response.json();
        const candidateParts = result?.candidates?.[0]?.content?.parts || [];
        const parsed = extractJsonFromParts(candidateParts);

        if (!parsed) {
          errorsLog.push(`${modelName}: JSON vazio`);
          continue;
        }

        const normalizedAmount = parseNumericAmount(
          parsed.amount ?? parsed.amount_brl ?? parsed.valor ?? parsed.total,
        );

        return NextResponse.json({
          success: true,
          modelUsed: modelName,
          data: {
            title: parsed.title || parsed.vendor || "Despesa Operacional",
            vendor: parsed.vendor || "",
            amount: normalizedAmount,
            expense_date:
              typeof parsed.expense_date === "string" &&
              /^\d{4}-\d{2}-\d{2}$/.test(parsed.expense_date)
                ? parsed.expense_date
                : todayStr,
            category_key: parsed.category_key || "outros",
            category_label: parsed.category_label || "",
            cost_type: parsed.cost_type === "fixed" ? "fixed" : "variable",
            room_id: parsed.room_id || "",
            payment_status:
              parsed.payment_status === "pending" ? "pending" : "paid",
            notes: parsed.notes || "",
          },
        });
      } catch (err: any) {
        clearTimeout(timeoutId);
        errorsLog.push(`${modelName}: ${err.message || "Timeout"}`);
      }
    }

    return NextResponse.json(
      {
        error: `Não foi possível ler automaticamente (${errorsLog[0] || "Tente novamente"}).`,
      },
      { status: 502 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro interno ao processar comprovante." },
      { status: 500 },
    );
  }
}