// app/privacidade/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  Lock,
  ShieldCheck,
  Database,
  Eye,
  UserCheck,
  Building2,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Política de Privacidade e Proteção de Dados (LGPD) | Fusion Clinic",
  description:
    "Política de Privacidade, Proteção de Dados Pessoais (LGPD) e Declaração de Uso Limitado das APIs do Google OAuth da plataforma Fusion Clinic.",
};

export default function PoliticaDePrivacidadePage() {
  return (
    <div className="min-h-screen bg-[#FAF7F4] text-slate-800 flex flex-col font-sans">
      {/* BARRA SUPERIOR FIXA */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-4xl mx-auto px-5 h-16 flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-700 hover:text-[#BF4B24] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar para a Fusion Clinic
          </Link>

          <nav className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200">
            <Link
              href="/termos"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Termos de Uso
            </Link>
            <Link
              href="/privacidade"
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#BF4B24] text-white shadow-2xs"
            >
              Privacidade
            </Link>
            <Link
              href="/cookies"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Cookies
            </Link>
          </nav>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-5 py-10 md:py-14">
        <div className="bg-white rounded-3xl border border-stone-200/90 shadow-xs p-6 sm:p-10 md:p-12">
          {/* CABEÇALHO DO DOCUMENTO */}
          <div className="border-b border-stone-200 pb-8 mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/70 text-emerald-800 text-xs font-extrabold uppercase tracking-wider mb-4">
              <Lock className="w-3.5 h-3.5 text-emerald-600" />
              Conformidade LGPD & Google OAuth Verified
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">
              Política de Privacidade e Proteção de Dados Pessoais (LGPD)
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-3">
              Última atualização: 05 de novembro de 2026 • Controladora: Fusion
              Clinic Soluções em Saúde Ltda (CNPJ: 49.351.127/0001-44)
            </p>
          </div>

          <div className="space-y-8 text-sm leading-relaxed text-slate-700">
            <section className="space-y-3">
              <p>
                A <strong>FUSION CLINIC SOLUÇÕES EM SAÚDE LTDA</strong>, pessoa
                jurídica de direito privado, inscrita no CNPJ sob o nº{" "}
                <strong>49.351.127/0001-44</strong>, com sede em Natal/RN
                (“Fusion Clinic”, “Controladora” ou “Nós”), leva a sério a sua
                privacidade e a segurança dos seus dados pessoais.
              </p>
              <p>
                Esta Política de Privacidade descreve de forma transparente como
                coletamos, utilizamos, armazenamos, compartilhamos e protegemos
                os dados pessoais dos{" "}
                <strong>Especialistas (Profissionais de Saúde)</strong>,{" "}
                <strong>Anfitriões (Clínicas Parceiras)</strong> e{" "}
                <strong>Visitantes</strong> da nossa plataforma (
                <code className="text-xs bg-stone-100 px-1.5 py-0.5 rounded font-mono">
                  https://fusionapp.com.br
                </code>
                ), em estrita conformidade com a{" "}
                <strong>
                  Lei Geral de Proteção de Dados Pessoais (LGPD — Lei nº
                  13.709/2018)
                </strong>
                , o{" "}
                <strong>Marco Civil da Internet (Lei nº 12.965/2014)</strong> e
                as diretrizes internacionais da{" "}
                <strong>Google API Services User Data Policy</strong>.
              </p>
            </section>

            {/* SEÇÃO 1 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                1. PAPÉIS NO TRATAMENTO DE DADOS (CONTROLADOR VS. DADOS DE
                PACIENTES)
              </h2>
              <p>
                <strong>1.1. Dados de Profissionais e Anfitriões:</strong> Em
                relação aos dados pessoais cadastrais, financeiros e
                operacionais dos Especialistas e Anfitriões cadastrados na
                Plataforma, a{" "}
                <strong>Fusion Clinic atua como Controladora de Dados</strong>{" "}
                (Art. 5º, VI da LGPD).
              </p>
              <p>
                <strong>
                  1.2. Ausência de Coleta de Prontuários de Pacientes Finais:
                </strong>{" "}
                A Fusion Clinic{" "}
                <strong>
                  não coleta, não solicita e não armazena prontuários médicos,
                  anamneses, receitas ou dados pessoais sensíveis de saúde dos
                  pacientes finais
                </strong>{" "}
                atendidos pelos Especialistas nos consultórios. O Especialista é
                o único e exclusivo Controlador dos dados pessoais e clínicos de
                seus próprios pacientes, respondendo integralmente pelo sigilo
                profissional e pela conformidade com a LGPD em sua atividade
                clínica.
              </p>
            </section>

            {/* SEÇÃO 2 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                2. QUAIS DADOS PESSOAIS COLETAMOS E COMO COLETAMOS
              </h2>
              <ul className="list-disc pl-5 space-y-2.5">
                <li>
                  <strong>
                    2.1. Identificação Civil, Profissional e Contato:
                  </strong>{" "}
                  Nome completo, CPF, data de nascimento, gênero, fotografia de
                  perfil (avatar), especialidade clínica, sigla e número de
                  inscrição no Conselho Profissional (CRM, CRP, CRN, CRO,
                  CREFITO, etc.), endereço de e-mail, número de telefone
                  celular/WhatsApp e endereço completo com CEP.
                </li>
                <li>
                  <strong>
                    2.2. Dados Financeiros e de Pagamento (Tokenizados):
                  </strong>{" "}
                  Histórico de transações na Carteira Digital, assinaturas do
                  plano Fusion Pass+ e faturas geradas. Quando você paga com
                  cartão de crédito ou opta por salvá-lo para compras com 1
                  clique, os dados sensíveis (número completo e CVV) são
                  processados diretamente de forma criptografada pelo gateway{" "}
                  <strong>Asaas (PCI-DSS Compliant)</strong>. A Fusion Clinic
                  armazena apenas o token seguro (<code>cc_token</code>), a
                  bandeira (<code>cc_brand</code>) e os 4 últimos dígitos (
                  <code>cc_last4</code>).
                </li>
                <li>
                  <strong>
                    2.3. Dados Operacionais de Uso da Sala (NFC, QR Code, Câmera
                    e Localização):
                  </strong>{" "}
                  Data e hora exatas (<em>timestamps</em>) de entrada (
                  <code>checkin_time</code>) e saída (<code>checkout_time</code>
                  ) da sala reservada. A permissão de <strong>Câmera</strong> é
                  utilizada exclusivamente no instante da leitura do QR Code da
                  porta, sem gravação ou armazenamento de imagens. Coordenadas
                  pontuais de geolocalização e endereço IP são coletados para
                  auditoria antifraude e validação de presença física no
                  check-in/check-out.
                </li>
                <li>
                  <strong>2.4. Comunicações na Plataforma:</strong> Mensagens de
                  negociação de turnos/contratos enviadas no Chat Seguro,
                  avaliações de consultórios e buscas realizadas no Concierge
                  IA.
                </li>
              </ul>
            </section>

            {/* SEÇÃO 3 */}
            <section className="space-y-4 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                3. FINALIDADES E BASES LEGAIS DO TRATAMENTO (ART. 7º DA LGPD)
              </h2>
              <div className="overflow-x-auto rounded-2xl border border-stone-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-100 text-slate-800 font-bold border-b border-stone-200">
                    <tr>
                      <th className="p-3.5">Finalidade do Tratamento</th>
                      <th className="p-3.5">Dados Utilizados</th>
                      <th className="p-3.5">Base Legal (LGPD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 bg-white">
                    <tr>
                      <td className="p-3.5 font-medium text-slate-800">
                        Criação de conta, login e validação de registro
                        profissional.
                      </td>
                      <td className="p-3.5 text-slate-600">
                        Nome, e-mail, token OAuth, CPF, Conselho e nº do
                        Conselho.
                      </td>
                      <td className="p-3.5 font-semibold text-slate-800">
                        Execução de Contrato (Art. 7º, V) e Prevenção à Fraude
                        (Art. 11, II, ‘g’).
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-medium text-slate-800">
                        Processamento de reservas, PIX/Cartão, split financeiro
                        e Fusion Pass+.
                      </td>
                      <td className="p-3.5 text-slate-600">
                        Nome, CPF, e-mail, telefone, endereço/CEP, token do
                        cartão.
                      </td>
                      <td className="p-3.5 font-semibold text-slate-800">
                        Execução de Contrato (Art. 7º, V) e Obrigação Legal
                        (Art. 7º, II).
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-medium text-slate-800">
                        Controle de acesso físico às salas (Check-in/out NFC e
                        QR Code).
                      </td>
                      <td className="p-3.5 text-slate-600">
                        ID do usuário, timestamps de entrada/saída,
                        geolocalização.
                      </td>
                      <td className="p-3.5 font-semibold text-slate-800">
                        Execução de Contrato (Art. 7º, V) e Legítimo Interesse
                        (Art. 7º, IX).
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-medium text-slate-800">
                        Envio de e-mails transacionais (confirmação,
                        cancelamento e recibo de check-out).
                      </td>
                      <td className="p-3.5 text-slate-600">
                        Nome, e-mail, dados da reserva e valores pagos.
                      </td>
                      <td className="p-3.5 font-semibold text-slate-800">
                        Execução de Contrato (Art. 7º, V).
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-medium text-slate-800">
                        Guarda de registros de conexão e acesso à aplicação por
                        6 meses.
                      </td>
                      <td className="p-3.5 text-slate-600">
                        Endereço IP, user-agent, data e hora.
                      </td>
                      <td className="p-3.5 font-semibold text-slate-800">
                        Obrigação Legal — Art. 15 do Marco Civil da Internet
                        (Art. 7º, II).
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* SEÇÃO 4 - DESTAQUE GOOGLE OAUTH LIMITED USE */}
            <section className="p-6 rounded-2xl bg-[#FAF7F4] border-2 border-[#BF4B24]/30 space-y-3">
              <div className="flex items-center gap-2 text-[#BF4B24] font-extrabold text-xs uppercase tracking-wider">
                <CheckCircle2 className="w-4 h-4" />
                Declaração Oficial de Conformidade Google OAuth 2.0
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                4. USO DE DADOS DO GOOGLE OAUTH (CONFORMIDADE COM A{" "}
                <em>GOOGLE API SERVICES USER DATA POLICY</em>)
              </h2>
              <p>
                <strong>4.1. Dados Coletados via Login com o Google:</strong>{" "}
                Quando você opta por entrar na Plataforma utilizando o botão{" "}
                <em>“Continuar com o Google”</em> (Google OAuth 2.0), a Fusion
                Clinic solicita acesso apenas aos escopos básicos não sensíveis
                de autenticação (<code>openid</code>, <code>email</code>,{" "}
                <code>profile</code>), recebendo do Google exclusivamente: (i)
                seu <strong>Nome completo</strong>; (ii) seu{" "}
                <strong>Endereço de e-mail principal</strong>; (iii) a{" "}
                <strong>URL da sua foto de perfil</strong> pública do Google; e
                (iv) o <strong>Identificador único da sua conta Google</strong>{" "}
                para vínculo seguro de autenticação.
              </p>
              <p>
                <strong>4.2. Finalidade Estrita:</strong> Esses dados são
                utilizados única e exclusivamente para autenticar sua sessão com
                segurança na Fusion Clinic, preencher seu nome/avatar inicial no
                perfil e enviar os comprovantes transacionais das suas reservas.
              </p>
              <p>
                <strong>
                  4.3. Cláusula de Uso Limitado (
                  <em>Google Limited Use Disclosure</em>):
                </strong>{" "}
                O uso e a transferência pela Fusion Clinic, para qualquer outro
                aplicativo, de informações recebidas das APIs do Google aderirão
                estritamente à{" "}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold text-[#BF4B24] underline"
                >
                  Política de Dados do Usuário dos Serviços de API do Google
                  (Google API Services User Data Policy)
                </a>
                , incluindo os requisitos de{" "}
                <strong>
                  Uso Limitado (<em>Limited Use requirements</em>)
                </strong>
                . Especificamente: (a) nós <strong>nunca</strong> vendemos,
                alugamos ou comercializamos dados obtidos das APIs do Google a
                terceiros; (b) nós <strong>nunca</strong> utilizamos dados das
                APIs do Google para publicidade personalizada ou segmentação de
                anúncios; e (c) nós <strong>não</strong> permitimos que humanos
                leiam seus dados do Google, exceto com seu consentimento
                afirmativo para suporte técnico, por motivos de segurança ou
                para cumprimento de obrigação legal.
              </p>
            </section>

            {/* SEÇÃO 5 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                5. COMPARTILHAMENTO DE DADOS E OPERADORES TECNOLÓGICOS
              </h2>
              <p>
                A Fusion Clinic <strong>não vende dados pessoais</strong>.
                Compartilhamos apenas os dados estritamente necessários com:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Clínicas Anfitriãs e Coanfitriões:</strong> Nome,
                  especialidade, registro profissional e horário agendado para
                  identificação na portaria/recepção e liberação do consultório.
                </li>
                <li>
                  <strong>
                    Asaas Gestão Financeira Instituição de Pagamento S.A.:
                  </strong>{" "}
                  Processamento de pagamentos PIX, Cartão de Crédito,
                  assinaturas e split financeiro.
                </li>
                <li>
                  <strong>Supabase Inc. & Vercel Inc.:</strong> Infraestrutura
                  de banco de dados criptografado, autenticação OAuth/JWT com{" "}
                  <em>Row-Level Security (RLS)</em> e hospedagem em nuvem.
                </li>
                <li>
                  <strong>Resend Inc.:</strong> Disparo de e-mails transacionais
                  de confirmação de reserva, cancelamento e recibo de check-out.
                </li>
                <li>
                  <strong>Google LLC & Microsoft Clarity:</strong> Autenticação
                  OAuth, processamento de linguagem natural no Concierge IA (sem
                  envio de CPF ou dados financeiros) e métricas agregadas de
                  usabilidade.
                </li>
              </ul>
            </section>

            {/* SEÇÃO 6 E 7 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                6. SEGURANÇA DA INFORMAÇÃO, TRANSFERÊNCIA INTERNACIONAL E
                RETENÇÃO
              </h2>
              <p>
                <strong>6.1. Segurança e Transferência Internacional:</strong>{" "}
                Todos os dados trafegam sob criptografia TLS 1.3 e são
                armazenados com criptografia AES-256 em provedores de nuvem
                certificados (SOC 2 Type II / ISO 27001), observando o Art. 33
                da LGPD.
              </p>
              <p>
                <strong>6.2. Prazos de Retenção:</strong> Os dados cadastrais
                são mantidos enquanto a conta estiver ativa. Os registros de
                conexão (logs de IP) são armazenados por no mínimo{" "}
                <strong>6 (seis) meses</strong> (Art. 15 do Marco Civil da
                Internet), e os registros de reservas, check-in/check-out e
                faturamento são mantidos por <strong>5 (cinco) anos</strong>{" "}
                para cumprimento de obrigações fiscais, contábeis e exercício
                regular de direitos (Art. 16, I e II da LGPD).
              </p>
            </section>

            {/* SEÇÃO 8 E 9 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                7. DIREITOS DO TITULAR (ART. 18 DA LGPD) E CONTATO DO
                ENCARREGADO (DPO)
              </h2>
              <p>
                Você pode, a qualquer momento, acessar, corrigir ou atualizar
                seus dados diretamente na aba <strong>Meu Perfil</strong> do
                aplicativo, bem como solicitar a confirmação de tratamento,
                portabilidade ou exclusão da sua conta (ressalvada a guarda
                legal de registros fiscais e contratuais).
              </p>
              <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200 text-xs space-y-1">
                <p className="font-bold text-slate-900">
                  Canal do Encarregado pelo Tratamento de Dados Pessoais (DPO):
                </p>
                <p>
                  <strong>Controladora:</strong> Fusion Clinic Soluções em Saúde
                  Ltda (CNPJ: 49.351.127/0001-44)
                </p>
                <p>
                  <strong>E-mail Oficial de Privacidade e LGPD:</strong>{" "}
                  <a
                    href="mailto:tecnologia@fusionapp.com.br"
                    className="font-bold text-[#BF4B24] hover:underline"
                  >
                    tecnologia@fusionapp.com.br
                  </a>{" "}
                  /{" "}
                  <a
                    href="mailto:equipe@fusionclinic.com.br"
                    className="font-bold text-[#BF4B24] hover:underline"
                  >
                    equipe@fusionclinic.com.br
                  </a>
                </p>
                <p>
                  <strong>Endereço Sede:</strong> Natal, Estado do Rio Grande do
                  Norte — Brasil
                </p>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
