import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
  Tailwind,
} from "@react-email/components";
import * as React from "react";

interface WelcomeEmailProps {
  userFirstName: string;
}

export default function WelcomeEmail({
  userFirstName = "Doutor(a)",
}: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Bem-vindo(a) à Fusion Clinic! Seu painel está pronto.</Preview>
      <Tailwind>
        <Body className="bg-[#F3EEEB] font-sans m-0 p-0">
          <Container className="mx-auto py-10 px-4">
            <Section className="bg-white rounded-3xl border border-[#E0D7D1] p-8 shadow-sm text-center max-w-[500px] mx-auto">
              <div className="w-16 h-16 bg-[#BF4B24] rounded-2xl mx-auto flex items-center justify-center mb-6 shadow-md">
                <span className="text-white text-3xl font-black">F</span>
              </div>

              <Heading className="text-2xl font-black text-[#4F4F4F] mb-4 tracking-tight">
                Bem-vindo(a) à Fusion Clinic!
              </Heading>

              <Text className="text-[#4F4F4F]/80 text-base font-medium leading-relaxed mb-6">
                Olá, <strong>{userFirstName}</strong>. O seu cadastro foi
                concluído com sucesso. A partir de agora, você tem acesso
                imediato à nossa rede de consultórios inteligentes.
              </Text>

              <Section className="bg-[#F9EBE6] rounded-xl p-5 mb-8 text-left border border-[#BF4B24]/20">
                <Text className="text-[#BF4B24] font-black text-sm uppercase tracking-widest mb-2 mt-0">
                  Próximos Passos:
                </Text>
                <Text className="text-[#4F4F4F] text-sm font-medium my-1">
                  1. Acesse seu painel pelo celular ou computador.
                </Text>
                <Text className="text-[#4F4F4F] text-sm font-medium my-1">
                  2. Navegue pelos espaços disponíveis.
                </Text>
                <Text className="text-[#4F4F4F] text-sm font-medium my-1">
                  3. Reserve por hora, turno ou mensalidade.
                </Text>
              </Section>

              <Button
                href="https://fusionapp.com.br/login"
                className="bg-[#BF4B24] text-white font-black py-4 px-8 rounded-xl shadow-lg block text-center"
              >
                Acessar meu Painel
              </Button>

              <Text className="text-[#8A8A8A] text-xs font-medium mt-10 mb-0">
                © {new Date().getFullYear()} Fusion Clinic. Todos os direitos
                reservados.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
