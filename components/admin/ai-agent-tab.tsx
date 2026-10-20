"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  Send,
  Loader2,
  Calendar as CalendarIcon,
  Database,
  Table as TableIcon,
  TrendingUp,
  Clock,
  Copy,
  Check,
  Trash2,
  Bot,
  User,
  ShieldCheck,
  Wallet,
  ArrowRight,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Download,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { subDays, startOfYear, format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

type PeriodMode = "30d" | "90d" | "ytd" | "custom";
type ChartType = "bar" | "area" | "line" | "pie";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  metadata?: {
    periodStart: string;
    periodEnd: string;
    roomsAnalyzed: number;
    bookingsAnalyzed: number;
  };
}

interface AiChartSeries {
  key: string;
  label: string;
  color?: string;
}

interface AiChartConfig {
  type: ChartType;
  title: string;
  subtitle?: string;
  xKey: string;
  valuePrefix?: string;
  valueSuffix?: string;
  series: AiChartSeries[];
  data: Record<string, any>[];
}

const STORAGE_KEY_MESSAGES = "fusion_ai_chat_history";
const STORAGE_KEY_FILTERS = "fusion_ai_chat_filters";

const DEFAULT_WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  timestamp: format(new Date(), "HH:mm"),
  content: `Olá! Sou o **Fusion Intelligence**, o seu Cientista de Dados e Super Agente de BI com **Agentic RAG**.

Agora posso gerar **Gráficos Interativos (Barras, Área, Linha e Pizza/Rosca)** e **Tabelas Analíticas com Exportação para Excel (.CSV)** em tempo real a partir dos dados do Supabase!

Clique num dos atalhos acima ou peça qualquer gráfico/tabela no campo abaixo.`,
};

// ============================================================================
// STORE GLOBAL EM MEMÓRIA + SESSION STORAGE (MANTÉM A CONVERSA E REQUISIÇÕES
// EM ANDAMENTO MESMO SE O GESTOR TROCAR DE ABA ENQUANTO A IA PENSA)
// ============================================================================
interface PersistedAgentStore {
  messages: ChatMessage[];
  loading: boolean;
  periodMode: PeriodMode;
  customStart: string;
  customEnd: string;
  inputQuestion: string;
  hydrated: boolean;
}

const agentStore: PersistedAgentStore = {
  messages: [DEFAULT_WELCOME],
  loading: false,
  periodMode: "30d",
  customStart: format(subDays(new Date(), 30), "yyyy-MM-dd"),
  customEnd: format(new Date(), "yyyy-MM-dd"),
  inputQuestion: "",
  hydrated: false,
};

const storeListeners = new Set<() => void>();

function notifyStoreListeners() {
  storeListeners.forEach((listener) => listener());
}

function hydrateAgentStoreFromSession() {
  if (typeof window === "undefined" || agentStore.hydrated) return;
  agentStore.hydrated = true;

  try {
    const savedMessages = sessionStorage.getItem(STORAGE_KEY_MESSAGES);
    if (savedMessages) {
      const parsed = JSON.parse(savedMessages);
      if (Array.isArray(parsed) && parsed.length > 0) {
        agentStore.messages = parsed;
      }
    }

    const savedFilters = sessionStorage.getItem(STORAGE_KEY_FILTERS);
    if (savedFilters) {
      const parsedFilters = JSON.parse(savedFilters);
      if (parsedFilters.periodMode) {
        agentStore.periodMode = parsedFilters.periodMode;
      }
      if (parsedFilters.customStart) {
        agentStore.customStart = parsedFilters.customStart;
      }
      if (parsedFilters.customEnd) {
        agentStore.customEnd = parsedFilters.customEnd;
      }
    }
  } catch (e) {
    console.error("Erro ao hidratar sessão do Agente IA:", e);
  }
}

function persistAgentStoreToSession() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      STORAGE_KEY_MESSAGES,
      JSON.stringify(agentStore.messages),
    );
    sessionStorage.setItem(
      STORAGE_KEY_FILTERS,
      JSON.stringify({
        periodMode: agentStore.periodMode,
        customStart: agentStore.customStart,
        customEnd: agentStore.customEnd,
      }),
    );
  } catch (e) {
    console.error("Erro ao salvar sessão do Agente IA:", e);
  }
}

