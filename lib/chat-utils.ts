// ARQUIVO: lib/chat-utils.ts

export function applyDLP(text: string): string {
  if (!text) return "";

  // 1. Bloqueia E-mails
  const emailRegex = /[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g;
  let masked = text.replace(emailRegex, "[E-MAIL PROTEGIDO]");

  // 2. Bloqueia Telefones e WhatsApp (Formatos BR)
  // Pega (84) 99999-9999, 84999999999, +55 84 9999-9999
  const phoneRegex = /(\+?55)?\s?(\(?\d{2}\)?)\s?\d{4,5}-?\d{4}/g;
  masked = masked.replace(phoneRegex, "[TELEFONE PROTEGIDO]");

  // 3. Bloqueia Links externos (opcional, mas recomendado)
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  masked = masked.replace(urlRegex, "[LINK BLOQUEADO]");

  return masked;
}

// Função para mascarar nomes em negociações
export function maskIdentity(role: string, realName: string, id: string) {
  if (role === "admin") return realName; // Admin vê tudo
  return `Usuário #${id.substring(0, 4).toUpperCase()}`;
}