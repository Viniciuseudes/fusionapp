// app/cookies/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Cookie, Shield, Settings, Building2 } from "lucide-react";

export const metadata: Metadata = {
  title: "Política de Cookies e Armazenamento Local | Fusion Clinic",
  description:
    "Saiba como a plataforma Fusion Clinic utiliza cookies HTTP, localStorage e sessionStorage para autenticação segura, reservas e análise de desempenho.",
};

export default function PoliticaDeCookiesPage() {
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
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors"
            >
              Privacidade
            </Link>
            <Link
              href="/cookies"
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#BF4B24] text-white shadow-2xs"
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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-200/70 text-[#BF4B24] text-xs font-extrabold uppercase tracking-wider mb-4">
              <Cookie className="w-3.5 h-3.5" />
              Transparência Técnica
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">
              Política de Cookies e Tecnologias de Armazenamento Local
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-3">
              Última atualização: 05 de novembro de 2026 • Fusion Clinic
              Soluções em Saúde Ltda (CNPJ: 49.351.127/0001-44)
            </p>
          </div>

          <div className="space-y-8 text-sm leading-relaxed text-slate-700">
            <section className="space-y-3">
              <p>
                Esta Política de Cookies explica o que são cookies e tecnologias
                similares de armazenamento no navegador (
                <code className="text-xs bg-stone-100 px-1.5 py-0.5 rounded font-mono">
                  localStorage
                </code>{" "}
                e{" "}
                <code className="text-xs bg-stone-100 px-1.5 py-0.5 rounded font-mono">
                  sessionStorage
                </code>
                ), como a <strong>FUSION TECNOLOGIA INOVA SIMPLES (I.S)</strong>{" "}
                os utiliza na plataforma{" "}
                <code className="text-xs bg-stone-100 px-1.5 py-0.5 rounded font-mono">
                  https://fusionapp.com.br
                </code>{" "}
                e como você pode gerenciá-los.
              </p>
            </section>

            {/* SEÇÃO 1 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                1. O QUE SÃO COOKIES E ARMAZENAMENTO LOCAL (WEB STORAGE)?
              </h2>
              <p>
                <strong>Cookies:</strong> São pequenos arquivos de texto salvos
                no seu navegador (computador ou smartphone) quando você acessa a
                Plataforma. Eles permitem que o sistema reconheça seu
                dispositivo e mantenha sua sessão autenticada com segurança.
              </p>
              <p>
                <strong>LocalStorage e SessionStorage:</strong> São recursos
                modernos dos navegadores web que armazenam estados temporários
                no seu aparelho (como o plano do <em>Fusion Pass+</em> ou o
                horário da sala que você selecionou antes de fazer login).
              </p>
            </section>

            {/* SEÇÃO 2 - TABELAS DE INVENTÁRIO */}
            <section className="space-y-4 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                2. INVENTÁRIO DE COOKIES E CHAVES UTILIZADAS NA PLATAFORMA
              </h2>

              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#BF4B24] pt-2">
                2.1. Cookies Estritamente Necessários (Autenticação e Segurança)
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-stone-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-100 text-slate-800 font-bold border-b border-stone-200">
                    <tr>
                      <th className="p-3.5">Cookie / Chave</th>
                      <th className="p-3.5">Origem</th>
                      <th className="p-3.5">Duração</th>
                      <th className="p-3.5">Finalidade Técnica</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 bg-white">
                    <tr>
                      <td className="p-3.5 font-mono font-bold text-slate-800">
                        sb-*-auth-token
                      </td>
                      <td className="p-3.5 text-slate-600">Supabase Auth</td>
                      <td className="p-3.5 text-slate-600">Sessão Renovável</td>
                      <td className="p-3.5 text-slate-600">
                        Mantém o token criptografado (JWT) da sessão do usuário
                        autenticado (via senha ou Google OAuth) para permitir
                        reservas e check-in na porta.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-mono font-bold text-slate-800">
                        sb-*-auth-token-code-verifier
                      </td>
                      <td className="p-3.5 text-slate-600">Supabase Auth</td>
                      <td className="p-3.5 text-slate-600">
                        Temporário (Login)
                      </td>
                      <td className="p-3.5 text-slate-600">
                        Validação criptográfica de segurança (PKCE) durante o
                        redirecionamento do Login com o Google (OAuth 2.0).
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#BF4B24] pt-4">
                2.2. Chaves Funcionais de Experiência de Reserva
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-stone-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-100 text-slate-800 font-bold border-b border-stone-200">
                    <tr>
                      <th className="p-3.5">Chave</th>
                      <th className="p-3.5">Tipo</th>
                      <th className="p-3.5">Finalidade Técnica</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 bg-white">
                    <tr>
                      <td className="p-3.5 font-mono font-bold text-slate-800">
                        fusion_preselect_pass
                      </td>
                      <td className="p-3.5 text-slate-600">sessionStorage</td>
                      <td className="p-3.5 text-slate-600">
                        Memoriza a categoria (Basic, VIP, Premium) e o pacote de
                        horas simulado na página do consultório para abrir o
                        checkout pré-selecionado.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-mono font-bold text-slate-800">
                        fusion_promo_pass_seen_*
                      </td>
                      <td className="p-3.5 text-slate-600">sessionStorage</td>
                      <td className="p-3.5 text-slate-600">
                        Evita que avisos promocionais se repitam durante a mesma
                        sessão ou durante a leitura da Tag NFC na porta da sala.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <h3 className="text-xs font-extrabold uppercase tracking-wider text-[#BF4B24] pt-4">
                2.3. Cookies Analíticos, de Performance e Usabilidade
              </h3>
              <div className="overflow-x-auto rounded-2xl border border-stone-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-stone-100 text-slate-800 font-bold border-b border-stone-200">
                    <tr>
                      <th className="p-3.5">Cookie</th>
                      <th className="p-3.5">Provedor</th>
                      <th className="p-3.5">Finalidade Técnica</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200 bg-white">
                    <tr>
                      <td className="p-3.5 font-mono font-bold text-slate-800">
                        _ga, _ga_*
                      </td>
                      <td className="p-3.5 text-slate-600">
                        Google Analytics / GTM
                      </td>
                      <td className="p-3.5 text-slate-600">
                        Estatísticas agregadas de visitas às salas e desempenho
                        de páginas.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-mono font-bold text-slate-800">
                        _clck, _clsk
                      </td>
                      <td className="p-3.5 text-slate-600">
                        Microsoft Clarity
                      </td>
                      <td className="p-3.5 text-slate-600">
                        Análise de usabilidade e mapas de calor com mascaramento
                        de dados sensíveis para melhoria contínua da interface.
                      </td>
                    </tr>
                    <tr>
                      <td className="p-3.5 font-mono font-bold text-slate-800">
                        Vercel Web Analytics
                      </td>
                      <td className="p-3.5 text-slate-600">Vercel Inc.</td>
                      <td className="p-3.5 text-slate-600">
                        Monitoramento anônimo de velocidade de carregamento e
                        estabilidade das rotas.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* SEÇÃO 3 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                3. COMO GERENCIAR OU DESATIVAR COOKIES NO SEU NAVEGADOR
              </h2>
              <p>
                Você pode configurar seu navegador (Chrome, Safari, Firefox ou
                Edge) para bloquear cookies de terceiros ou limpar os dados de
                navegação a qualquer momento. Contudo, a desativação dos{" "}
                <strong>Cookies Estritamente Necessários</strong> (
                <code>sb-*-auth-token</code>) impedirá o funcionamento do login,
                da carteira de créditos e do Check-in/Check-out nas salas.
              </p>
            </section>
          </div>

          {/* RODAPÉ INTERNO DO CARD */}
          <div className="mt-12 pt-8 border-t border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-[#BF4B24] shrink-0" />
              <div>
                <strong className="text-slate-800 block">
                  FUSION TECNOLOGIA INOVA SIMPLES (I.S)
                </strong>
                <span>CNPJ: 49.351.127/0001-44 • Natal/RN</span>
              </div>
            </div>
            <div>
              Contato:{" "}
              <a
                href="mailto:equipe@fusionclinic.com.br"
                className="font-bold text-[#BF4B24] hover:underline"
              >
                equipe@fusionclinic.com.br
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