function updateAgentStore(partial: Partial<PersistedAgentStore>) {
  Object.assign(agentStore, partial);
  persistAgentStoreToSession();
  notifyStoreListeners();
}

const CHART_PALETTE = [
  "#BF4B24",
  "#0f172a",
  "#10b981",
  "#7c3aed",
  "#f59e0b",
  "#0284c7",
  "#ec4899",
];

const CHART_MARGIN = { top: 10, right: 16, left: 0, bottom: 20 };
const X_AXIS_TICK = { fontSize: 11, fontWeight: 700, fill: "#475569" };
const X_AXIS_LINE = { stroke: "#cbd5e1" };
const Y_AXIS_TICK = { fontSize: 11, fontWeight: 600, fill: "#64748b" };
const BAR_RADIUS: [number, number, number, number] = [6, 6, 0, 0];

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  backgroundColor: "#0f172a",
  borderRadius: "12px",
  border: "none",
  color: "#fff",
  fontSize: "12px",
  fontWeight: 700,
};

const TOOLTIP_ITEM_STYLE: React.CSSProperties = {
  color: "#fff",
};

const LEGEND_WRAPPER_STYLE: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 700,
};

const SUGGESTED_PROMPTS = [
  {
    title: "Gráfico + Tabela: Ociosidade por Sala",
    prompt:
      "Gere um gráfico de barras comparando a taxa de ocupação e a taxa de ociosidade de todas as salas, acompanhado de uma tabela completa com o gap financeiro.",
    icon: BarChart3,
  },
  {
    title: "Gráfico de Evolução (Últimos Meses)",
    prompt:
      "Gere um gráfico de área mostrando a evolução do faturamento (Horas Avulsas vs Contratos Fixos) nos últimos meses e uma tabela detalhada mês a mês.",
    icon: TrendingUp,
  },
  {
    title: "Ociosidade nas Segundas-feiras",
    prompt:
      "Qual a taxa de ociosidade nas segundas-feiras de cada sala? Monte um gráfico comparativo e uma tabela com horas livres e ocupadas.",
    icon: Clock,
  },
  {
    title: "Gráfico de Pizza: Especialidades & Médicos",
    prompt:
      "Gere um gráfico de rosca com a distribuição de faturamento por especialidade médica e uma tabela com o ranking dos profissionais e candidatos a contrato fixo.",
    icon: PieChartIcon,
  },
  {
    title: "Auditoria de Carteiras & Créditos",
    prompt:
      "Gere um gráfico e uma tabela auditando os créditos ativos em circulação (START, VIP, MASTER) e liste quais médicos estão com saldo parado na carteira.",
    icon: Wallet,
  },
  {
    title: "Estoque Futuro (Próximos 20 Dias)",
    prompt:
      "Gere um gráfico comparando a capacidade de horas livres vs reservadas para os próximos 20 dias de cada sala e uma tabela com o potencial aberto em R$.",
    icon: TableIcon,
  },
];

const CHART_BUTTONS: { id: ChartType; label: string; icon: any }[] = [
  { id: "bar", label: "Barras", icon: BarChart3 },
  { id: "area", label: "Área", icon: TrendingUp },
  { id: "line", label: "Linha", icon: LineChartIcon },
  { id: "pie", label: "Rosca", icon: PieChartIcon },
];

const PERIOD_OPTIONS: { id: PeriodMode; label: string }[] = [
  { id: "30d", label: "30 Dias" },
  { id: "90d", label: "90 Dias (3M)" },
  { id: "ytd", label: "Este Ano" },
  { id: "custom", label: "Personalizado" },
];

