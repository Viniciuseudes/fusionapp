// components/host/operations-tab.tsx
"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Package,
  Wrench,
  Receipt,
  AlertTriangle,
  Plus,
  Minus,
  Search,
  CheckCircle2,
  Clock,
  Trash2,
  Edit3,
  Building2,
  TrendingDown,
  Loader2,
  FileSpreadsheet,
  Calendar as CalendarIcon,
  Camera,
  Mic,
  Square,
  ExternalLink,
  X,
  FileCheck2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";

interface InventoryItem {
  id: string;
  host_id: string;
  room_id: string | null;
  name: string;
  category: string;
  unit: string;
  current_quantity: number;
  min_quantity: number;
  unit_cost: number;
  supplier: string | null;
  last_restocked_at: string | null;
  room_name?: string;
}

interface MaintenanceOrder {
  id: string;
  host_id: string;
  room_id: string | null;
  title: string;
  description: string | null;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "pending" | "in_progress" | "completed" | "cancelled";
  provider_name: string | null;
  provider_phone: string | null;
  cost: number;
  scheduled_date: string | null;
  completed_at: string | null;
  room_name?: string;
}

interface CustomFieldItem {
  key: string;
  value: string;
}

interface ClinicExpense {
  id: string;
  host_id: string;
  room_id: string | null;
  title: string;
  vendor?: string | null;
  category: string;
  cost_type?: "fixed" | "variable";
  amount: number;
  expense_date: string;
  payment_status: "paid" | "pending";
  reference_type: string | null;
  receipt_url?: string | null;
  receipt_filename?: string | null;
  custom_fields?: CustomFieldItem[];
  notes: string | null;
  room_name?: string;
}

const INVENTORY_CATEGORIES: Record<string, string> = {
  descartaveis: "Descartáveis & Saúde",
  limpeza: "Higiene & Limpeza",
  copa: "Copa & Recepção",
  equipamentos: "Acessórios & Equipamentos",
  escritorio: "Papelaria & Escritório",
};

const MAINTENANCE_CATEGORIES: Record<string, string> = {
  climatizacao: "Ar-Condicionado & Climatização",
  eletrica: "Elétrica & Iluminação",
  hidraulica: "Hidráulica & Encanamento",
  mobiliario: "Maca, Cadeiras & Mobiliário",
  equipamentos: "Equipamentos Clínicos",
  pintura: "Pintura, Paredes & Acabamento",
};

const DEFAULT_EXPENSE_CATEGORIES: Record<string, string> = {
  aluguel_condominio: "Aluguel, Condomínio & IPTU",
  energia: "Energia Elétrica",
  agua: "Água & Saneamento",
  internet: "Internet & Sistemas",
  limpeza: "Serviços de Limpeza / Diarista",
  manutencao: "Manutenção & Reparos",
  insumos: "Reposição de Estoque / Insumos",
  outros: "Outras Despesas Operacionais",
};

const FIXED_CATEGORY_KEYS = new Set([
  "aluguel_condominio",
  "energia",
  "agua",
  "internet",
  "limpeza",
]);

const CHART_COLORS = [
  "#0F172A",
  "#BF4B24",
  "#10B981",
  "#D97706",
  "#475569",
  "#6366F1",
  "#0284C7",
  "#94A3B8",
];

const formatBRL = (val: number) =>
  val.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function calculateSlotUnits(startIso: string, endIso: string): number {
  const diffMinutes =
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60);
  if (diffMinutes <= 0) return 1;
  if (diffMinutes >= 45 && diffMinutes <= 65) return 1;
  return Math.max(1, Math.round(diffMinutes / 55));
}

function slugifyCategory(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/**
 * Compressão ultra-rápida para 1024px (~60KB):
 * Mantém total nitidez para números de cupom fiscal e envia em <0.2s no 4G.
 */
async function compressImageForOCR(
  file: File,
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const resultStr = event.target?.result as string;
      if (!file.type.startsWith("image/")) {
        const rawBase64 = resultStr.split(",")[1] || "";
        resolve({
          base64: rawBase64,
          mimeType: file.type || "application/pdf",
        });
        return;
      }

      const img = new Image();
      img.onload = () => {
        const MAX_DIM = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width);
          width = MAX_DIM;
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height);
          height = MAX_DIM;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          resolve({
            base64: resultStr.split(",")[1] || "",
            mimeType: file.type,
          });
          return;
        }

        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.76);
        resolve({
          base64: dataUrl.split(",")[1] || "",
          mimeType: "image/jpeg",
        });
      };
      img.onerror = () => {
        resolve({
          base64: resultStr.split(",")[1] || "",
          mimeType: file.type || "image/jpeg",
        });
      };
      img.src = resultStr;
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const str = String(reader.result || "");
      resolve(str.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function parseVoiceCommandLocally(
  transcript: string,
  categoriesMap: Record<string, string>,
  roomsList: any[],
) {
  const clean = transcript.trim();
  const lower = clean.toLowerCase();

  let detectedAmount: number | null = null;
  const amountMatches = clean.match(
    /(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})|\d+(?:[.,]\d{1,2})?)\s*(?:reais|real|brl)?/gi,
  );
  if (amountMatches && amountMatches.length > 0) {
    const lastMatch = amountMatches[amountMatches.length - 1];
    const numStr = lastMatch
      .replace(/[^\d,.]/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    const parsed = parseFloat(numStr);
    if (!isNaN(parsed) && parsed > 0) detectedAmount = parsed;
  }

  let matchedRoomId = "";
  for (const r of roomsList) {
    if (r.name && lower.includes(r.name.toLowerCase())) {
      matchedRoomId = r.id;
      break;
    }
  }

  let matchedCatKey = "";
  for (const [key, label] of Object.entries(categoriesMap)) {
    const firstWord = label.split(/[ &/]/)[0].toLowerCase();
    if (
      lower.includes(label.toLowerCase()) ||
      lower.includes(key.toLowerCase()) ||
      (firstWord.length > 3 && lower.includes(firstWord))
    ) {
      matchedCatKey = key;
      break;
    }
  }

  let newCatLabel = "";
  if (!matchedCatKey) {
    const catMatch = clean.match(
      /(?:despesa\s+de|como\s+despesa\s+de|na\s+categoria|categoria)\s+([a-záàâãéêíóôõúç\s]{3,25}?)(?:\s+no\s+valor|\s+de\s+\d|\s+na\s+sala|$)/i,
    );
    if (catMatch?.[1]) {
      const raw = catMatch[1].trim();
      newCatLabel = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    }
  }

  return {
    title: clean.charAt(0).toUpperCase() + clean.slice(1),
    amount: detectedAmount,
    room_id: matchedRoomId,
    category_key: matchedCatKey,
    new_category_label: newCatLabel,
  };
}

