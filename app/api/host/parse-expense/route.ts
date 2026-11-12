// app/api/host/parse-expense/route.ts
import { NextResponse } from "next/server";

const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.0-flash",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
];

function parseNumericAmount(raw: any): number {
  if (typeof raw === "number" && !isNaN(raw)) return raw;
  if (!raw) return 0;
  const str = String(raw).trim();
  // Remove "R$", espaços e letras
  const clean = str.replace(/[^\d.,-]/g, "");
  if (!clean) return 0;

  // Se tiver vírgula como separador decimal brasileiro (ex: 1.250,90 ou 45,90)
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

export async function POST(req: Request) {
  try {
    const apiKey =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Chave GEMINI_API_KEY não encontrada nas variáveis de ambiente (.env).",
        },
        { status: 500 },
      );
    }

    let imageBase64 = "";
    let imageMimeType = "image/jpeg";
    let audioBase64 = "";
    let audioMimeType = "audio/webm";
    let voiceTranscript = "";
    let categoriesJson = "{}";
    let roomsJson = "[]";

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      const body = await req.json();
      imageBase64 = body.imageBase64 || "";
      imageMimeType = body.imageMimeType || "image/jpeg";
      audioBase64 = body.audioBase64 || "";
      audioMimeType = body.audioMimeType || "audio/webm";
      voiceTranscript = body.transcript || "";
      categoriesJson =
        typeof body.categories === "string"
          ? body.categories
          : JSON.stringify(body.categories || {});
      roomsJson =
        typeof body.rooms === "string"
          ? body.rooms
          : JSON.stringify(body.rooms || []);
    } else {
      const formData = await req.formData();
      const imageFile = formData.get("image") as File | null;
      const audioFile = formData.get("audio") as File | null;
      voiceTranscript = (formData.get("transcript") as string) || "";
      categoriesJson = (formData.get("categories") as string) || "{}";
      roomsJson = (formData.get("rooms") as string) || "[]";

      if (imageFile && imageFile.size > 0) {
        const arrayBuffer = await imageFile.arrayBuffer();
        imageBase64 = Buffer.from(arrayBuffer).toString("base64");
        imageMimeType = imageFile.type || "image/jpeg";
      }

      if (audioFile && audioFile.size > 0) {
        const audioBuffer = await audioFile.arrayBuffer();
        audioBase64 = Buffer.from(audioBuffer).toString("base64");
        audioMimeType = audioFile.type || "audio/webm";
      }
    }

    const todayStr = new Date().toISOString().slice(0, 10);

    const prompt = `
Você é um leitor especialista de Notas Fiscais, Cupons Fiscais (NFC-e / SAT), recibos e boletos brasileiros para clínicas de saúde.
Examine atentamente a imagem anexada e/ou o comando de voz.

Instruções de leitura da Nota Fiscal / Cupom:
1. Localize o VALOR TOTAL PAGO na nota (procure por "VALOR A PAGAR", "VALOR TOTAL R$", "TOTAL", " Cartão de Crédito/Débito/PIX"). Retorne como número decimal em "amount" (ex: 89.90).
2. Localize o NOME DO ESTABELECIMENTO / FORNECEDOR no cabeçalho da nota e coloque em "vendor".
3. Crie um "title" claro e descritivo do que foi comprado ou pago (ex: "Compra de Insumos - [Nome da Loja]" ou os principais itens lidos na nota).
4. Localize a DATA DE EMISSÃO na nota e converta para "YYYY-MM-DD". Se não estiver legível na foto, use "${todayStr}".
5. Escolha a categoria mais adequada dentre estas chaves: ${categoriesJson}. Se o comando de voz pedir uma nova categoria, coloque o nome em "category_label".
6. Salas disponíveis da clínica: ${roomsJson}.
7. Comando de voz do usuário (se houver): "${voiceTranscript}".

Retorne EXCLUSIVAMENTE um objeto JSON válido (sem markdown, sem explicações) com esta estrutura:
{
  "title": "Descrição clara da despesa",
  "vendor": "Nome do Fornecedor / Loja",
  "amount": 0.00,
  "expense_date": "${todayStr}",
  "category_key": "outros",
  "category_label": "",
  "cost_type": "variable",
  "room_id": "",
  "payment_status": "paid",
  "notes": "Itens identificados ou CNPJ"
}
`.trim();

    const parts: any[] = [{ text: prompt }];

    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(
        /^data:image\/[a-zA-Z0-9+.-]+;base64,/,
        "",
      );
      parts.push({
        inlineData: {
          mimeType: imageMimeType,
          data: cleanBase64,
        },
      });
    }

    if (audioBase64) {
      const cleanAudio = audioBase64.replace(
        /^data:audio\/[a-zA-Z0-9+.-]+;base64,/,
        "",
      );
      parts.push({
        inlineData: {
          mimeType: audioMimeType,
          data: cleanAudio,
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
          const errText = await response.text();
          lastError = `[${modelName}]: ${errText}`;
          continue;
        }

        const result = await response.json();
        const rawText =
          result?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!rawText) {
          lastError = `Resposta vazia do modelo ${modelName}`;
          continue;
        }

        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : rawText;
        const parsed = JSON.parse(jsonString);

        const normalizedAmount = parseNumericAmount(
          parsed.amount ?? parsed.amount_brl ?? parsed.valor ?? parsed.total,
        );

        return NextResponse.json({
          success: true,
          modelUsed: modelName,
          data: {
            title: parsed.title || parsed.vendor || "Despesa de Cupom Fiscal",
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
        lastError = err.message || "Erro ao processar modelo";
      }
    }

    return NextResponse.json(
      { error: `Não foi possível ler a nota: ${lastError}` },
      { status: 502 },
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro interno ao analisar nota fiscal." },
      { status: 500 },
    );
  }
}