// ============================================================================
// COMPONENTE DE GRÁFICO INTERATIVO DE CIÊNCIA DE DADOS
// ============================================================================
function InteractiveAiChart({ config }: { config: AiChartConfig }) {
  const [chartType, setChartType] = useState<ChartType>(config.type || "bar");

  if (!config || !Array.isArray(config.data) || config.data.length === 0) {
    return null;
  }

  const prefix = config.valuePrefix || "";
  const suffix = config.valueSuffix || "";

  const formatMetricValue = (val: any): string => {
    const num = Number(val);
    if (isNaN(num)) return String(val ?? "");
    if (prefix.includes("R$")) {
      return `R$ ${num.toLocaleString("pt-BR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    }
    return `${prefix}${num.toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })}${suffix}`;
  };

  const handleTooltipFormatter = (value: any, name: any) => [
    formatMetricValue(value),
    String(name ?? ""),
  ];

  const renderPieLabel = (entry: any) => {
    const itemName = entry?.[config.xKey] || entry?.name || "";
    const pct = ((Number(entry?.percent) || 0) * 100).toFixed(0);
    return `${itemName}: ${pct}%`;
  };

  const handleSelectChartType = (type: ChartType) => () => {
    setChartType(type);
  };

  const primarySeriesKey = config.series?.[0]?.key || "valor";

  return (
    <div className="my-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-orange-100 text-[#BF4B24] border-0 text-[10px] font-black uppercase">
              Visualização BI
            </Badge>
            <h4 className="text-sm sm:text-base font-black text-slate-900">
              {config.title}
            </h4>
          </div>
          {config.subtitle && (
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {config.subtitle}
            </p>
          )}
        </div>

        <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
          {CHART_BUTTONS.map((btn) => {
            const Icon = btn.icon;
            const active = chartType === btn.id;
            return (
              <button
                key={btn.id}
                type="button"
                onClick={handleSelectChartType(btn.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                  active
                    ? "bg-slate-900 text-white shadow-2xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className="w-3 h-3" />
                <span>{btn.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="h-72 sm:h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {chartType === "bar" ? (
            <BarChart data={config.data} margin={CHART_MARGIN}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis
                dataKey={config.xKey}
                tick={X_AXIS_TICK}
                axisLine={X_AXIS_LINE}
                tickLine={false}
              />
              <YAxis
                tick={Y_AXIS_TICK}
                axisLine={false}
                tickLine={false}
                tickFormatter={formatMetricValue}
              />
              <Tooltip
                formatter={handleTooltipFormatter}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
              {config.series.map((s, idx) => {
                const barColor =
                  s.color || CHART_PALETTE[idx % CHART_PALETTE.length];
                return (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    name={s.label}
                    fill={barColor}
                    radius={BAR_RADIUS}
                    maxBarSize={48}
                  />
                );
              })}
            </BarChart>
          ) : chartType === "area" ? (
            <AreaChart data={config.data} margin={CHART_MARGIN}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis dataKey={config.xKey} tick={X_AXIS_TICK} />
              <YAxis tick={Y_AXIS_TICK} tickFormatter={formatMetricValue} />
              <Tooltip
                formatter={handleTooltipFormatter}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
              {config.series.map((s, idx) => {
                const areaColor =
                  s.color || CHART_PALETTE[idx % CHART_PALETTE.length];
                return (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={areaColor}
                    strokeWidth={2.5}
                    fill={areaColor}
                    fillOpacity={0.2}
                  />
                );
              })}
            </AreaChart>
          ) : chartType === "line" ? (
            <LineChart data={config.data} margin={CHART_MARGIN}>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
              />
              <XAxis dataKey={config.xKey} tick={X_AXIS_TICK} />
              <YAxis tick={Y_AXIS_TICK} tickFormatter={formatMetricValue} />
              <Tooltip
                formatter={handleTooltipFormatter}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
              {config.series.map((s, idx) => {
                const lineColor =
                  s.color || CHART_PALETTE[idx % CHART_PALETTE.length];
                return (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.label}
                    stroke={lineColor}
                    strokeWidth={3}
                    dot={{ r: 4, fill: lineColor }}
                  />
                );
              })}
            </LineChart>
          ) : (
            <PieChart>
              <Tooltip
                formatter={handleTooltipFormatter}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
              />
              <Legend wrapperStyle={LEGEND_WRAPPER_STYLE} />
              <Pie
                data={config.data}
                dataKey={primarySeriesKey}
                nameKey={config.xKey}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={3}
                label={renderPieLabel}
              >
                {config.data.map((_, idx) => (
                  <Cell
                    key={`cell-${idx}`}
                    fill={CHART_PALETTE[idx % CHART_PALETTE.length]}
                  />
                ))}
              </Pie>
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ============================================================================
// RENDERIZADOR DE MARKDOWN + GRÁFICOS RECHARTS + TABELAS COM EXPORTAÇÃO CSV
// ============================================================================
function RichMarkdownRenderer({
  content,
  onSelectOption,
}: {
  content: string;
  onSelectOption: (promptText: string) => void;
}) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  const quickActionOptions: string[] = [];
  let i = 0;

  const formatInline = (text: string): React.ReactNode[] => {
    const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
    return parts.map((part, idx) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={idx} className="font-black text-slate-900">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code
            key={idx}
            className="px-1.5 py-0.5 rounded bg-orange-50 text-[#BF4B24] font-mono text-xs font-bold"
          >
            {part.slice(1, -1)}
          </code>
        );
      }
      return part;
    });
  };

  const downloadTableAsCsv = (headers: string[], rows: string[][]) => {
    const escapeCsv = (str: string) =>
      `"${str.replace(/\*\*/g, "").replace(/"/g, '""')}"`;
    const csvContent = [
      headers.map(escapeCsv).join(";"),
      ...rows.map((r) => r.map(escapeCsv).join(";")),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-fusion-bi-${format(new Date(), "dd-MM-yyyy-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleQuickOptionClick = (optionText: string) => () => {
    onSelectOption(optionText);
  };

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.startsWith("```chart") || line.startsWith("```json-chart")) {
      i++;
      const jsonLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        jsonLines.push(lines[i]);
        i++;
      }
      i++;
      try {
        const parsedChart = JSON.parse(jsonLines.join("\n")) as AiChartConfig;
        const chartKey = `chart-${i}`;
        elements.push(
          <InteractiveAiChart config={parsedChart} key={chartKey} />,
        );
      } catch (e) {
        console.warn("Aviso ao converter JSON do gráfico:", e);
      }
      continue;
    }

    const askMatch = line.match(/^\[\[PERGUNTAR:\s*(.+?)\]\]$/i);
    if (askMatch) {
      quickActionOptions.push(askMatch[1].trim());
      i++;
      continue;
    }

    if (
      line.startsWith("|") &&
      line.endsWith("|") &&
      i + 1 < lines.length &&
      lines[i + 1].trim().includes("---")
    ) {
      const headers = line
        .split("|")
        .slice(1, -1)
        .map((h) => h.trim());
      i += 2;

      const rows: string[][] = [];
      while (
        i < lines.length &&
        lines[i].trim().startsWith("|") &&
        lines[i].trim().endsWith("|")
      ) {
        const cells = lines[i]
          .trim()
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim());
        rows.push(cells);
        i++;
      }

      const handleDownloadCsvClick = () => {
        downloadTableAsCsv(headers, rows);
      };

      elements.push(
        <div
          key={`table-${i}`}
          className="my-4 overflow-hidden rounded-2xl border border-slate-200 shadow-2xs bg-white"
        >
          <div className="bg-slate-900 text-white px-4 py-2.5 flex items-center justify-between">
            <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 text-orange-300">
              <TableIcon className="w-3.5 h-3.5" /> Tabela Analítica Auditada (
              {rows.length} registos)
            </span>
            <button
              type="button"
              onClick={handleDownloadCsvClick}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-[#BF4B24] text-white text-[11px] font-bold transition-colors cursor-pointer"
            >
              <Download className="w-3 h-3" /> Baixar Planilha (.CSV)
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
              <thead className="bg-[#FAF7F5] text-slate-700 font-black uppercase text-[10px] tracking-wider border-b border-orange-200/70">
                <tr>
                  {headers.map((h, hIdx) => (
                    <th key={hIdx} className="px-4 py-3">
                      {formatInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, rIdx) => (
                  <tr
                    key={rIdx}
                    className="hover:bg-orange-50/40 transition-colors even:bg-slate-50/50"
                  >
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className="px-4 py-2.5 text-slate-700 font-medium"
                      >
                        {formatInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>,
      );
      continue;
    }

    if (line.startsWith("### ")) {
      elements.push(
        <h3
          key={i}
          className="text-sm sm:text-base font-black text-slate-900 mt-4 mb-1.5 flex items-center gap-1.5"
        >
          <span className="w-1.5 h-4 rounded-full bg-[#BF4B24] inline-block" />
          {formatInline(line.replace("### ", ""))}
        </h3>,
      );
      i++;
      continue;
    }

    if (line.startsWith("## ")) {
      elements.push(
        <h2
          key={i}
          className="text-base sm:text-lg font-black text-slate-900 mt-5 mb-2 border-b border-slate-100 pb-1"
        >
          {formatInline(line.replace("## ", ""))}
        </h2>,
      );
      i++;
      continue;
    }

    if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(
        <div key={i} className="flex items-start gap-2 my-1 pl-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#BF4B24] mt-2 shrink-0" />
          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">
            {formatInline(line.slice(2))}
          </p>
        </div>,
      );
      i++;
      continue;
    }

    if (line === "---") {
      elements.push(<hr key={i} className="my-4 border-slate-200" />);
      i++;
      continue;
    }

    if (!line) {
      elements.push(<div key={i} className="h-2" />);
      i++;
      continue;
    }

    elements.push(
      <p key={i} className="text-xs sm:text-sm text-slate-700 leading-relaxed">
        {formatInline(line)}
      </p>,
    );
    i++;
  }

  return (
    <div className="space-y-1">
      {elements}

      {quickActionOptions.length > 0 && (
        <div className="pt-3 mt-3 border-t border-orange-200/60">
          <p className="text-[10px] font-black uppercase tracking-wider text-[#BF4B24] mb-2">
            Escolha uma opção abaixo para consultar com 1 clique:
          </p>
          <div className="flex flex-wrap gap-2">
            {quickActionOptions.map((optionText, idx) => (
              <button
                key={idx}
                type="button"
                onClick={handleQuickOptionClick(optionText)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-[#BF4B24] text-slate-800 hover:text-white border border-orange-300 text-xs font-black shadow-2xs transition-all cursor-pointer"
              >
                <span>{optionText}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ABA PRINCIPAL DO AGENTE DE BI COM PERSISTÊNCIA EM SEGUNDO PLANO
// ============================================================================
export function AdminAiAgentTab() {
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [isMounted, setIsMounted] = useState(false);
  const [, setTick] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    hydrateAgentStoreFromSession();
    setIsMounted(true);

    const handleStoreChange = () => {
      setTick((prev) => prev + 1);
    };

    storeListeners.add(handleStoreChange);
    return () => {
      storeListeners.delete(handleStoreChange);
    };
  }, []);

  const {
    messages,
    loading,
    periodMode,
    customStart,
    customEnd,
    inputQuestion,
  } = agentStore;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isMounted) {
      scrollToBottom();
    }
  }, [messages.length, loading, isMounted]);

  const getActiveDateRange = () => {
    const now = new Date();
    if (agentStore.periodMode === "30d") {
      return {
        startDate: format(subDays(now, 30), "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd"),
      };
    }
    if (agentStore.periodMode === "90d") {
      return {
        startDate: format(subDays(now, 90), "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd"),
      };
    }
    if (agentStore.periodMode === "ytd") {
      return {
        startDate: format(startOfYear(now), "yyyy-MM-dd"),
        endDate: format(now, "yyyy-MM-dd"),
      };
    }
    return {
      startDate: agentStore.customStart,
      endDate: agentStore.customEnd,
    };
  };

  const handleAskAgent = async (questionText?: string) => {
    const finalQuestion = (questionText ?? agentStore.inputQuestion).trim();
    if (!finalQuestion || agentStore.loading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: finalQuestion,
      timestamp: format(new Date(), "HH:mm"),
    };

    const previousHistory = agentStore.messages
      .filter((m) => m.id !== "welcome")
      .map((m) => ({ role: m.role, content: m.content }));

    updateAgentStore({
      messages: [...agentStore.messages, userMsg],
      inputQuestion: questionText ? agentStore.inputQuestion : "",
      loading: true,
    });

    try {
      const { startDate, endDate } = getActiveDateRange();

      const res = await fetch("/api/admin/ai-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: finalQuestion,
          startDate,
          endDate,
          history: previousHistory,
        }),
      });

      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          "O servidor devolveu uma resposta inválida. Verifique se a rota app/api/admin/ai-agent/route.ts está ativa.",
        );
      }

      if (!res.ok) {
        throw new Error(data.error || "Erro ao consultar o Agente de IA.");
      }

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        role: "assistant",
        content: data.answer,
        timestamp: format(new Date(), "HH:mm"),
        metadata: data.metadata,
      };

      updateAgentStore({
        messages: [...agentStore.messages, aiMsg],
        loading: false,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Atenção no Agente IA",
        description: err.message,
      });

      const errMsg: ChatMessage = {
        id: `err_${Date.now()}`,
        role: "assistant",
        timestamp: format(new Date(), "HH:mm"),
        content: `⚠️ **Não foi possível concluir a consulta:** ${err.message}`,
      };

      updateAgentStore({
        messages: [...agentStore.messages, errMsg],
        loading: false,
      });
    }
  };

  const handleCopyMessage = (msg: ChatMessage) => () => {
    navigator.clipboard.writeText(msg.content);
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Análise copiada para a área de transferência!" });
  };

  const clearChat = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem(STORAGE_KEY_MESSAGES);
    }
    updateAgentStore({
      messages: [DEFAULT_WELCOME],
      loading: false,
    });
  };

  const handleSelectPeriod = (mode: PeriodMode) => () => {
    updateAgentStore({ periodMode: mode });
  };

  const handleCustomStartChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateAgentStore({ customStart: e.target.value });
  };

  const handleCustomEndChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateAgentStore({ customEnd: e.target.value });
  };

  const handleSuggestedPromptClick = (promptText: string) => () => {
    handleAskAgent(promptText);
  };

  const handleQuestionInputChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    updateAgentStore({ inputQuestion: e.target.value });
  };

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    handleAskAgent();
  };

  const isSubmitDisabled = loading || !inputQuestion.trim();

  if (!isMounted) return null;

  return (
    <div className="p-4 lg:p-8 w-full max-w-7xl mx-auto pb-28 font-sans flex flex-col min-h-[calc(100svh-5rem)]">
      {/* HEADER EXECUTIVO DO SUPER AGENTE */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs mb-4">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-[#BF4B24] text-white flex items-center justify-center shrink-0 shadow-sm">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  Fusion Intelligence (Data Science & BI)
                </h1>
                <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] font-black uppercase flex items-center gap-1">
                  <Database className="w-3 h-3" /> Gráficos Recharts + Tabelas
                  CSV
                </Badge>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
                Peça gráficos de barras, linhas, área ou pizza, exporte tabelas
                para Excel e navegue livremente entre abas sem perder a
                conversa.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl">
              {PERIOD_OPTIONS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={handleSelectPeriod(p.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    periodMode === p.id
                      ? "bg-slate-900 text-white shadow-2xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {periodMode === "custom" && (
              <div className="flex items-center bg-white border border-orange-200 rounded-xl px-2.5 py-1">
                <CalendarIcon className="w-3.5 h-3.5 text-[#BF4B24] mr-1.5" />
                <input
                  type="date"
                  value={customStart}
                  onChange={handleCustomStartChange}
                  className="text-xs font-bold text-slate-800 outline-none w-28"
                />
                <span className="text-xs text-slate-400 px-1">até</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={handleCustomEndChange}
                  className="text-xs font-bold text-slate-800 outline-none w-28"
                />
              </div>
            )}

            {messages.length > 1 && (
              <Button
                className="h-9 rounded-xl border-slate-200 text-xs font-bold text-slate-500 hover:text-red-600"
                onClick={clearChat}
                size="sm"
                type="button"
                variant="outline"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Limpar Chat
              </Button>
            )}
          </div>
        </div>

        {/* ATALHOS DE COMANDO COM GRÁFICOS E TABELAS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-slate-100">
          {SUGGESTED_PROMPTS.map((item, idx) => {
            const Icon = item.icon;
            return (
              <button
                key={idx}
                type="button"
                disabled={loading}
                onClick={handleSuggestedPromptClick(item.prompt)}
                className="text-left p-3 rounded-xl border border-slate-200/90 bg-[#FAF7F5]/60 hover:bg-orange-50/70 hover:border-[#BF4B24]/40 transition-all group"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-black text-slate-900 group-hover:text-[#BF4B24] flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5 text-[#BF4B24]" />
                    {item.title}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-2 font-medium">
                  {item.prompt}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ÁREA DE CONVERSA & RELATÓRIOS GERADOS */}
      <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-2xs p-4 sm:p-6 overflow-y-auto space-y-5 max-h-[65vh]">
        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <div
              key={msg.id}
              className={`flex items-start gap-3 ${isUser ? "justify-end" : "justify-start"}`}
            >
              {!isUser && (
                <div className="w-9 h-9 rounded-xl bg-[#FAF7F5] border border-orange-200 text-[#BF4B24] flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="w-5 h-5" />
                </div>
              )}

              <div
                className={`max-w-full sm:max-w-[90%] rounded-2xl p-4 sm:p-5 ${
                  isUser
                    ? "bg-slate-900 text-white"
                    : "bg-slate-50/80 border border-slate-200/90 text-slate-800 w-full"
                }`}
              >
                <div className="flex items-center justify-between gap-4 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-black uppercase tracking-wider ${
                        isUser ? "text-orange-300" : "text-[#BF4B24]"
                      }`}
                    >
                      {isUser ? "Gestor Admin" : "Fusion Intelligence (BI)"}
                    </span>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {msg.timestamp}
                    </span>
                  </div>

                  {!isUser && (
                    <button
                      type="button"
                      onClick={handleCopyMessage(msg)}
                      className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-slate-900 bg-white px-2 py-1 rounded-lg border border-slate-200"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" /> Copiado
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" /> Copiar
                        </>
                      )}
                    </button>
                  )}
                </div>

                {isUser ? (
                  <p className="text-sm font-bold text-white leading-relaxed">
                    {msg.content}
                  </p>
                ) : (
                  <RichMarkdownRenderer
                    content={msg.content}
                    onSelectOption={handleAskAgent}
                  />
                )}

                {msg.metadata && (
                  <div className="mt-4 pt-3 border-t border-slate-200/80 flex flex-wrap items-center gap-3 text-[10px] font-bold text-slate-400">
                    <span className="flex items-center gap-1 text-emerald-700">
                      <ShieldCheck className="w-3.5 h-3.5" /> Dados Auditados do
                      Supabase
                    </span>
                    <span>
                      • Período base: {msg.metadata.periodStart} a{" "}
                      {msg.metadata.periodEnd}
                    </span>
                    <span>• {msg.metadata.roomsAnalyzed} salas analisadas</span>
                  </div>
                )}
              </div>

              {isUser && (
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shrink-0 mt-0.5">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          );
        })}

        {loading && (
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#FAF7F5] border border-orange-200 text-[#BF4B24] flex items-center justify-center shrink-0">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
              <p className="text-xs font-black text-slate-800">
                Processando estatísticas, montando gráficos e tabelas...
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Você pode navegar para outras abas tranquilamente; a análise
                continuará em segundo plano e ficará salva aqui.
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* BARRA DE PERGUNTA DO GESTOR */}
      <form
        onSubmit={handleFormSubmit}
        className="mt-4 bg-white p-3 rounded-2xl border-2 border-slate-200 focus-within:border-[#BF4B24] shadow-sm flex items-center gap-2.5"
      >
        <Input
          className="border-0 shadow-none focus-visible:ring-0 text-sm font-medium h-11"
          disabled={loading}
          onChange={handleQuestionInputChange}
          placeholder="Peça um gráfico ou tabela (ex: 'Gere um gráfico de barras da ociosidade por dia da semana da Sala Fusion 03')..."
          value={inputQuestion}
        />
        <Button
          className="h-11 px-6 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black shrink-0"
          disabled={isSubmitDisabled}
          type="submit"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" /> Gerar Análise
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