export function HostOperationsTab() {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiStatusMessage, setAiStatusMessage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  const [activeSubTab, setActiveSubTab] = useState<
    "expenses" | "inventory" | "maintenance"
  >("expenses");

  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), "yyyy-MM"),
  );
  const [search, setSearch] = useState("");
  const [onlyCriticalStock, setOnlyCriticalStock] = useState(false);
  const [expenseRoomFilter, setExpenseRoomFilter] = useState<string>("all");
  const [expenseCategoryFilter, setExpenseCategoryFilter] =
    useState<string>("all");
  const [allocationMethod, setAllocationMethod] = useState<
    "equal" | "revenue_share"
  >("equal");

  const [rooms, setRooms] = useState<any[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceOrder[]>([]);
  const [expenses, setExpenses] = useState<ClinicExpense[]>([]);
  const [roomRevenuesMap, setRoomRevenuesMap] = useState<
    Record<string, { grossBrl: number; hostNetBrl: number; hours: number }>
  >({});

  const [customCategoriesMap, setCustomCategoriesMap] = useState<
    Record<string, string>
  >({});
  const [isNewCategoryModalOpen, setIsNewCategoryModalOpen] = useState(false);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryCostType, setNewCategoryCostType] = useState<
    "fixed" | "variable"
  >("variable");

  const expenseCategoriesMap = useMemo(() => {
    return {
      ...DEFAULT_EXPENSE_CATEGORIES,
      ...customCategoriesMap,
    };
  }, [customCategoriesMap]);

  // --- MODAIS DE ESTOQUE ---
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState({
    name: "",
    category: "descartaveis",
    room_id: "",
    unit: "un",
    current_quantity: "10",
    min_quantity: "5",
    unit_cost: "",
    supplier: "",
    recordInitialExpense: false,
  });

  const [isRestockModalOpen, setIsRestockModalOpen] = useState(false);
  const [restockTarget, setRestockTarget] = useState<InventoryItem | null>(
    null,
  );
  const [restockMode, setRestockMode] = useState<"in" | "out">("in");
  const [restockQty, setRestockQty] = useState("10");
  const [restockUnitCost, setRestockUnitCost] = useState("");
  const [restockAutoExpense, setRestockAutoExpense] = useState(true);

  // --- MODAL DE MANUTENÇÃO ---
  const [isMaintModalOpen, setIsMaintModalOpen] = useState(false);
  const [editingMaint, setEditingMaint] = useState<MaintenanceOrder | null>(
    null,
  );
  const [maintForm, setMaintForm] = useState({
    title: "",
    room_id: "",
    category: "climatizacao",
    priority: "normal" as "low" | "normal" | "high" | "urgent",
    status: "pending" as "pending" | "in_progress" | "completed" | "cancelled",
    provider_name: "",
    provider_phone: "",
    cost: "",
    scheduled_date: format(new Date(), "yyyy-MM-dd"),
    description: "",
    recordExpenseNow: true,
  });

  // --- MODAL DE DESPESA COM FOTO (OCR), VOZ E CAMPOS PERSONALIZADOS ---
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ClinicExpense | null>(
    null,
  );
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(
    null,
  );
  const [isLightboxPreviewOpen, setIsLightboxPreviewOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const [expenseForm, setExpenseForm] = useState({
    title: "",
    vendor: "",
    category: "manutencao",
    cost_type: "variable" as "fixed" | "variable",
    room_id: "",
    amount: "",
    expense_date: format(new Date(), "yyyy-MM-dd"),
    payment_status: "paid" as "paid" | "pending",
    notes: "",
    custom_fields: [] as CustomFieldItem[],
  });

  useEffect(() => {
    loadOperationsData();
  }, [selectedMonth]);

  const loadOperationsData = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const [yearStr, monthStr] = selectedMonth.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const startOfMonthStr = `${selectedMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endOfMonthStr = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

      const customCats: Record<string, string> = {};
      try {
        const localCats = localStorage.getItem(
          `fusion_custom_exp_cats_${user.id}`,
        );
        if (localCats) Object.assign(customCats, JSON.parse(localCats));
      } catch {}

      const { data: dbCustomCats } = await supabase
        .from("host_expense_categories")
        .select("slug, name")
        .eq("host_id", user.id);

      (dbCustomCats || []).forEach((c: any) => {
        if (c.slug && c.name) customCats[c.slug] = c.name;
      });
      setCustomCategoriesMap(customCats);

      const [roomsRes, invRes, maintRes, expRes] = await Promise.all([
        supabase
          .from("rooms")
          .select("id, name, address_details")
          .eq("host_id", user.id)
          .order("name"),
        supabase
          .from("clinic_inventory_items")
          .select("*")
          .eq("host_id", user.id)
          .order("name"),
        supabase
          .from("clinic_maintenances")
          .select("*")
          .eq("host_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("clinic_expenses")
          .select("*")
          .eq("host_id", user.id)
          .gte("expense_date", startOfMonthStr)
          .lte("expense_date", endOfMonthStr)
          .order("expense_date", { ascending: false }),
      ]);

      const hostRooms = roomsRes.data || [];
      setRooms(hostRooms);
      const roomNameMap = new Map<string, string>(
        hostRooms.map((r: any) => [r.id, r.name]),
      );

      setInventory(
        (invRes.data || []).map((item: any) => ({
          ...item,
          current_quantity: Number(item.current_quantity || 0),
          min_quantity: Number(item.min_quantity || 0),
          unit_cost: Number(item.unit_cost || 0),
          room_name: item.room_id
            ? roomNameMap.get(item.room_id) || "Uso Geral do Hub"
            : "Uso Geral do Hub",
        })),
      );

      setMaintenances(
        (maintRes.data || []).map((m: any) => ({
          ...m,
          cost: Number(m.cost || 0),
          room_name: m.room_id
            ? roomNameMap.get(m.room_id) || "Área Comum / Hub"
            : "Área Comum / Hub",
        })),
      );

      const parsedExpenses: ClinicExpense[] = (expRes.data || []).map(
        (e: any) => {
          if (
            e.category &&
            !DEFAULT_EXPENSE_CATEGORIES[e.category] &&
            !customCats[e.category]
          ) {
            customCats[e.category] =
              e.category.charAt(0).toUpperCase() +
              e.category.slice(1).replace(/_/g, " ");
          }

          return {
            ...e,
            amount: Number(e.amount || 0),
            cost_type:
              e.cost_type ||
              (FIXED_CATEGORY_KEYS.has(e.category) ? "fixed" : "variable"),
            custom_fields: Array.isArray(e.custom_fields)
              ? e.custom_fields
              : [],
            room_name: e.room_id
              ? roomNameMap.get(e.room_id) || "Rateio Geral do Hub"
              : "Rateio Geral do Hub",
          };
        },
      );
      setCustomCategoriesMap({ ...customCats });
      setExpenses(parsedExpenses);

      const revMap: Record<
        string,
        { grossBrl: number; hostNetBrl: number; hours: number }
      > = {};
      hostRooms.forEach((r: any) => {
        revMap[r.id] = { grossBrl: 0, hostNetBrl: 0, hours: 0 };
      });

      const roomIds = hostRooms.map((r: any) => r.id);
      if (roomIds.length > 0) {
        const [bookingsRes, contractsRes] = await Promise.all([
          supabase
            .from("bookings")
            .select(
              "id, room_id, start_time, end_time, total_cost, agreed_value_brl, status, contract_id",
            )
            .in("room_id", roomIds)
            .in("status", ["confirmed", "completed", "in_progress"])
            .gte("start_time", `${startOfMonthStr}T00:00:00`)
            .lte("start_time", `${endOfMonthStr}T23:59:59`),
          supabase
            .from("room_contracts")
            .select("*")
            .in("room_id", roomIds)
            .eq("status", "active"),
        ]);

        (bookingsRes.data || []).forEach((b: any) => {
          if (b.contract_id) return;
          const rObj = hostRooms.find((x: any) => x.id === b.room_id);
          if (!rObj) return;

          const slots = calculateSlotUnits(b.start_time, b.end_time);
          let hourlyRate = 40;
          try {
            const addr =
              typeof rObj.address_details === "string"
                ? JSON.parse(rObj.address_details)
                : rObj.address_details;
            if (Number(addr?.pricing?.hourly) > 0) {
              hourlyRate = Number(addr.pricing.hourly);
            }
          } catch {}

          const gross =
            Number(b.agreed_value_brl) > 0
              ? Number(b.agreed_value_brl)
              : Number(b.total_cost) >= slots * 20
                ? Number(b.total_cost)
                : slots * hourlyRate;

          if (revMap[b.room_id]) {
            revMap[b.room_id].grossBrl += gross;
            revMap[b.room_id].hostNetBrl += gross * 0.8;
            revMap[b.room_id].hours += slots;
          }
        });

        (contractsRes.data || []).forEach((c: any) => {
          const isPaidInMonth =
            c.last_paid_competence === selectedMonth ||
            Boolean(c.schedule_config?.paid_dates?.[selectedMonth]);
          if (isPaidInMonth && revMap[c.room_id]) {
            const cVal = Number(c.contract_value || 0);
            const hostPct = Number(c.host_split_pct ?? 85) / 100;
            revMap[c.room_id].grossBrl += cVal;
            revMap[c.room_id].hostNetBrl += cVal * hostPct;
          }
        });
      }

      setRoomRevenuesMap(revMap);
    } catch (err: any) {
      console.error("Erro ao carregar Controle Interno:", err);
    } finally {
      setLoading(false);
    }
  };

  // ============================================================================
  // LEITURA ULTRA-RÁPIDA DE NOTA (OCR) + COMANDO DE VOZ
  // ============================================================================
  const processReceiptAndVoiceWithAI = async (
    imgFile: File | null,
    audioBlob: Blob | null,
    spokenText: string,
  ) => {
    setAiProcessing(true);
    setAiStatusMessage("Lendo comprovante...");

    try {
      if (spokenText.trim()) {
        const local = parseVoiceCommandLocally(
          spokenText,
          expenseCategoriesMap,
          rooms,
        );

        let targetCategoryKey = local.category_key;
        if (!targetCategoryKey && local.new_category_label) {
          const slug = slugifyCategory(local.new_category_label);
          targetCategoryKey = slug;
          setCustomCategoriesMap((prev) => ({
            ...prev,
            [slug]: local.new_category_label,
          }));
        }

        setExpenseForm((prev) => ({
          ...prev,
          title: prev.title || local.title,
          amount: local.amount !== null ? String(local.amount) : prev.amount,
          room_id: local.room_id || prev.room_id,
          category: targetCategoryKey || prev.category,
        }));
      }

      let imageBase64 = "";
      let imageMimeType = "image/jpeg";
      if (imgFile) {
        const compressed = await compressImageForOCR(imgFile);
        imageBase64 = compressed.base64;
        imageMimeType = compressed.mimeType;
      }

      let audioBase64 = "";
      if (audioBlob && audioBlob.size > 0) {
        audioBase64 = await blobToBase64(audioBlob);
      }

      const res = await fetch("/api/host/parse-expense", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          imageMimeType,
          audioBase64,
          audioMimeType: "audio/webm",
          transcript: spokenText,
          categories: expenseCategoriesMap,
          rooms: rooms.map((r) => ({ id: r.id, name: r.name })),
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        const errMsg = json?.error || `Falha na leitura (${res.status})`;
        setAiStatusMessage(errMsg);
        toast({
          variant: "destructive",
          title: "Não foi possível ler automaticamente",
          description: errMsg,
        });
        return;
      }

      const d = json?.data;
      if (d) {
        let resolvedCategoryKey = d.category_key || "";
        if (resolvedCategoryKey && !expenseCategoriesMap[resolvedCategoryKey]) {
          const label =
            d.category_label ||
            resolvedCategoryKey.charAt(0).toUpperCase() +
              resolvedCategoryKey.slice(1).replace(/_/g, " ");
          const slug = slugifyCategory(label);
          resolvedCategoryKey = slug;
          setCustomCategoriesMap((prev) => ({ ...prev, [slug]: label }));
        }

        const extractedAmount = Number(d.amount || 0);

        setExpenseForm((prev) => ({
          ...prev,
          title: d.title || d.vendor || prev.title || "Despesa de Cupom Fiscal",
          vendor: d.vendor || prev.vendor,
          amount: extractedAmount > 0 ? String(extractedAmount) : prev.amount,
          expense_date: d.expense_date || prev.expense_date,
          category: resolvedCategoryKey || prev.category,
          cost_type: d.cost_type === "fixed" ? "fixed" : prev.cost_type,
          room_id: d.room_id || prev.room_id,
          payment_status: d.payment_status === "pending" ? "pending" : "paid",
          notes: d.notes || prev.notes,
        }));

        setAiStatusMessage(
          `Preenchido: ${d.title || d.vendor || "Nota lida"}${
            extractedAmount > 0 ? ` • R$ ${formatBRL(extractedAmount)}` : ""
          }`,
        );
      }
    } catch (e: any) {
      setAiStatusMessage("Preencha os campos abaixo manualmente.");
    } finally {
      setAiProcessing(false);
    }
  };

  const handleSelectReceiptPhoto = async (file: File | undefined) => {
    if (!file) return;
    setReceiptFile(file);
    setReceiptPreviewUrl(URL.createObjectURL(file));

    if (!isExpenseModalOpen) {
      setEditingExpense(null);
      setExpenseForm({
        title: "",
        vendor: "",
        category: "manutencao",
        cost_type: "variable",
        room_id: "",
        amount: "",
        expense_date: format(new Date(), "yyyy-MM-dd"),
        payment_status: "paid",
        notes: "",
        custom_fields: [],
      });
      setIsExpenseModalOpen(true);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    await processReceiptAndVoiceWithAI(file, null, voiceTranscript);
  };

  const startVoiceRecording = async () => {
    try {
      setVoiceTranscript("");
      audioChunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) audioChunksRef.current.push(ev.data);
      };

      const SpeechRec =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition;

      let liveTranscript = "";
      if (SpeechRec) {
        const rec = new SpeechRec();
        rec.lang = "pt-BR";
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (event: any) => {
          let txt = "";
          for (let i = 0; i < event.results.length; i++) {
            txt += event.results[i][0].transcript + " ";
          }
          liveTranscript = txt.trim();
          setVoiceTranscript(liveTranscript);
        };
        try {
          rec.start();
          speechRecognitionRef.current = rec;
        } catch {}
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch {}
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        if (!isExpenseModalOpen) {
          setEditingExpense(null);
          setIsExpenseModalOpen(true);
        }

        await processReceiptAndVoiceWithAI(
          receiptFile,
          audioBlob,
          liveTranscript,
        );
      };

      recorder.start();
      setIsRecording(true);
    } catch {
      toast({
        variant: "destructive",
        title: "Microfone bloqueado",
        description: "Permita o uso do microfone no navegador.",
      });
    }
  };

  const stopVoiceRecording = () => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  const handleCreateCustomCategory = async () => {
    if (!newCategoryLabel.trim()) return;
    const label = newCategoryLabel.trim();
    const slug = slugifyCategory(label);

    const nextMap = { ...customCategoriesMap, [slug]: label };
    setCustomCategoriesMap(nextMap);

    if (currentUserId) {
      try {
        localStorage.setItem(
          `fusion_custom_exp_cats_${currentUserId}`,
          JSON.stringify(nextMap),
        );
      } catch {}

      await supabase.from("host_expense_categories").insert({
        host_id: currentUserId,
        slug,
        name: label,
        cost_type: newCategoryCostType,
      });
    }

    setExpenseForm((prev) => ({
      ...prev,
      category: slug,
      cost_type: newCategoryCostType,
    }));
    setNewCategoryLabel("");
    setIsNewCategoryModalOpen(false);

    toast({
      title: `Categoria "${label}" criada`,
    });
  };

  // ============================================================================
  // AÇÕES DE DESPESAS MENSAIS E UPLOAD DE COMPROVANTE
  // ============================================================================
  const openNewExpenseModal = () => {
    setEditingExpense(null);
    setReceiptFile(null);
    setReceiptPreviewUrl(null);
    setAiStatusMessage(null);
    setVoiceTranscript("");
    setExpenseForm({
      title: "",
      vendor: "",
      category: "manutencao",
      cost_type: "variable",
      room_id: "",
      amount: "",
      expense_date: format(new Date(), "yyyy-MM-dd"),
      payment_status: "paid",
      notes: "",
      custom_fields: [],
    });
    setIsExpenseModalOpen(true);
  };

  const openEditExpenseModal = (exp: ClinicExpense) => {
    setEditingExpense(exp);
    setReceiptFile(null);
    setReceiptPreviewUrl(exp.receipt_url || null);
    setAiStatusMessage(null);
    setVoiceTranscript("");
    setExpenseForm({
      title: exp.title,
      vendor: exp.vendor || "",
      category: exp.category,
      cost_type:
        exp.cost_type ||
        (FIXED_CATEGORY_KEYS.has(exp.category) ? "fixed" : "variable"),
      room_id: exp.room_id || "",
      amount: String(exp.amount),
      expense_date: exp.expense_date,
      payment_status: exp.payment_status,
      notes: exp.notes || "",
      custom_fields: Array.isArray(exp.custom_fields) ? exp.custom_fields : [],
    });
    setIsExpenseModalOpen(true);
  };

  const handleSaveExpense = async () => {
    const numericAmount = Math.max(
      0,
      Number(String(expenseForm.amount).replace(",", ".")) || 0,
    );
    if (!expenseForm.title.trim() || numericAmount <= 0) {
      return toast({
        variant: "destructive",
        title: "Informe a descrição e o valor da despesa.",
      });
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado.");

      let uploadedReceiptUrl = editingExpense?.receipt_url || null;
      let uploadedReceiptFilename = editingExpense?.receipt_filename || null;

      if (receiptFile) {
        const cleanName = receiptFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const filePath = `receipts/${user.id}/${Date.now()}_${cleanName}`;
        const { error: upErr } = await supabase.storage
          .from("contracts")
          .upload(filePath, receiptFile, { upsert: true });

        if (!upErr) {
          const { data: pubData } = supabase.storage
            .from("contracts")
            .getPublicUrl(filePath);
          uploadedReceiptUrl = pubData.publicUrl;
          uploadedReceiptFilename = receiptFile.name;
        }
      }

      const validCustomFields = expenseForm.custom_fields.filter(
        (cf) => cf.key.trim() !== "" && cf.value.trim() !== "",
      );

      const extendedPayload: Record<string, any> = {
        host_id: user.id,
        room_id: expenseForm.room_id || null,
        title: expenseForm.title.trim(),
        vendor: expenseForm.vendor.trim() || null,
        category: expenseForm.category,
        cost_type: expenseForm.cost_type,
        amount: numericAmount,
        expense_date: expenseForm.expense_date,
        payment_status: expenseForm.payment_status,
        notes: expenseForm.notes.trim() || null,
        receipt_url: uploadedReceiptUrl,
        receipt_filename: uploadedReceiptFilename,
        custom_fields: validCustomFields,
        reference_type: editingExpense?.reference_type || "manual",
      };

      const basePayload: Record<string, any> = {
        host_id: user.id,
        room_id: expenseForm.room_id || null,
        title: expenseForm.title.trim(),
        category: expenseForm.category,
        amount: numericAmount,
        expense_date: expenseForm.expense_date,
        payment_status: expenseForm.payment_status,
        notes: [
          expenseForm.vendor.trim()
            ? `Fornecedor: ${expenseForm.vendor.trim()}`
            : "",
          expenseForm.notes.trim(),
          validCustomFields.map((f) => `${f.key}: ${f.value}`).join(" | "),
        ]
          .filter(Boolean)
          .join(" • "),
        reference_type: editingExpense?.reference_type || "manual",
      };

      if (editingExpense) {
        const { error } = await supabase
          .from("clinic_expenses")
          .update(extendedPayload)
          .eq("id", editingExpense.id);

        if (error) {
          const { error: fallbackErr } = await supabase
            .from("clinic_expenses")
            .update(basePayload)
            .eq("id", editingExpense.id);
          if (fallbackErr) throw fallbackErr;
        }
      } else {
        const { error } = await supabase
          .from("clinic_expenses")
          .insert(extendedPayload);

        if (error) {
          const { error: fallbackErr } = await supabase
            .from("clinic_expenses")
            .insert(basePayload);
          if (fallbackErr) throw fallbackErr;
        }
      }

      const expMonth = expenseForm.expense_date.slice(0, 7);
      if (expMonth && expMonth !== selectedMonth) {
        setSelectedMonth(expMonth);
      }

      toast({
        title: editingExpense
          ? "Despesa atualizada"
          : "Despesa salva com sucesso",
      });
      setIsExpenseModalOpen(false);
      loadOperationsData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar despesa",
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleExpensePaid = async (exp: ClinicExpense) => {
    const nextStatus = exp.payment_status === "paid" ? "pending" : "paid";
    await supabase
      .from("clinic_expenses")
      .update({ payment_status: nextStatus })
      .eq("id", exp.id);
    loadOperationsData();
  };

  const handleDeleteExpense = async (exp: ClinicExpense) => {
    if (!confirm(`Deseja excluir a despesa "${exp.title}"?`)) return;
    await supabase.from("clinic_expenses").delete().eq("id", exp.id);
    toast({ title: "Despesa removida." });
    loadOperationsData();
  };

  // ============================================================================
  // AÇÕES DE ESTOQUE & INSUMOS
  // ============================================================================
  const openNewItemModal = () => {
    setEditingItem(null);
    setItemForm({
      name: "",
      category: "descartaveis",
      room_id: "",
      unit: "un",
      current_quantity: "10",
      min_quantity: "5",
      unit_cost: "",
      supplier: "",
      recordInitialExpense: false,
    });
    setIsItemModalOpen(true);
  };

  const openEditItemModal = (item: InventoryItem) => {
    setEditingItem(item);
    setItemForm({
      name: item.name,
      category: item.category,
      room_id: item.room_id || "",
      unit: item.unit,
      current_quantity: String(item.current_quantity),
      min_quantity: String(item.min_quantity),
      unit_cost: String(item.unit_cost || ""),
      supplier: item.supplier || "",
      recordInitialExpense: false,
    });
    setIsItemModalOpen(true);
  };

  const handleSaveInventoryItem = async () => {
    if (!itemForm.name.trim()) {
      return toast({
        variant: "destructive",
        title: "Informe o nome do insumo.",
      });
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");

      const currQty = Math.max(0, Number(itemForm.current_quantity) || 0);
      const minQty = Math.max(0, Number(itemForm.min_quantity) || 0);
      const uCost = Math.max(0, Number(itemForm.unit_cost) || 0);

      const payload = {
        host_id: user.id,
        room_id: itemForm.room_id || null,
        name: itemForm.name.trim(),
        category: itemForm.category,
        unit: itemForm.unit,
        current_quantity: currQty,
        min_quantity: minQty,
        unit_cost: uCost,
        supplier: itemForm.supplier.trim() || null,
        last_restocked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      let savedId: string | null = null;
      if (editingItem) {
        const { error } = await supabase
          .from("clinic_inventory_items")
          .update(payload)
          .eq("id", editingItem.id);
        if (error) throw error;
        savedId = editingItem.id;
      } else {
        const { data, error } = await supabase
          .from("clinic_inventory_items")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        savedId = data?.id;

        if (itemForm.recordInitialExpense && currQty * uCost > 0) {
          await supabase.from("clinic_expenses").insert({
            host_id: user.id,
            room_id: itemForm.room_id || null,
            title: `Compra Inicial de Estoque: ${itemForm.name.trim()} (${currQty} ${itemForm.unit})`,
            category: "insumos",
            amount: Number((currQty * uCost).toFixed(2)),
            expense_date: format(new Date(), "yyyy-MM-dd"),
            payment_status: "paid",
            reference_type: "inventory",
            reference_id: savedId,
          });
        }
      }

      toast({
        title: editingItem
          ? "Insumo atualizado!"
          : "Insumo cadastrado no estoque!",
      });
      setIsItemModalOpen(false);
      loadOperationsData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar insumo",
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const openStockMovementModal = (item: InventoryItem, mode: "in" | "out") => {
    setRestockTarget(item);
    setRestockMode(mode);
    setRestockQty(
      mode === "in"
        ? String(Math.max(5, item.min_quantity * 2 - item.current_quantity))
        : "1",
    );
    setRestockUnitCost(String(item.unit_cost || ""));
    setRestockAutoExpense(mode === "in");
    setIsRestockModalOpen(true);
  };

  const handleConfirmStockMovement = async () => {
    if (!restockTarget) return;
    const qty = Math.max(0.1, Number(restockQty) || 0);
    const newUnitCost =
      restockMode === "in"
        ? Math.max(0, Number(restockUnitCost) || restockTarget.unit_cost)
        : restockTarget.unit_cost;

    const updatedQty =
      restockMode === "in"
        ? restockTarget.current_quantity + qty
        : Math.max(0, restockTarget.current_quantity - qty);

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado.");

      const { error } = await supabase
        .from("clinic_inventory_items")
        .update({
          current_quantity: updatedQty,
          unit_cost: newUnitCost,
          last_restocked_at:
            restockMode === "in"
              ? new Date().toISOString()
              : restockTarget.last_restocked_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", restockTarget.id);

      if (error) throw error;

      const totalPurchaseCost = Number((qty * newUnitCost).toFixed(2));
      if (restockMode === "in" && restockAutoExpense && totalPurchaseCost > 0) {
        await supabase.from("clinic_expenses").insert({
          host_id: user.id,
          room_id: restockTarget.room_id || null,
          title: `Reposição de Estoque: ${restockTarget.name} (+${qty} ${restockTarget.unit})`,
          category: "insumos",
          amount: totalPurchaseCost,
          expense_date: format(new Date(), "yyyy-MM-dd"),
          payment_status: "paid",
          reference_type: "inventory",
          reference_id: restockTarget.id,
        });
      }

      toast({
        title:
          restockMode === "in"
            ? "Estoque reposto com sucesso!"
            : "Baixa de consumo registrada!",
      });

      setIsRestockModalOpen(false);
      loadOperationsData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao movimentar estoque",
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInventoryItem = async (item: InventoryItem) => {
    if (!confirm(`Deseja remover "${item.name}" da lista de controle?`)) return;
    await supabase.from("clinic_inventory_items").delete().eq("id", item.id);
    toast({ title: "Item removido." });
    loadOperationsData();
  };

  // ============================================================================
  // AÇÕES DE MANUTENÇÃO
  // ============================================================================
  const openNewMaintModal = () => {
    setEditingMaint(null);
    setMaintForm({
      title: "",
      room_id: "",
      category: "climatizacao",
      priority: "normal",
      status: "pending",
      provider_name: "",
      provider_phone: "",
      cost: "",
      scheduled_date: format(new Date(), "yyyy-MM-dd"),
      description: "",
      recordExpenseNow: true,
    });
    setIsMaintModalOpen(true);
  };

  const openEditMaintModal = (m: MaintenanceOrder) => {
    setEditingMaint(m);
    setMaintForm({
      title: m.title,
      room_id: m.room_id || "",
      category: m.category,
      priority: m.priority,
      status: m.status,
      provider_name: m.provider_name || "",
      provider_phone: m.provider_phone || "",
      cost: String(m.cost || ""),
      scheduled_date: m.scheduled_date || format(new Date(), "yyyy-MM-dd"),
      description: m.description || "",
      recordExpenseNow: false,
    });
    setIsMaintModalOpen(true);
  };

  const handleSaveMaintenance = async () => {
    if (!maintForm.title.trim()) {
      return toast({
        variant: "destructive",
        title: "Informe o título do serviço ou manutenção.",
      });
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado.");

      const costVal = Math.max(0, Number(maintForm.cost) || 0);
      const isCompleted = maintForm.status === "completed";

      const payload = {
        host_id: user.id,
        room_id: maintForm.room_id || null,
        title: maintForm.title.trim(),
        description: maintForm.description.trim() || null,
        category: maintForm.category,
        priority: maintForm.priority,
        status: maintForm.status,
        provider_name: maintForm.provider_name.trim() || null,
        provider_phone: maintForm.provider_phone.trim() || null,
        cost: costVal,
        scheduled_date: maintForm.scheduled_date || null,
        completed_at: isCompleted ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      };

      let savedMaintId: string | null = null;
      if (editingMaint) {
        const { error } = await supabase
          .from("clinic_maintenances")
          .update(payload)
          .eq("id", editingMaint.id);
        if (error) throw error;
        savedMaintId = editingMaint.id;
      } else {
        const { data, error } = await supabase
          .from("clinic_maintenances")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        savedMaintId = data?.id;
      }

      if (maintForm.recordExpenseNow && costVal > 0 && savedMaintId) {
        await supabase.from("clinic_expenses").insert({
          host_id: user.id,
          room_id: maintForm.room_id || null,
          title: `Manutenção: ${maintForm.title.trim()}`,
          category: "manutencao",
          amount: costVal,
          expense_date:
            maintForm.scheduled_date || format(new Date(), "yyyy-MM-dd"),
          payment_status: isCompleted ? "paid" : "pending",
          reference_type: "maintenance",
          reference_id: savedMaintId,
          notes: maintForm.provider_name
            ? `Prestador: ${maintForm.provider_name}`
            : null,
        });
      }

      toast({
        title: editingMaint
          ? "Ordem de manutenção atualizada!"
          : "Manutenção registrada com sucesso!",
      });
      setIsMaintModalOpen(false);
      loadOperationsData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar manutenção",
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleMarkMaintCompleted = async (m: MaintenanceOrder) => {
    try {
      const { error } = await supabase
        .from("clinic_maintenances")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", m.id);
      if (error) throw error;

      toast({
        title: "Manutenção concluída!",
        description: `"${m.title}" foi marcada como finalizada.`,
      });
      loadOperationsData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err.message,
      });
    }
  };

  const handleDeleteMaint = async (m: MaintenanceOrder) => {
    if (!confirm(`Excluir o registro de manutenção "${m.title}"?`)) return;
    await supabase.from("clinic_maintenances").delete().eq("id", m.id);
    toast({ title: "Manutenção excluída." });
    loadOperationsData();
  };

  const handleExportExpensesCSV = () => {
    if (expenses.length === 0) {
      return toast({ title: "Sem despesas registradas neste mês." });
    }
    const headers = [
      "Data",
      "Descrição",
      "Fornecedor",
      "Categoria",
      "Sala / Alocação",
      "Status",
      "Valor (R$)",
      "Comprovante",
      "Observações",
    ];
    const rows = expenses.map((e) => [
      format(parseISO(e.expense_date), "dd/MM/yyyy"),
      e.title,
      e.vendor || "",
      expenseCategoriesMap[e.category] || e.category,
      e.room_name || "Rateio Geral do Hub",
      e.payment_status === "paid" ? "Pago" : "Pendente",
      e.amount.toFixed(2).replace(".", ","),
      e.receipt_url || "",
      e.notes || "",
    ]);

    const csvContent = [
      headers.join(";"),
      ...rows.map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"),
      ),
    ].join("\n");

    const blob = new Blob(["\ufeff", csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Custos_Hub_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ============================================================================
  // KPIS OPERACIONAIS, GRÁFICOS E RATEIO DO HUB POR SALA
  // ============================================================================
  const criticalItems = inventory.filter(
    (i) => i.current_quantity <= i.min_quantity,
  );
  const totalStockValue = inventory.reduce(
    (acc, curr) => acc + curr.current_quantity * curr.unit_cost,
    0,
  );
  const estimatedRestockBudget = criticalItems.reduce((acc, curr) => {
    const needed = Math.max(1, curr.min_quantity * 2 - curr.current_quantity);
    return acc + needed * curr.unit_cost;
  }, 0);

  const openMaintenances = maintenances.filter(
    (m) => m.status === "pending" || m.status === "in_progress",
  );
  const urgentMaintenances = openMaintenances.filter(
    (m) => m.priority === "urgent" || m.priority === "high",
  );

  const totalMonthExpenses = expenses.reduce(
    (acc, curr) => acc + curr.amount,
    0,
  );
  const paidMonthExpenses = expenses
    .filter((e) => e.payment_status === "paid")
    .reduce((acc, curr) => acc + curr.amount, 0);
  const pendingMonthExpenses = expenses
    .filter((e) => e.payment_status === "pending")
    .reduce((acc, curr) => acc + curr.amount, 0);

  const hubCostAnalytics = useMemo(() => {
    const totalHostRevenueNet = Object.values(roomRevenuesMap).reduce(
      (acc, r) => acc + r.hostNetBrl,
      0,
    );

    let sharedHubExpenses = 0;
    let directRoomExpenses = 0;
    const byCategoryMap = new Map<string, number>();
    const directByRoomMap = new Map<string, number>();

    expenses.forEach((e) => {
      const val = Number(e.amount || 0);
      if (e.room_id) {
        directRoomExpenses += val;
        directByRoomMap.set(
          e.room_id,
          (directByRoomMap.get(e.room_id) || 0) + val,
        );
      } else {
        sharedHubExpenses += val;
      }

      const catLabel = expenseCategoriesMap[e.category] || e.category;
      byCategoryMap.set(catLabel, (byCategoryMap.get(catLabel) || 0) + val);
    });

    const categoryChartData = Array.from(byCategoryMap.entries())
      .map(([name, amount], idx) => ({
        name,
        amount,
        pct:
          totalMonthExpenses > 0
            ? Math.round((amount / totalMonthExpenses) * 100)
            : 0,
        color: CHART_COLORS[idx % CHART_COLORS.length],
      }))
      .sort((a, b) => b.amount - a.amount);

    const activeRoomsCount = Math.max(1, rooms.length);
    const roomDistribution = rooms.map((r) => {
      const hostNetRevenue = roomRevenuesMap[r.id]?.hostNetBrl || 0;
      const directCost = directByRoomMap.get(r.id) || 0;
      const allocatedSharedCost =
        allocationMethod === "revenue_share" && totalHostRevenueNet > 0
          ? sharedHubExpenses * (hostNetRevenue / totalHostRevenueNet)
          : sharedHubExpenses / activeRoomsCount;

      const totalRoomCost = directCost + allocatedSharedCost;
      const netProfit = hostNetRevenue - totalRoomCost;

      return {
        roomId: r.id,
        roomName: r.name,
        hostNetRevenue,
        directCost,
        allocatedSharedCost,
        totalRoomCost,
        netProfit,
      };
    });

    return {
      totalHostRevenueNet,
      sharedHubExpenses,
      directRoomExpenses,
      netHubProfit: totalHostRevenueNet - totalMonthExpenses,
      categoryChartData,
      roomDistribution,
    };
  }, [
    expenses,
    roomRevenuesMap,
    rooms,
    expenseCategoriesMap,
    totalMonthExpenses,
    allocationMethod,
  ]);

  const q = search.toLowerCase();
  const filteredInventory = inventory.filter((i) => {
    if (onlyCriticalStock && i.current_quantity > i.min_quantity) return false;
    return (
      i.name.toLowerCase().includes(q) ||
      (i.supplier || "").toLowerCase().includes(q) ||
      (i.room_name || "").toLowerCase().includes(q)
    );
  });

  const filteredMaintenances = maintenances.filter(
    (m) =>
      m.title.toLowerCase().includes(q) ||
      (m.provider_name || "").toLowerCase().includes(q) ||
      (m.room_name || "").toLowerCase().includes(q),
  );

  const filteredExpenses = expenses.filter((e) => {
    if (expenseRoomFilter === "hub_shared" && e.room_id !== null) return false;
    if (
      expenseRoomFilter !== "all" &&
      expenseRoomFilter !== "hub_shared" &&
      e.room_id !== expenseRoomFilter
    ) {
      return false;
    }
    if (
      expenseCategoryFilter !== "all" &&
      e.category !== expenseCategoryFilter
    ) {
      return false;
    }
    return (
      e.title.toLowerCase().includes(q) ||
      (e.vendor || "").toLowerCase().includes(q) ||
      (expenseCategoriesMap[e.category] || e.category)
        .toLowerCase()
        .includes(q) ||
      (e.room_name || "").toLowerCase().includes(q)
    );
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-6 lg:p-8 animate-in fade-in duration-300 max-w-7xl mx-auto w-full pb-32 font-sans overflow-x-hidden">
      {/* HEADER E SELETOR DE COMPETÊNCIA MENSAL */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-5">
        <div>
          <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-widest text-[#BF4B24]">
            Gestão Operacional do Anfitrião
          </span>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 tracking-tight mt-0.5">
            Central de Custos & Rateio do Hub
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Leia notas por foto, grave despesas por voz e acompanhe o custo real
            de cada sala.
          </p>
        </div>

        <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-2xs self-start sm:self-auto">
          <CalendarIcon className="w-4 h-4 text-[#BF4B24] mr-2 shrink-0" />
          <span className="text-[11px] font-bold text-slate-500 mr-2 uppercase">
            Mês:
          </span>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs sm:text-sm font-bold text-slate-900 outline-none bg-transparent"
          />
        </div>
      </div>

      {/* ==================================================================== */}
      {/* DOCK DE CAPTURA RÁPIDA MOBILE-FIRST (FOTO DA NOTA + COMANDO DE VOZ)  */}
      {/* ==================================================================== */}
      <div className="mb-5 bg-[#FAF7F4] border border-stone-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-0.5">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#BF4B24]">
              <Sparkles className="w-3.5 h-3.5" />
              Captura Inteligente Instantânea
            </div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">
              Tire foto do cupom fiscal ou grave por voz
            </h2>
            <p className="text-xs text-slate-600">
              O sistema extrai o valor, data, fornecedor e categoria em menos de
              2 segundos.
            </p>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            className="hidden"
            onChange={(e) => handleSelectReceiptPhoto(e.target.files?.[0])}
          />

          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5">
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={aiProcessing}
              className="h-11 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs cursor-pointer shadow-2xs"
            >
              {aiProcessing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Camera className="w-4 h-4 mr-2 text-[#BF4B24] shrink-0" />
              )}
              <span className="truncate">Ler Nota (Foto)</span>
            </Button>

            {!isRecording ? (
              <Button
                type="button"
                variant="outline"
                onClick={startVoiceRecording}
                disabled={aiProcessing}
                className="h-11 px-4 rounded-xl border-stone-300 bg-white hover:bg-stone-50 text-slate-900 font-semibold text-xs cursor-pointer shadow-2xs"
              >
                <Mic className="w-4 h-4 mr-2 text-[#BF4B24] shrink-0" />
                <span className="truncate">Lançar por Voz</span>
              </Button>
            ) : (
              <Button
                type="button"
                onClick={stopVoiceRecording}
                className="h-11 px-4 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs animate-pulse cursor-pointer"
              >
                <Square className="w-3.5 h-3.5 mr-2 fill-white shrink-0" />
                <span>Parar Áudio</span>
              </Button>
            )}

            <Button
              type="button"
              onClick={openNewExpenseModal}
              className="col-span-2 sm:col-span-1 h-10 sm:h-11 px-4 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-semibold text-xs cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Lançamento Manual
            </Button>
          </div>
        </div>

        {isRecording && (
          <div className="mt-3 p-3 rounded-xl bg-white border border-red-200 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping shrink-0" />
              <span className="text-slate-700 truncate italic">
                {voiceTranscript ||
                  "Ex: Despesa de manutenção na Sala 1 de 180 reais..."}
              </span>
            </div>
            <span className="text-[11px] font-bold text-red-600 shrink-0">
              Ouvindo
            </span>
          </div>
        )}
      </div>

      {/* KPIS COMPACTOS (2x2 NO MOBILE, 4 COLUNAS NO DESKTOP) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-5 tabular-nums">
        <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-medium text-slate-400">
              Custos no Mês
            </span>
            <TrendingDown className="w-4 h-4 text-orange-400 shrink-0" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-white truncate">
            R$ {formatBRL(totalMonthExpenses)}
          </p>
          <p className="text-[10px] sm:text-[11px] text-emerald-400 font-medium mt-1 truncate">
            Pago: R$ {formatBRL(paidMonthExpenses)}
          </p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-500">
              Rateio / Sala
            </span>
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-slate-900 truncate">
            R${" "}
            {formatBRL(
              rooms.length > 0 ? totalMonthExpenses / rooms.length : 0,
            )}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1 truncate">
            Líquido Hub:{" "}
            <strong
              className={
                hubCostAnalytics.netHubProfit >= 0
                  ? "text-emerald-700"
                  : "text-red-600"
              }
            >
              R$ {formatBRL(hubCostAnalytics.netHubProfit)}
            </strong>
          </p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-500">
              Estoque Atual
            </span>
            <Package className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-slate-900 truncate">
            R$ {formatBRL(totalStockValue)}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1 truncate">
            {criticalItems.length > 0
              ? `${criticalItems.length} item(ns) crítico(s)`
              : `${inventory.length} itens ok`}
          </p>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/90">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-500">
              Manutenções
            </span>
            <Wrench className="w-4 h-4 text-[#BF4B24] shrink-0" />
          </div>
          <p className="text-lg sm:text-2xl font-bold text-slate-900">
            {openMaintenances.length}
          </p>
          <p className="text-[10px] sm:text-[11px] text-slate-500 mt-1 truncate">
            {urgentMaintenances.length > 0
              ? `${urgentMaintenances.length} urgente(s)`
              : "Em dia"}
          </p>
        </div>
      </div>

      {/* BARRA DE NAVEGAÇÃO INTERNA DAS 3 SUB-ABAS */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-2.5 sm:p-3 mb-5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5">
        <div className="grid grid-cols-3 sm:flex bg-slate-100 p-1 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveSubTab("expenses")}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === "expenses"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Receipt className="w-3.5 h-3.5 text-[#BF4B24] shrink-0" />
            <span className="truncate">Despesas ({expenses.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("inventory")}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === "inventory"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Package className="w-3.5 h-3.5 text-[#BF4B24] shrink-0" />
            <span className="truncate">Estoque ({inventory.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("maintenance")}
            className={`flex items-center justify-center gap-1.5 px-2.5 sm:px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeSubTab === "maintenance"
                ? "bg-white text-slate-900 shadow-2xs"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-[#BF4B24] shrink-0" />
            <span className="truncate">Manutenção ({maintenances.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar registro..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9 text-xs rounded-xl border-slate-200"
            />
          </div>

          {activeSubTab === "inventory" && (
            <Button
              onClick={openNewItemModal}
              className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-semibold text-xs h-9 rounded-xl shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Insumo
            </Button>
          )}

          {activeSubTab === "maintenance" && (
            <Button
              onClick={openNewMaintModal}
              className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-semibold text-xs h-9 rounded-xl shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Reparo
            </Button>
          )}

          {activeSubTab === "expenses" && (
            <Button
              variant="outline"
              onClick={handleExportExpensesCSV}
              className="h-9 rounded-xl font-semibold text-xs border-slate-200 text-slate-700 shrink-0 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1 text-emerald-600" />
              CSV
            </Button>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SUB-ABA 1: DESPESAS DO MÊS, GRÁFICOS E RATEIO DO HUB POR SALA        */}
      {/* ==================================================================== */}
      {activeSubTab === "expenses" && (
        <div className="space-y-5">
          {/* LISTA DE DESPESAS (PRIMEIRO NO MOBILE PARA ACESSO IMEDIATO) */}
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
            <div className="p-4 sm:px-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Lançamentos do Mês ({filteredExpenses.length})
                </span>
                <button
                  type="button"
                  onClick={() => setIsNewCategoryModalOpen(true)}
                  className="sm:hidden text-xs font-bold text-[#BF4B24]"
                >
                  + Nova Categoria
                </button>
              </div>

              <div className="grid grid-cols-2 sm:flex items-center gap-2">
                <select
                  value={expenseRoomFilter}
                  onChange={(e) => setExpenseRoomFilter(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
                >
                  <option value="all">Todas as Salas</option>
                  <option value="hub_shared">Rateio do Hub</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>

                <select
                  value={expenseCategoryFilter}
                  onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
                >
                  <option value="all">Categorias</option>
                  {Object.entries(expenseCategoriesMap).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {filteredExpenses.length === 0 ? (
              <div className="py-12 text-center px-4">
                <Receipt className="w-9 h-9 text-slate-200 mx-auto mb-2" />
                <p className="font-bold text-slate-700 text-xs sm:text-sm">
                  Nenhuma despesa registrada em {selectedMonth}.
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Toque em “Ler Nota (Foto)” acima para registrar seu primeiro
                  comprovante.
                </p>
              </div>
            ) : (
              <>
                {/* VISÃO MOBILE: CARDS COMPACTOS SEM ROLAGEM HORIZONTAL */}
                <div className="md:hidden divide-y divide-slate-100">
                  {filteredExpenses.map((exp) => (
                    <div key={exp.id} className="p-4 space-y-2.5 tabular-nums">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 text-sm truncate">
                            {exp.title}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate">
                            {format(parseISO(exp.expense_date), "dd/MM/yyyy")} •{" "}
                            {exp.room_name}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-sm font-black text-slate-900 block">
                            R$ {formatBRL(exp.amount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleToggleExpensePaid(exp)}
                            className={`text-[10px] font-bold ${
                              exp.payment_status === "paid"
                                ? "text-emerald-700"
                                : "text-amber-700"
                            }`}
                          >
                            {exp.payment_status === "paid"
                              ? "✓ Pago"
                              : "⏳ Pendente"}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Badge className="bg-slate-100 text-slate-700 border-0 font-semibold text-[10px]">
                            {expenseCategoriesMap[exp.category] || exp.category}
                          </Badge>
                          {exp.receipt_url && (
                            <a
                              href={exp.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[10px]"
                            >
                              <FileCheck2 className="w-3 h-3" /> Nota
                            </a>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditExpenseModal(exp)}
                            className="h-7 w-7 text-slate-500"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteExpense(exp)}
                            className="h-7 w-7 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* VISÃO DESKTOP: TABELA COMPLETA */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
                    <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] border-b border-slate-200">
                      <tr>
                        <th className="px-6 py-3.5">Data</th>
                        <th className="px-6 py-3.5">Descrição & Detalhes</th>
                        <th className="px-6 py-3.5">Categoria</th>
                        <th className="px-6 py-3.5">Alocação / Sala</th>
                        <th className="px-6 py-3.5 text-center">
                          Nota / Anexo
                        </th>
                        <th className="px-6 py-3.5 text-center">Status</th>
                        <th className="px-6 py-3.5 text-right">Valor (R$)</th>
                        <th className="px-6 py-3.5 text-center">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredExpenses.map((exp) => (
                        <tr key={exp.id} className="hover:bg-slate-50">
                          <td className="px-6 py-4 font-semibold text-slate-600">
                            {format(parseISO(exp.expense_date), "dd/MM/yyyy")}
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-bold text-slate-900">
                              {exp.title}
                            </p>
                            {(exp.vendor || exp.notes) && (
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                {[exp.vendor, exp.notes]
                                  .filter(Boolean)
                                  .join(" • ")}
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <Badge className="bg-slate-100 text-slate-700 border-0 font-semibold text-[11px]">
                              {expenseCategoriesMap[exp.category] ||
                                exp.category}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-600">
                            {exp.room_name}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {exp.receipt_url ? (
                              <a
                                href={exp.receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold text-[11px] hover:bg-emerald-100"
                              >
                                <FileCheck2 className="w-3.5 h-3.5" />
                                Ver Nota
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-slate-300 text-[11px]">
                                —
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleExpensePaid(exp)}
                            >
                              {exp.payment_status === "paid" ? (
                                <Badge className="bg-emerald-50 text-emerald-700 border-0 font-semibold cursor-pointer">
                                  <CheckCircle2 className="w-3 h-3 mr-1" /> Pago
                                </Badge>
                              ) : (
                                <Badge className="bg-amber-50 text-amber-800 border-0 font-semibold cursor-pointer">
                                  <Clock className="w-3 h-3 mr-1" /> Pendente
                                </Badge>
                              )}
                            </button>
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-900">
                            R$ {formatBRL(exp.amount)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditExpenseModal(exp)}
                                className="h-8 w-8 text-slate-500 hover:text-slate-900"
                              >
                                <Edit3 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteExpense(exp)}
                                className="h-8 w-8 text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* GRÁFICOS VISUAIS E RATEIO DO HUB POR SALA */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="xl:col-span-2 bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/90 flex flex-col justify-between">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Rateio de Custos do Hub por Sala
                  </h2>
                  <p className="text-xs text-slate-500">
                    Repasse líquido de cada sala vs. custo direto + rateio do
                    Hub.
                  </p>
                </div>

                <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start">
                  <button
                    type="button"
                    onClick={() => setAllocationMethod("equal")}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      allocationMethod === "equal"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600"
                    }`}
                  >
                    Igualitário
                  </button>
                  <button
                    type="button"
                    onClick={() => setAllocationMethod("revenue_share")}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                      allocationMethod === "revenue_share"
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600"
                    }`}
                  >
                    Por Receita
                  </button>
                </div>
              </div>

              {rooms.length > 0 ? (
                <>
                  <div className="h-[200px] sm:h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={hubCostAnalytics.roomDistribution}
                        margin={{ top: 10, right: 10, left: -18, bottom: 0 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          vertical={false}
                          stroke="#F1F5F9"
                        />
                        <XAxis
                          dataKey="roomName"
                          axisLine={false}
                          tickLine={false}
                          tick={{
                            fontSize: 10,
                            fill: "#64748B",
                            fontWeight: 600,
                          }}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 10, fill: "#64748B" }}
                          tickFormatter={(v) => `R$${v}`}
                        />
                        <RechartsTooltip
                          formatter={(value: any, name: any) => [
                            `R$ ${formatBRL(Number(value || 0))}`,
                            name === "hostNetRevenue"
                              ? "Repasse da Sala"
                              : "Custo Total (Direto + Rateio)",
                          ]}
                        />
                        <Bar
                          dataKey="hostNetRevenue"
                          name="hostNetRevenue"
                          fill="#0F172A"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={32}
                        />
                        <Bar
                          dataKey="totalRoomCost"
                          name="totalRoomCost"
                          fill="#BF4B24"
                          radius={[6, 6, 0, 0]}
                          maxBarSize={32}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
                      <thead className="text-slate-400 font-semibold text-[10px] uppercase">
                        <tr>
                          <th className="pb-2 pr-2">Sala</th>
                          <th className="pb-2 px-2 text-right">Repasse</th>
                          <th className="pb-2 px-2 text-right">Direto</th>
                          <th className="pb-2 px-2 text-right">Rateio Hub</th>
                          <th className="pb-2 pl-2 text-right">Resultado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {hubCostAnalytics.roomDistribution.map((rm) => (
                          <tr key={rm.roomId}>
                            <td className="py-2 pr-2 font-bold text-slate-900">
                              {rm.roomName}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-700">
                              R$ {formatBRL(rm.hostNetRevenue)}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-600">
                              -R$ {formatBRL(rm.directCost)}
                            </td>
                            <td className="py-2 px-2 text-right text-slate-500">
                              -R$ {formatBRL(rm.allocatedSharedCost)}
                            </td>
                            <td
                              className={`py-2 pl-2 text-right font-bold ${
                                rm.netProfit >= 0
                                  ? "text-emerald-700"
                                  : "text-red-600"
                              }`}
                            >
                              R$ {formatBRL(rm.netProfit)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-xs text-slate-400 py-10 text-center">
                  Nenhuma sala vinculada para cálculo de rateio.
                </p>
              )}
            </div>

            <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/90 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    Despesas por Categoria
                  </h2>
                  <p className="text-xs text-slate-500">
                    Divisão em {selectedMonth}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewCategoryModalOpen(true)}
                  className="text-xs font-bold text-[#BF4B24] hover:underline cursor-pointer"
                >
                  + Categoria
                </button>
              </div>

              <div className="flex-1 flex items-center justify-center my-2">
                {hubCostAnalytics.categoryChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie
                        data={hubCostAnalytics.categoryChartData}
                        innerRadius={48}
                        outerRadius={72}
                        paddingAngle={3}
                        dataKey="amount"
                      >
                        {hubCostAnalytics.categoryChartData.map((entry, i) => (
                          <Cell key={`c-${i}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(val: any, _n: any, props: any) => [
                          `R$ ${formatBRL(Number(val))} (${props.payload.pct}%)`,
                          props.payload.name,
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-xs text-slate-400 py-10">
                    Sem despesas neste mês.
                  </p>
                )}
              </div>

              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1 tabular-nums">
                {hubCostAnalytics.categoryChartData.map((cat) => (
                  <div
                    key={cat.name}
                    className="flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2 truncate pr-2">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium text-slate-700 truncate">
                        {cat.name}
                      </span>
                    </div>
                    <span className="font-bold text-slate-900 shrink-0">
                      R$ {formatBRL(cat.amount)} ({cat.pct}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-ABA 2: ESTOQUE & REPOSIÇÃO CRÍTICA                               */}
      {/* ==================================================================== */}
      {activeSubTab === "inventory" && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
            <p className="text-xs font-semibold text-slate-500">
              Atualize rapidamente o estoque diário da clínica.
            </p>
            <label className="flex items-center gap-2 text-xs font-bold text-red-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyCriticalStock}
                onChange={(e) => setOnlyCriticalStock(e.target.checked)}
                className="rounded accent-red-600"
              />
              Apenas estoque crítico ({criticalItems.length})
            </label>
          </div>

          {filteredInventory.length === 0 ? (
            <div className="py-14 text-center px-4">
              <Package className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="font-bold text-slate-600 text-sm">
                Nenhum item de estoque encontrado.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredInventory.map((item) => {
                const isCritical = item.current_quantity <= item.min_quantity;
                return (
                  <div
                    key={item.id}
                    className={`p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isCritical ? "bg-red-50/40" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-slate-900 text-sm truncate">
                          {item.name}
                        </p>
                        {isCritical && (
                          <Badge className="bg-red-100 text-red-800 border-0 text-[10px] font-bold">
                            Crítico
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {item.room_name} • Mínimo: {item.min_quantity}{" "}
                        {item.unit} • Unit: R$ {formatBRL(item.unit_cost)}
                      </p>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 tabular-nums">
                      <span
                        className={`text-sm font-black ${
                          isCritical ? "text-red-600" : "text-slate-900"
                        }`}
                      >
                        {item.current_quantity} {item.unit}
                      </span>

                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openStockMovementModal(item, "out")}
                          className="h-8 px-2.5 border-slate-200 text-slate-700 font-semibold text-xs"
                        >
                          <Minus className="w-3.5 h-3.5 mr-1" /> Baixa
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openStockMovementModal(item, "in")}
                          className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Repor
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditItemModal(item)}
                          className="h-8 w-8 text-slate-500"
                        >
                          <Edit3 className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDeleteInventoryItem(item)}
                          className="h-8 w-8 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-ABA 3: MANUTENÇÃO & INFRAESTRUTURA DAS SALAS                     */}
      {/* ==================================================================== */}
      {activeSubTab === "maintenance" && (
        <div className="space-y-3">
          {filteredMaintenances.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl py-14 text-center px-4">
              <Wrench className="w-10 h-10 text-slate-200 mx-auto mb-2" />
              <p className="font-bold text-slate-600 text-sm">
                Nenhuma ordem de manutenção registrada.
              </p>
            </div>
          ) : (
            filteredMaintenances.map((m) => (
              <div
                key={m.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">
                      {m.title}
                    </h3>
                    <Badge className="bg-slate-100 text-slate-700 border-0 text-[10px] font-semibold">
                      {m.room_name}
                    </Badge>
                    {m.status === "completed" ? (
                      <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[10px] font-semibold">
                        Concluída
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-800 border-0 text-[10px] font-semibold">
                        Pendente
                      </Badge>
                    )}
                  </div>
                  {m.description && (
                    <p className="text-xs text-slate-600">{m.description}</p>
                  )}
                </div>

                <div className="flex items-center justify-between md:justify-end gap-3 border-t md:border-t-0 pt-2.5 md:pt-0 border-slate-100 tabular-nums">
                  <span className="text-sm font-bold text-slate-900">
                    R$ {formatBRL(m.cost)}
                  </span>
                  <div className="flex items-center gap-1.5">
                    {m.status !== "completed" && (
                      <Button
                        size="sm"
                        onClick={() => handleMarkMaintCompleted(m)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs h-8 rounded-xl"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Concluir
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openEditMaintModal(m)}
                      className="h-8 w-8 rounded-xl border-slate-200"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-slate-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteMaint(m)}
                      className="h-8 w-8 rounded-xl text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* DRAWER / MODAL DE DESPESA (100% RESPONSIVO NO MOBILE E DESKTOP)      */}
      {/* ==================================================================== */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-0 sm:p-4 animate-in fade-in duration-150">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
            {/* Cabeçalho Fixo */}
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between shrink-0 bg-white">
              <div className="min-w-0 pr-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                  {editingExpense
                    ? "Editar Despesa do Hub"
                    : "Lançar Despesa Operacional"}
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  Fotografe a nota, fale no microfone ou revise os campos.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Corpo Rolável sem corte lateral */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 min-w-0">
              {/* Barra Compacta de Captura (Foto + Voz + Miniatura da Nota) */}
              <div className="p-3 rounded-2xl bg-[#FAF7F4] border border-stone-200/90 space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={aiProcessing}
                    className="h-9 rounded-xl bg-slate-900 text-white text-xs font-semibold cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5 mr-1.5 text-[#BF4B24] shrink-0" />
                    <span className="truncate">
                      {receiptPreviewUrl ? "Trocar Foto" : "Fotografar Nota"}
                    </span>
                  </Button>

                  {!isRecording ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={startVoiceRecording}
                      disabled={aiProcessing}
                      className="h-9 rounded-xl border-stone-300 bg-white text-slate-800 text-xs font-semibold cursor-pointer"
                    >
                      <Mic className="w-3.5 h-3.5 mr-1.5 text-[#BF4B24] shrink-0" />
                      <span className="truncate">Falar Comando</span>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      size="sm"
                      onClick={stopVoiceRecording}
                      className="h-9 rounded-xl bg-red-600 text-white text-xs font-bold animate-pulse cursor-pointer"
                    >
                      <Square className="w-3 h-3 mr-1.5 fill-white shrink-0" />
                      <span>Parar Áudio</span>
                    </Button>
                  )}
                </div>

                {/* Miniatura Horizontal da Nota + Status da IA */}
                {(receiptPreviewUrl || aiProcessing || aiStatusMessage) && (
                  <div className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-white border border-stone-200/80">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {receiptPreviewUrl && (
                        <div
                          onClick={() => setIsLightboxPreviewOpen(true)}
                          className="relative w-11 h-11 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 shrink-0 cursor-pointer"
                        >
                          <img
                            src={receiptPreviewUrl}
                            alt="Nota"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        {aiProcessing ? (
                          <div className="flex items-center gap-1.5 text-xs font-bold text-[#BF4B24]">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                            <span className="truncate">
                              Extraindo dados da nota...
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs font-semibold text-slate-800 truncate">
                            {aiStatusMessage || "Comprovante anexado"}
                          </p>
                        )}
                        {receiptPreviewUrl && (
                          <button
                            type="button"
                            onClick={() => setIsLightboxPreviewOpen(true)}
                            className="text-[10px] font-semibold text-[#BF4B24] hover:underline"
                          >
                            Ampliar imagem
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {receiptFile && !aiProcessing && (
                        <button
                          type="button"
                          title="Reler nota"
                          onClick={() =>
                            processReceiptAndVoiceWithAI(
                              receiptFile,
                              null,
                              voiceTranscript,
                            )
                          }
                          className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {receiptPreviewUrl && (
                        <button
                          type="button"
                          title="Remover anexo"
                          onClick={() => {
                            setReceiptFile(null);
                            setReceiptPreviewUrl(null);
                            setAiStatusMessage(null);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Campos do Formulário */}
              <div
                className={`space-y-3.5 transition-opacity ${
                  aiProcessing
                    ? "opacity-60 pointer-events-none"
                    : "opacity-100"
                }`}
              >
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Descrição da Despesa *
                  </Label>
                  <Input
                    value={expenseForm.title}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, title: e.target.value })
                    }
                    placeholder="Ex: Conta de Energia / Compra de Insumos"
                    className="mt-1 h-10 text-xs rounded-xl w-full"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      Valor Total (R$) *
                    </Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={expenseForm.amount}
                      onChange={(e) =>
                        setExpenseForm({
                          ...expenseForm,
                          amount: e.target.value,
                        })
                      }
                      placeholder="0.00"
                      className="mt-1 h-10 font-bold text-sm rounded-xl w-full"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      Data da Despesa
                    </Label>
                    <Input
                      type="date"
                      value={expenseForm.expense_date}
                      onChange={(e) =>
                        setExpenseForm({
                          ...expenseForm,
                          expense_date: e.target.value,
                        })
                      }
                      className="mt-1 h-10 text-xs font-semibold rounded-xl w-full"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold text-slate-700">
                        Categoria
                      </Label>
                      <button
                        type="button"
                        onClick={() => setIsNewCategoryModalOpen(true)}
                        className="text-[11px] font-bold text-[#BF4B24] hover:underline"
                      >
                        + Nova categoria
                      </button>
                    </div>
                    <select
                      value={expenseForm.category}
                      onChange={(e) =>
                        setExpenseForm({
                          ...expenseForm,
                          category: e.target.value,
                        })
                      }
                      className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
                    >
                      {Object.entries(expenseCategoriesMap).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      Alocação (Hub ou Sala)
                    </Label>
                    <select
                      value={expenseForm.room_id}
                      onChange={(e) =>
                        setExpenseForm({
                          ...expenseForm,
                          room_id: e.target.value,
                        })
                      }
                      className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="">
                        Rateio Geral do Hub (Todas as Salas)
                      </option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          Exclusivo: {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      Fornecedor / Loja (Opcional)
                    </Label>
                    <Input
                      value={expenseForm.vendor}
                      onChange={(e) =>
                        setExpenseForm({
                          ...expenseForm,
                          vendor: e.target.value,
                        })
                      }
                      placeholder="Extraído da nota..."
                      className="mt-1 h-10 text-xs rounded-xl w-full"
                    />
                  </div>

                  <div>
                    <Label className="text-xs font-semibold text-slate-700">
                      Situação
                    </Label>
                    <select
                      value={expenseForm.payment_status}
                      onChange={(e) =>
                        setExpenseForm({
                          ...expenseForm,
                          payment_status: e.target.value as "paid" | "pending",
                        })
                      }
                      className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="paid">Pago</option>
                      <option value="pending">Pendente (A Pagar)</option>
                    </select>
                  </div>
                </div>

                {/* Campos Personalizados */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-slate-700">
                      Campos Extras (Opcional)
                    </Label>
                    <button
                      type="button"
                      onClick={() =>
                        setExpenseForm((prev) => ({
                          ...prev,
                          custom_fields: [
                            ...prev.custom_fields,
                            { key: "", value: "" },
                          ],
                        }))
                      }
                      className="text-xs font-bold text-[#BF4B24] hover:underline"
                    >
                      + Adicionar campo
                    </button>
                  </div>

                  {expenseForm.custom_fields.map((cf, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <Input
                        placeholder="Campo"
                        value={cf.key}
                        onChange={(e) => {
                          const next = [...expenseForm.custom_fields];
                          next[index].key = e.target.value;
                          setExpenseForm({
                            ...expenseForm,
                            custom_fields: next,
                          });
                        }}
                        className="h-9 text-xs flex-1 min-w-0"
                      />
                      <Input
                        placeholder="Valor"
                        value={cf.value}
                        onChange={(e) => {
                          const next = [...expenseForm.custom_fields];
                          next[index].value = e.target.value;
                          setExpenseForm({
                            ...expenseForm,
                            custom_fields: next,
                          });
                        }}
                        className="h-9 text-xs flex-1 min-w-0"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          setExpenseForm({
                            ...expenseForm,
                            custom_fields: expenseForm.custom_fields.filter(
                              (_, i) => i !== index,
                            ),
                          })
                        }
                        className="h-9 w-9 text-slate-400 hover:text-red-600 shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Observações (Opcional)
                  </Label>
                  <Input
                    value={expenseForm.notes}
                    onChange={(e) =>
                      setExpenseForm({ ...expenseForm, notes: e.target.value })
                    }
                    placeholder="Itens da nota ou observações..."
                    className="mt-1 h-10 text-xs rounded-xl w-full"
                  />
                </div>
              </div>
            </div>

            {/* Rodapé Fixo */}
            <div className="px-4 sm:px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5 shrink-0 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsExpenseModalOpen(false)}
                className="h-10 font-semibold text-xs text-slate-600"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSaveExpense}
                disabled={saving || aiProcessing}
                className="h-10 px-6 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                {saving ? "Salvando..." : "Salvar Despesa"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* VISUALIZADOR TELA CHEIA DA FOTO DA NOTA */}
      {isLightboxPreviewOpen && receiptPreviewUrl && (
        <div
          onClick={() => setIsLightboxPreviewOpen(false)}
          className="fixed inset-0 z-[150] bg-black/90 flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setIsLightboxPreviewOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={receiptPreviewUrl}
            alt="Comprovante Ampliado"
            className="max-w-full max-h-[88dvh] object-contain rounded-lg"
          />
        </div>
      )}

      {/* MODAL PARA CRIAR NOVA CATEGORIA PERSONALIZADA */}
      {isNewCategoryModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-0 sm:p-4">
          <div className="w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Nova Categoria de Despesa
              </h3>
              <button
                type="button"
                onClick={() => setIsNewCategoryModalOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Nome da Categoria
              </Label>
              <Input
                placeholder="Ex: Café & Recepção, Contabilidade..."
                value={newCategoryLabel}
                onChange={(e) => setNewCategoryLabel(e.target.value)}
                className="mt-1 h-10 text-xs rounded-xl"
              />
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Tipo de Custo
              </Label>
              <select
                value={newCategoryCostType}
                onChange={(e) =>
                  setNewCategoryCostType(e.target.value as "fixed" | "variable")
                }
                className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="variable">Custo Variável</option>
                <option value="fixed">Custo Fixo Recorrente</option>
              </select>
            </div>

            <Button
              type="button"
              onClick={handleCreateCustomCategory}
              className="w-full h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs cursor-pointer"
            >
              Salvar Categoria
            </Button>
          </div>
        </div>
      )}

      {/* MODAL DE ITEM DE ESTOQUE (RESPONSIVO) */}
      {isItemModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingItem
                  ? "Editar Item do Estoque"
                  : "Cadastrar Insumo no Estoque"}
              </h3>
              <button
                type="button"
                onClick={() => setIsItemModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Nome do Insumo / Material *
                </Label>
                <Input
                  value={itemForm.name}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, name: e.target.value })
                  }
                  placeholder="Ex: Rolo de Lençol Descartável / Luva Nitrílica"
                  className="mt-1 h-10 text-xs rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Categoria
                  </Label>
                  <select
                    value={itemForm.category}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, category: e.target.value })
                    }
                    className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
                  >
                    {Object.entries(INVENTORY_CATEGORIES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Sala Vinculada (Opcional)
                  </Label>
                  <select
                    value={itemForm.room_id}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, room_id: e.target.value })
                    }
                    className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
                  >
                    <option value="">Uso Geral do Hub</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Qtd. Atual *
                  </Label>
                  <Input
                    type="number"
                    value={itemForm.current_quantity}
                    onChange={(e) =>
                      setItemForm({
                        ...itemForm,
                        current_quantity: e.target.value,
                      })
                    }
                    className="mt-1 h-10 font-bold text-xs rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-red-600">
                    Mínimo *
                  </Label>
                  <Input
                    type="number"
                    value={itemForm.min_quantity}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, min_quantity: e.target.value })
                    }
                    className="mt-1 h-10 font-bold text-xs border-red-200 rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Unidade
                  </Label>
                  <select
                    value={itemForm.unit}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, unit: e.target.value })
                    }
                    className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"
                  >
                    <option value="un">un</option>
                    <option value="cx">cx</option>
                    <option value="pct">pct</option>
                    <option value="rolo">rolo</option>
                    <option value="frasco">frasco</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Custo Unitário (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={itemForm.unit_cost}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, unit_cost: e.target.value })
                    }
                    placeholder="Ex: 18.50"
                    className="mt-1 h-10 text-xs rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Fornecedor
                  </Label>
                  <Input
                    value={itemForm.supplier}
                    onChange={(e) =>
                      setItemForm({ ...itemForm, supplier: e.target.value })
                    }
                    placeholder="Opcional"
                    className="mt-1 h-10 text-xs rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5">
              <Button
                variant="ghost"
                onClick={() => setIsItemModalOpen(false)}
                className="text-xs font-semibold"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveInventoryItem}
                disabled={saving}
                className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-semibold text-xs rounded-xl"
              >
                {saving ? "Salvando..." : "Salvar Insumo"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE REPOSIÇÃO / BAIXA DE ESTOQUE */}
      {isRestockModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-0 sm:p-4">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-5 space-y-4 shadow-2xl pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {restockMode === "in"
                  ? `Repor: ${restockTarget?.name}`
                  : `Baixa: ${restockTarget?.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setIsRestockModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <Label className="text-xs font-semibold text-slate-700">
                Quantidade a{" "}
                {restockMode === "in" ? "Adicionar (+)" : "Retirar (-)"} *
              </Label>
              <Input
                type="number"
                min="1"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                className="mt-1 font-bold text-base h-10 rounded-xl"
              />
            </div>

            {restockMode === "in" && (
              <>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Custo Unitário (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={restockUnitCost}
                    onChange={(e) => setRestockUnitCost(e.target.value)}
                    className="mt-1 font-semibold h-10 text-xs rounded-xl"
                  />
                </div>

                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restockAutoExpense}
                    onChange={(e) => setRestockAutoExpense(e.target.checked)}
                    className="rounded accent-emerald-600 h-4 w-4"
                  />
                  <span>
                    Lançar{" "}
                    <strong>
                      R${" "}
                      {formatBRL(
                        (Number(restockQty) || 0) *
                          (Number(restockUnitCost) || 0),
                      )}
                    </strong>{" "}
                    nas Despesas do Mês
                  </span>
                </label>
              </>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => setIsRestockModalOpen(false)}
                className="text-xs font-semibold"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleConfirmStockMovement}
                disabled={saving}
                className={
                  restockMode === "in"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl"
                    : "bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl"
                }
              >
                {saving ? "Processando..." : "Confirmar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE MANUTENÇÃO (RESPONSIVO) */}
      {isMaintModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-[2px] p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingMaint
                  ? "Editar Manutenção"
                  : "Nova Manutenção / Reparo"}
              </h3>
              <button
                type="button"
                onClick={() => setIsMaintModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Título do Serviço / Reparo *
                </Label>
                <Input
                  value={maintForm.title}
                  onChange={(e) =>
                    setMaintForm({ ...maintForm, title: e.target.value })
                  }
                  placeholder="Ex: Higienização do Ar-Condicionado"
                  className="mt-1 h-10 text-xs rounded-xl"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Sala / Espaço
                  </Label>
                  <select
                    value={maintForm.room_id}
                    onChange={(e) =>
                      setMaintForm({ ...maintForm, room_id: e.target.value })
                    }
                    className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
                  >
                    <option value="">Área Comum / Hub Geral</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Categoria
                  </Label>
                  <select
                    value={maintForm.category}
                    onChange={(e) =>
                      setMaintForm({ ...maintForm, category: e.target.value })
                    }
                    className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700"
                  >
                    {Object.entries(MAINTENANCE_CATEGORIES).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Custo (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={maintForm.cost}
                    onChange={(e) =>
                      setMaintForm({ ...maintForm, cost: e.target.value })
                    }
                    placeholder="0.00"
                    className="mt-1 h-10 font-bold text-xs rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Data
                  </Label>
                  <Input
                    type="date"
                    value={maintForm.scheduled_date}
                    onChange={(e) =>
                      setMaintForm({
                        ...maintForm,
                        scheduled_date: e.target.value,
                      })
                    }
                    className="mt-1 h-10 text-xs rounded-xl"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <Label className="text-xs font-semibold text-slate-700">
                    Prestador
                  </Label>
                  <Input
                    value={maintForm.provider_name}
                    onChange={(e) =>
                      setMaintForm({
                        ...maintForm,
                        provider_name: e.target.value,
                      })
                    }
                    placeholder="Nome"
                    className="mt-1 h-10 text-xs rounded-xl"
                  />
                </div>
              </div>

              {!editingMaint && Number(maintForm.cost) > 0 && (
                <label className="flex items-center gap-2 p-3 rounded-xl bg-orange-50 border border-orange-200 text-xs font-semibold text-orange-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={maintForm.recordExpenseNow}
                    onChange={(e) =>
                      setMaintForm({
                        ...maintForm,
                        recordExpenseNow: e.target.checked,
                      })
                    }
                    className="rounded accent-[#BF4B24]"
                  />
                  Lançar R$ {formatBRL(Number(maintForm.cost))} nas Despesas do
                  Mês
                </label>
              )}
            </div>

            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5">
              <Button
                variant="ghost"
                onClick={() => setIsMaintModalOpen(false)}
                className="text-xs font-semibold"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveMaintenance}
                disabled={saving}
                className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-semibold text-xs rounded-xl"
              >
                {saving ? "Salvando..." : "Salvar Manutenção"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
