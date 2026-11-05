// app/termos/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ShieldCheck,
  Scale,
  FileText,
  Lock,
  Cookie,
  Building2,
  Clock,
  CreditCard,
  AlertTriangle,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Termos e Condições de Uso | Fusion Clinic",
  description:
    "Termos e Condições Gerais de Uso, Locação Temporária de Consultórios e Intermediação Tecnológica da plataforma Fusion Clinic.",
};

export default function TermosDeUsoPage() {
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
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#BF4B24] text-white shadow-2xs"
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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-50 border border-orange-200/70 text-[#BF4B24] text-xs font-extrabold uppercase tracking-wider mb-4">
              <Scale className="w-3.5 h-3.5" />
              Instrumento Contratual Vinculante
            </div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">
              Termos e Condições Gerais de Uso, Locação Temporária de Espaços e
              Intermediação Tecnológica
            </h1>
            <p className="text-sm text-slate-500 font-medium mt-3">
              Última atualização: 05 de novembro de 2026 • Vigência imediata
            </p>
          </div>

          {/* RESUMO EXECUTIVO DAS REGRAS DE OURO */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-10">
            <div className="p-4 rounded-2xl bg-[#FAF7F4] border border-stone-200/80">
              <Clock className="w-5 h-5 text-[#BF4B24] mb-2" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                Hora Clínica de 50 min
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Cada bloco de 1 hora possui 50 minutos de consulta e 10 minutos
                finais para transição e preparação da sala.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF7F4] border border-stone-200/80">
              <CreditCard className="w-5 h-5 text-[#BF4B24] mb-2" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                Cancelamento em 24h
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Estorno integral em créditos para cancelamentos feitos com no
                mínimo 24 horas de antecedência do início.
              </p>
            </div>
            <div className="p-4 rounded-2xl bg-[#FAF7F4] border border-stone-200/80">
              <ShieldCheck className="w-5 h-5 text-[#BF4B24] mb-2" />
              <h2 className="text-xs font-extrabold uppercase tracking-wider text-slate-900">
                Check-in & Check-out
              </h2>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Registro obrigatório na Tag NFC/QR Code da porta ao entrar e ao
                sair, desligando luzes e ar-condicionado.
              </p>
            </div>
          </div>

          {/* CORPO JURÍDICO */}
          <div className="space-y-8 text-sm leading-relaxed text-slate-700">
            <section className="space-y-3">
              <p>
                Estes Termos e Condições Gerais de Uso (“Termos”) regulam o
                acesso e a utilização da plataforma digital{" "}
                <strong>Fusion Clinic</strong> (acessível em{" "}
                <code className="text-xs bg-stone-100 px-1.5 py-0.5 rounded font-mono">
                  https://fusionapp.com.br
                </code>{" "}
                e subdomínios), de titularidade e operação de{" "}
                <strong>FUSION TECNOLOGIA INOVA SIMPLES (I.S)</strong>, pessoa
                jurídica de direito privado, inscrita no CNPJ sob o nº{" "}
                <strong>49.351.127/0001-44</strong>, com sede em Natal, Estado
                do Rio Grande do Norte (“Fusion Clinic” ou “Plataforma”).
              </p>
              <p>
                Ao criar uma conta, utilizar o login social (Google OAuth),
                adquirir pacotes de horas, cadastrar um espaço ou efetuar
                qualquer reserva, o Usuário declara ter lido, compreendido e
                aceitado integralmente e sem reservas todas as cláusulas destes
                Termos, que possuem força de contrato juridicamente vinculante
                nos termos dos artigos 421 e seguintes do Código Civil
                Brasileiro (Lei nº 10.406/2002) e do Marco Civil da Internet
                (Lei nº 12.965/2014).
              </p>
            </section>

            {/* CLÁUSULA 1 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 1ª — DAS DEFINIÇÕES
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>1.1. Plataforma Fusion Clinic:</strong> Ecossistema
                  tecnológico SaaS (<em>Software as a Service</em>) e{" "}
                  <em>Marketplace</em> que realiza a gestão inteligente de
                  agendas, controle de acesso físico e intermediação de cessão
                  temporária onerosa de consultórios e salas equipadas para
                  atendimento nas áreas de saúde, estética e bem-estar.
                </li>
                <li>
                  <strong>
                    1.2. Especialista (Usuário Profissional / Locatário
                    Temporário):
                  </strong>{" "}
                  Profissional liberal devidamente habilitado em seu respectivo
                  conselho de classe (médico, psicólogo, nutricionista,
                  dentista, fisioterapeuta, biomédico, fonoaudiólogo, terapeuta,
                  entre outros) que utiliza a Plataforma para reservar e
                  utilizar espaços por hora avulsa, pacotes de créditos, turnos
                  ou contratos fixos.
                </li>
                <li>
                  <strong>1.3. Anfitrião (Clínica Parceira / Host):</strong>{" "}
                  Pessoa física ou jurídica proprietária ou legítima possuidora
                  do imóvel/clínica que disponibiliza seus consultórios na
                  Plataforma para cessão temporária de uso aos Especialistas.
                </li>
                <li>
                  <strong>1.4. Coanfitrião (Co-Host):</strong> Especialista
                  detentor de um Contrato de Locação Mensal Exclusiva com
                  permissão expressa de sublocação (<em>allow_sublease</em>),
                  que disponibiliza seus horários ociosos na Plataforma para
                  outros Especialistas mediante divisão percentual de receitas (
                  <em>Split</em>).
                </li>
                <li>
                  <strong>1.5. Hora Clínica (Bloco de 50 Minutos):</strong>{" "}
                  Unidade padrão de locação por hora na Plataforma, composta por{" "}
                  <strong>50 (cinquenta) minutos de uso efetivo</strong> para
                  atendimento e{" "}
                  <strong>10 (dez) minutos finais obrigatórios</strong>{" "}
                  destinados à desocupação, saída do paciente, ventilação e
                  preparação da sala para o próximo horário.
                </li>
                <li>
                  <strong>1.6. Fusion Pass+ (Assinatura de Créditos):</strong>{" "}
                  Plano recorrente mensal que concede ao Especialista lotes de
                  horas/créditos com tarifa reduzida, categorizados por nível de
                  sala (<em>Basic/Start</em>, <em>VIP</em> e{" "}
                  <em>Premium/Master</em>), com validade estrita de 30 (trinta)
                  dias corridos.
                </li>
                <li>
                  <strong>1.7. Carteira Digital (Wallet):</strong> Sistema
                  interno de registro contábil de créditos de horas disponíveis,
                  utilizados, transferidos ou expirados do Especialista.
                </li>
              </ul>
            </section>

            {/* CLÁUSULA 2 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 2ª — DO OBJETO E DA NATUREZA JURÍDICA DA RELAÇÃO
              </h2>
              <p>
                <strong>
                  2.1. Intermediação Tecnológica e Cessão de Espaço:
                </strong>{" "}
                O objeto destes Termos é o licenciamento de uso do software da
                Plataforma e a intermediação de locação/cessão temporária de
                espaço físico não residencial (consultórios equipados) sem
                prestação de serviços médicos pela Plataforma.
              </p>
              <p>
                <strong>
                  2.2. Inexistência de Vínculo Empregatício ou Societário:
                </strong>{" "}
                A relação jurídica estabelecida entre a Fusion Clinic, os
                Anfitriões, os Coanfitriões e os Especialistas é estritamente
                cível e comercial. Não há, em nenhuma hipótese, vínculo
                empregatício (CLT), subordinação hierárquica, habitualidade
                obrigatória, sociedade, associação ou <em>joint venture</em>{" "}
                entre as partes.
              </p>
              <p>
                <strong>2.3. Ausência de Relação com Pacientes Finais:</strong>{" "}
                A Fusion Clinic{" "}
                <strong>não é uma clínica médica empregadora</strong>, não
                agenda consultas para pacientes, não interfere na conduta
                clínica, não define valores de honorários cobrados pelo
                Especialista de seus pacientes e não mantém qualquer relação
                contratual ou de consumo com os pacientes atendidos pelos
                Especialistas nos consultórios locados.
              </p>
              <p>
                <strong>
                  2.4. Inexistência de Direito de Ponto Comercial:
                </strong>{" "}
                A utilização de consultórios nas modalidades por Hora Avulsa,
                Pacote de Horas (Fusion Pass+) ou Turnos Fracionados constitui
                mera cessão temporária e compartilhada de uso de espaço (
                <em>coworking</em> de saúde), não configurando locação
                empresarial contínua para fins de proteção de fundo de comércio
                ou ação renovatória nos termos da Lei do Inquilinato (Lei nº
                8.245/1991).
              </p>
            </section>

            {/* CLÁUSULA 3 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 3ª — DO CADASTRO, ELEGIBILIDADE E HABILITAÇÃO
                PROFISSIONAL
              </h2>
              <p>
                <strong>3.1. Requisitos de Elegibilidade:</strong> O cadastro
                como Especialista é restrito a pessoas físicas maiores de 18
                (dezoito) anos, civilmente capazes, portadoras de CPF regular e
                devidamente inscritas e ativas em seu respectivo Conselho
                Profissional (CRM, CRP, CRN, CRO, CREFITO, CRBM, COREN, etc.),
                quando exigido por lei para o exercício de sua atividade.
              </p>
              <p>
                <strong>3.2. Obrigatoriedade de Perfil Completo:</strong> Para
                efetivar reservas e emitir credenciais de acesso às salas, o
                Usuário obriga-se a fornecer dados exatos, completos e
                atualizados, incluindo Nome Completo, CPF, Data de Nascimento,
                Telefone/WhatsApp, E-mail válido, Especialidade, Registro no
                Conselho de Classe e Endereço completo com CEP.
              </p>
              <p>
                <strong>3.3. Veracidade das Informações:</strong> O Usuário
                responde civil e criminalmente (Art. 299 do Código Penal —
                Falsidade Ideológica) pela veracidade dos dados inseridos. A
                Fusion Clinic reserva-se o direito de solicitar documentos
                comprobatórios, consultar cadastros públicos de conselhos de
                classe e suspender ou banir sumariamente contas com indícios de
                fraude, registro profissional cassado/suspenso ou inadimplência.
              </p>
              <p>
                <strong>3.4. Segurança e Intransferibilidade da Conta:</strong>{" "}
                O acesso à conta (via senha ou autenticação OAuth do Google) é
                pessoal e intransferível. É expressamente proibido que um
                Especialista empreste sua conta ou realize reservas para que
                terceiros não cadastrados atendam na sala em seu lugar, sob pena
                de multa contratual, bloqueio imediato e responsabilização
                solidária por quaisquer danos.
              </p>
            </section>

            {/* CLÁUSULA 4 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 4ª — DAS MODALIDADES DE CONTRATAÇÃO E REGRAS DA “HORA
                CLÍNICA”
              </h2>
              <p>
                <strong>4.1. Modalidades Disponíveis:</strong> A Plataforma
                disponibiliza 4 (quatro) modalidades de reserva, conforme a
                configuração de cada sala: (a) Locação por Hora Avulsa; (b)
                Assinatura Fusion Pass+ (Pacotes de Horas); (c) Locação por
                Turno Fixo; e (d) Contrato Fixo Mensal (Sala Exclusiva).
              </p>
              <p>
                <strong>
                  4.2. Regra Estrita da Hora Clínica de 50 Minutos:
                </strong>{" "}
                O Especialista declara ciência inequívoca de que{" "}
                <strong>
                  toda reserva por hora possui duração efetiva de 50 (cinquenta)
                  minutos
                </strong>{" "}
                (exemplo: reserva das 14h00 às 15h00 confere direito de uso da
                sala das <strong>14h00 às 14h50</strong>).
              </p>
              <p>
                <strong>Parágrafo Primeiro:</strong> Caso o Especialista reserve
                múltiplas horas consecutivas na mesma sala, os blocos
                intermediários se conectam, mas o último horário reservado
                encerrar-se-á obrigatoriamente no minuto 50 (exemplo: reserva de
                2 horas, das 14h00 às 16h00, inicia-se às 14h00 e encerra-se
                improrrogavelmente às <strong>15h50</strong>).
              </p>
              <p>
                <strong>Parágrafo Segundo:</strong> Os{" "}
                <strong>10 (dez) minutos finais</strong> de cada bloco
                destinam-se exclusivamente à saída do paciente, desligamento de
                equipamentos, ventilação do ambiente e transição operacional sem
                atrasos para o profissional agendado na hora cheia subsequente.
              </p>
            </section>

            {/* CLÁUSULA 5 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 5ª — DO FUNCIONAMENTO DO “FUSION PASS+”, CARTEIRA
                DIGITAL E EXPIRAÇÃO (<em>BREAKAGE</em>)
              </h2>
              <p>
                <strong>5.1. Ciclo Recorrente Mensal:</strong> Ao aderir ao
                plano <strong>Fusion Pass+</strong> (via Cartão de Crédito ou
                PIX), o Especialista contrata uma assinatura mensal de renovação
                automática que injeta em sua Carteira Digital a quantidade de
                horas escolhida na respectiva categoria (<em>Basic/Start</em>,{" "}
                <em>VIP</em> ou <em>Premium/Master</em>).
              </p>
              <p>
                <strong>
                  5.2. Prazo de Validade de 30 Dias e Expiração (
                  <em>Breakage</em>):
                </strong>{" "}
                Todos os créditos oriundos do Fusion Pass+, bônus ou recargas
                possuem{" "}
                <strong>
                  prazo de validade improrrogável de 30 (trinta) dias corridos
                </strong>{" "}
                a contar da data de sua disponibilização na Carteira Digital.
                Por se tratar de tarifa promocional fortemente subsidiada com
                bloqueio de capacidade operacional da rede,{" "}
                <strong>
                  as horas não utilizadas dentro do prazo de 30 (trinta) dias
                  expiram automaticamente (<em>Breakage</em>)
                </strong>
                , não sendo cumulativas para os meses subsequentes e não
                conferindo direito a reembolso em pecúnia, prorrogação ou
                indenização sob qualquer pretexto.
              </p>
              <p>
                <strong>5.3. Ordem de Consumo (Regra FIFO):</strong> O
                abatimento de créditos da Carteira Digital segue estritamente a
                regra <em>First In, First Out</em> (o crédito que vence primeiro
                é consumido primeiro).
              </p>
              <p>
                <strong>
                  5.4. Hierarquia de Salas e Efeito Cascata (
                  <em>Downgrade Voluntário</em>):
                </strong>{" "}
                Os consultórios são classificados em três níveis:{" "}
                <em>Basic (Start)</em>, <em>VIP</em> e <em>Premium (Master)</em>
                . Créditos de categoria superior permitem reservar salas de
                categoria inferior por efeito cascata. Caso o Especialista opte
                voluntariamente por utilizar créditos de nível superior (ex.:{" "}
                <em>Premium</em> ou <em>VIP</em>) para reservar uma sala de
                nível inferior (ex.: <em>Basic</em>), o débito será de 1 (um)
                crédito por hora reservada,{" "}
                <strong>
                  não cabendo restituição, troco ou crédito da diferença de
                  valor monetário (<em>spread</em>)
                </strong>{" "}
                entre as categorias.
              </p>
              <p>
                <strong>
                  5.5. Transferência de Horas (<em>Fusion Gift</em>):
                </strong>{" "}
                O Especialista pode transferir créditos ativos de sua Carteira
                Digital para outro profissional devidamente cadastrado na
                Plataforma através da ferramenta <em>Fusion Gift</em>,
                mantendo-se a categoria e a data de expiração originais do lote.
              </p>
              <p>
                <strong>5.6. Cancelamento de Assinatura sem Fidelidade:</strong>{" "}
                O Especialista pode cancelar a renovação automática de seu plano
                Fusion Pass+ a qualquer momento através do painel do usuário,
                sem cobrança de multa rescisória. O cancelamento interrompe as
                cobranças dos ciclos futuros, permanecendo os créditos já pagos
                e liberados ativos até o termo final de seus respectivos 30
                (trinta) dias de validade.
              </p>
            </section>

            {/* CLÁUSULA 6 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 6ª — DO CONTROLE DE ACESSO FÍSICO (NFC / QR CODE),
                ATRASOS E PENALIDADES (<em>OVERTIME</em>)
              </h2>
              <p>
                <strong>
                  6.1. Obrigatoriedade de Check-in e Check-out na Porta:
                </strong>{" "}
                Para garantia da segurança patrimonial, auditoria de ocupação e
                tarifação justa, o Especialista é obrigado a: (a) ao entrar na
                sala (<strong>Check-in</strong>), encostar seu smartphone na{" "}
                <strong>Tag NFC</strong> ou escanear o <strong>QR Code</strong>{" "}
                fixado na porta do consultório; e (b) ao sair da sala (
                <strong>Check-out</strong>), encostar novamente seu smartphone
                na <strong>Tag NFC</strong> ou escanear o{" "}
                <strong>QR Code</strong> da porta até o minuto 50 (cinquenta) do
                seu último horário reservado.
              </p>
              <p>
                <strong>
                  6.2. Tolerância Operacional e Penalidade por Ultrapassagem de
                  Horário (<em>Overstay / Overtime</em>):
                </strong>{" "}
                O período entre o minuto 50 e o minuto 60 constitui janela
                exclusiva de transição. A saída dentro dos 10 minutos finais
                gerará <strong>Advertência Operacional</strong> no sistema. Caso
                o Especialista permaneça na sala após o término da hora (estouro
                do relógio) ou deixe de registrar o Check-out impedindo ou
                atrasando a entrada do próximo profissional agendado, será
                aplicada automaticamente{" "}
                <strong>
                  Multa Operacional por Estouro de Horário (
                  <em>Overtime Penalty</em>)
                </strong>{" "}
                equivalente ao valor integral de 1 (uma) hora da respectiva
                sala, acrescida de eventuais perdas e danos, debitada da
                Carteira Digital ou cobrada via método de pagamento cadastrado.
              </p>
            </section>

            {/* CLÁUSULA 7 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 7ª — DAS REGRAS DE CONVIVÊNCIA, CONSERVAÇÃO E
                RESPONSABILIDADE PATRIMONIAL
              </h2>
              <p>
                <strong>7.1. Checklist Obrigatório de Saída:</strong> Antes de
                se retirar do consultório e registrar o Check-out, o
                Especialista obriga-se rigorosamente a: (a){" "}
                <strong>desligar o aparelho de ar-condicionado</strong>; (b){" "}
                <strong>apagar todas as luzes</strong> da sala; (c) fechar
                janelas e torneiras; (d) retirar todos os seus pertences
                pessoais; e (e) deixar a sala organizada nas exatas condições em
                que a recebeu.
              </p>
              <p>
                <strong>
                  7.2. Taxa por Desperdício de Energia / Negligência:
                </strong>{" "}
                Caso seja constatado que o Especialista deixou o ar-condicionado
                ou iluminação ligados após o encerramento de seu atendimento,
                poderá ser cobrada taxa de ressarcimento energético e
                operacional de R$ 50,00 (cinquenta reais) a R$ 250,00 (duzentos
                e cinquenta reais) por ocorrência.
              </p>
              <p>
                <strong>7.3. Danos ao Patrimônio e Equipamentos:</strong> O
                Especialista é objetivamente responsável por quaisquer danos,
                avarias, manchas em estofados/macas ou quebras de equipamentos
                causados por si, por seus auxiliares ou por seus pacientes às
                dependências da clínica durante o período de sua reserva.
              </p>
            </section>

            {/* CLÁUSULA 8 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 8ª — DA POLÍTICA DE RESERVAS PENDENTES, CANCELAMENTOS E
                REEMBOLSOS
              </h2>
              <p>
                <strong>
                  8.1. Bloqueio Temporário de Checkout (<em>Lock</em>):
                </strong>{" "}
                Ao iniciar uma reserva por PIX ou Cartão de Crédito, o horário
                fica temporariamente bloqueado (<code>pending_payment</code>)
                aguardando a confirmação do gateway de pagamento. Caso não seja
                compensado no tempo limite, a reserva é automaticamente
                cancelada e liberada.
              </p>
              <p>
                <strong>
                  8.2. Cancelamento com 24 Horas ou Mais de Antecedência:
                </strong>{" "}
                Caso o Especialista cancele a reserva pelo aplicativo com
                antecedência mínima de 24 (vinte e quatro) horas em relação ao
                horário de início agendado, receberá o{" "}
                <strong>
                  estorno integral (100%) em forma de créditos na sua Carteira
                  Digital
                </strong>{" "}
                na mesma categoria da sala/crédito utilizado, com validade de 30
                (trinta) dias para novo agendamento.
              </p>
              <p>
                <strong>
                  8.3. Cancelamento com Menos de 24 Horas ou Não Comparecimento
                  (<em>No-Show</em>):
                </strong>{" "}
                Caso o cancelamento ocorra a menos de 24 (vinte e quatro) horas
                do início da sessão, ou caso o Especialista não compareça (
                <em>No-Show</em>),{" "}
                <strong>
                  não haverá qualquer reembolso, estorno de créditos ou
                  devolução de valores
                </strong>
                , uma vez que o consultório permaneceu bloqueado na grade e
                indisponível para locação por outros profissionais.
              </p>
            </section>

            {/* CLÁUSULA 9 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 9ª — DOS PAGAMENTOS, GATEWAY ASAAS, SPLIT FINANCEIRO E
                MANDATO
              </h2>
              <p>
                <strong>9.1. Processamento via Asaas:</strong> Todas as
                transações financeiras em moeda corrente (PIX e Cartão de
                Crédito) são processadas por instituição de pagamento homologada
                pelo Banco Central do Brasil:{" "}
                <strong>
                  ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A.
                </strong>{" "}
                (CNPJ nº 19.540.550/0001-21).
              </p>
              <p>
                <strong>9.2. Tokenização 1-Click e Chargeback:</strong> A Fusion
                Clinic não armazena o número completo do cartão nem o código
                CVV, guardando apenas o token seguro (<code>cc_token</code>) e
                os 4 últimos dígitos. A abertura indevida de contestação (
                <em>chargeback</em>) após o uso da sala ou disponibilização de
                créditos ensejará o bloqueio imediato da conta, protesto e
                cobrança judicial acrescida de multa de 10% e juros legais.
              </p>
              <p>
                <strong>9.3. Mandato e Split de Pagamento:</strong> Ao cadastrar
                uma sala ou atuar como Coanfitrião, o recebedor outorga mandato
                à Fusion Clinic para processar a divisão automática de receitas
                (<em>Split Payment</em>), retendo a taxa de intermediação da
                Plataforma e repassando o líquido acordado à carteira Asaas
                vinculada.
              </p>
            </section>

            {/* CLÁUSULA 10 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 10ª — DA ISENÇÃO DE RESPONSABILIDADE MÉDICA, SANITÁRIA
                E REGULATÓRIA
              </h2>
              <p>
                <strong>10.1. Autonomia Técnica Absoluta:</strong> O
                Especialista exerce sua profissão com total independência
                técnica, científica e ética, sendo o{" "}
                <strong>único e exclusivo responsável</strong> perante seus
                pacientes, Conselhos Profissionais (CFM, CRP, CRO, CRN, CREFITO,
                etc.), Vigilância Sanitária (ANVISA/SUVISA) e PROCON pelos
                atendimentos, diagnósticos, prescrições e procedimentos
                realizados no interior do consultório.
              </p>
              <p>
                <strong>10.2. Guarda de Prontuários de Pacientes:</strong> A
                Plataforma Fusion Clinic não coleta nem armazena prontuários
                médicos ou dados clínicos de pacientes finais. A guarda e o
                sigilo dos prontuários são de responsabilidade exclusiva e
                intransferível do Especialista (Lei nº 13.787/2018).
              </p>
              <p>
                <strong>
                  10.3. Cláusula de Indenização Regressiva (
                  <em>Hold Harmless</em>):
                </strong>{" "}
                Caso a Fusion Clinic ou a Clínica Anfitriã venham a ser
                demandadas judicial ou administrativamente por qualquer paciente
                ou órgão fiscalizador em decorrência de ato, omissão ou erro
                profissional praticado pelo Especialista, este obriga-se a
                assumir integralmente o polo passivo da demanda e a ressarcir
                todos os valores, condenações, custas e honorários advocatícios
                despendidos.
              </p>
            </section>

            {/* CLÁUSULAS 11, 12, 13 E 14 */}
            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 11ª — DO CHAT SEGURO, VEDAÇÃO DE BYPASS E PROPRIEDADE
                INTELECTUAL
              </h2>
              <p>
                <strong>11.1. Vedação de Circunvenção (Bypass):</strong> As
                tratativas para locação de Turnos Fixos e Contratos Mensais
                devem ocorrer através do Chat Seguro da Plataforma. É vedada a
                utilização da Plataforma para captar contatos com o intuito de
                fechar locações por fora do sistema, sob pena de exclusão da
                conta e multa de 20% sobre o valor anual estimado do contrato.
              </p>
              <p>
                <strong>11.2. Propriedade Intelectual:</strong> Todo o
                código-fonte, algoritmos (incluindo o Concierge IA), marcas
                (“Fusion Clinic”, “Fusion Pass+”, “Fusion Gift”) e interfaces
                pertencem exclusivamente à Fusion Clinic Soluções em Saúde Ltda.
              </p>
            </section>

            <section className="space-y-3 pt-4 border-t border-stone-100">
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                CLÁUSULA 12ª — DA LIMITAÇÃO DE RESPONSABILIDADE E DO FORO
              </h2>
              <p>
                <strong>12.1. Limitação de Responsabilidade:</strong> Em nenhuma
                hipótese a responsabilidade total acumulada da Fusion Clinic
                perante qualquer Usuário por falhas técnicas diretas excederá o
                valor total efetivamente pago pelo Usuário à Plataforma nos 3
                (três) meses imediatamente anteriores ao evento.
              </p>
              <p>
                <strong>12.2. Legislação e Foro de Eleição:</strong> Estes
                Termos são regidos pelas leis da República Federativa do Brasil.
                Fica eleito o{" "}
                <strong>
                  Foro da Comarca de Natal, Estado do Rio Grande do Norte
                </strong>
                , com renúncia expressa a qualquer outro, por mais privilegiado
                que seja, para dirimir quaisquer controvérsias oriundas deste
                instrumento.
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
              Dúvidas jurídicas:{" "}
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
