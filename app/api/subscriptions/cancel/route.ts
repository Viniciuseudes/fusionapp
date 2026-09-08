import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const ASAAS_API_URL = process.env.ASAAS_API_URL;
    const ASAAS_API_KEY = process.env.ASAAS_API_KEY;
    
    const { subscriptionId } = await req.json();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

    // Cancela no Asaas
    const asaasResponse = await fetch(`${ASAAS_API_URL}/subscriptions/${subscriptionId}`, {
      method: "DELETE",
      headers: { "access_token": ASAAS_API_KEY! },
    });

    if (!asaasResponse.ok) {
       const err = await asaasResponse.json();
       throw new Error(err.errors?.[0]?.description || "Erro ao cancelar no Asaas.");
    }

    // Cancela no Supabase
    await supabase.from("subscriptions").update({ status: 'CANCELLED' }).eq("asaas_subscription_id", subscriptionId);

    return NextResponse.json({ success: true, message: "Assinatura cancelada com sucesso." });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}