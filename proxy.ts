import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'

// ==========================================
// CORREÇÃO SÊNIOR: Adicionado o 'default'
// Isso diz à Vercel que esta é a função principal e obrigatória do arquivo
// ==========================================
export default async function proxy(request: NextRequest) {
  return await updateSession(request)
}

// Configuração das rotas que passam pelo proxy
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}