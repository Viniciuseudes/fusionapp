"use client";

import { useState, useEffect } from "react";
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
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  Sparkles,
  Phone,
  Calendar as CalendarIcon,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

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

interface ClinicExpense {
  id: string;
  host_id: string;
  room_id: string | null;
  title: string;
  category: string;
  amount: number;
  expense_date: string;
  payment_status: "paid" | "pending";
  reference_type: string | null;
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

const EXPENSE_CATEGORIES: Record<string, string> = {
  insumos: "Reposição de Estoque / Insumos",
  manutencao: "Manutenção & Reparos",
  energia: "Energia Elétrica",
  agua: "Água & Saneamento",
  internet: "Internet & Sistemas",
  limpeza: "Serviços de Limpeza / Diarista",
  aluguel_condominio: "Aluguel, Condomínio & IPTU",
  outros: "Outras Despesas Operacionais",
};

export function HostOperationsTab() {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [activeSubTab, setActiveSubTab] = useState<
    "inventory" | "maintenance" | "expenses"
  >("inventory");

  // Filtro de Competência Mensal (ex: 2026-10)
  const [selectedMonth, setSelectedMonth] = useState(
    format(new Date(), "yyyy-MM"),
  );
  const [search, setSearch] = useState("");
  const [onlyCriticalStock, setOnlyCriticalStock] = useState(false);

  const [rooms, setRooms] = useState<any[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [maintenances, setMaintenances] = useState<MaintenanceOrder[]>([]);
  const [expenses, setExpenses] = useState<ClinicExpense[]>([]);

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

  // Modal de Reposição / Baixa Rápida de Estoque
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

  // --- MODAL DE DESPESA AVULSA ---
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ClinicExpense | null>(
    null,
  );
  const [expenseForm, setExpenseForm] = useState({
    title: "",
    category: "energia",
    room_id: "",
    amount: "",
    expense_date: format(new Date(), "yyyy-MM-dd"),
    payment_status: "paid" as "paid" | "pending",
    notes: "",
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

      // Calcula início e fim do mês selecionado para as despesas
      const [yearStr, monthStr] = selectedMonth.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const startOfMonthStr = `${selectedMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endOfMonthStr = `${selectedMonth}-${String(lastDay).padStart(2, "0")}`;

      const [roomsRes, invRes, maintRes, expRes] = await Promise.all([
        supabase
          .from("rooms")
          .select("id, name")
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
            ? roomNameMap.get(item.room_id) || "Uso Geral da Clínica"
            : "Uso Geral da Clínica",
        })),
      );

      setMaintenances(
        (maintRes.data || []).map((m: any) => ({
          ...m,
          cost: Number(m.cost || 0),
          room_name: m.room_id
            ? roomNameMap.get(m.room_id) || "Área Comum / Clínica"
            : "Área Comum / Clínica",
        })),
      );

      setExpenses(
        (expRes.data || []).map((e: any) => ({
          ...e,
          amount: Number(e.amount || 0),
          room_name: e.room_id
            ? roomNameMap.get(e.room_id) || "Custo Geral"
            : "Custo Geral",
        })),
      );
    } catch (err: any) {
      console.error("Erro ao carregar Controle Interno:", err);
      toast({
        variant: "destructive",
        title: "Aviso ao carregar dados",
        description:
          "Certifique-se de ter executado o script SQL de criação das tabelas de Controle Interno no Supabase.",
      });
    } finally {
      setLoading(false);
    }
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
        description:
          restockMode === "in" && restockAutoExpense && totalPurchaseCost > 0
            ? `Novo saldo: ${updatedQty} ${restockTarget.unit}. Despesa de R$ ${totalPurchaseCost.toFixed(2)} lançada no mês.`
            : `Novo saldo de ${restockTarget.name}: ${updatedQty} ${restockTarget.unit}.`,
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
  // AÇÕES DE MANUTENÇÃO & INFRAESTRUTURA
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

  // ============================================================================
  // AÇÕES DE DESPESAS MENSAIS
  // ============================================================================
  const openNewExpenseModal = () => {
    setEditingExpense(null);
    setExpenseForm({
      title: "",
      category: "energia",
      room_id: "",
      amount: "",
      expense_date: format(new Date(), "yyyy-MM-dd"),
      payment_status: "paid",
      notes: "",
    });
    setIsExpenseModalOpen(true);
  };

  const openEditExpenseModal = (exp: ClinicExpense) => {
    setEditingExpense(exp);
    setExpenseForm({
      title: exp.title,
      category: exp.category,
      room_id: exp.room_id || "",
      amount: String(exp.amount),
      expense_date: exp.expense_date,
      payment_status: exp.payment_status,
      notes: exp.notes || "",
    });
    setIsExpenseModalOpen(true);
  };

  const handleSaveExpense = async () => {
    if (!expenseForm.title.trim() || !expenseForm.amount) {
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

      const payload = {
        host_id: user.id,
        room_id: expenseForm.room_id || null,
        title: expenseForm.title.trim(),
        category: expenseForm.category,
        amount: Math.max(0, Number(expenseForm.amount) || 0),
        expense_date: expenseForm.expense_date,
        payment_status: expenseForm.payment_status,
        notes: expenseForm.notes.trim() || null,
        reference_type: editingExpense?.reference_type || "manual",
      };

      if (editingExpense) {
        const { error } = await supabase
          .from("clinic_expenses")
          .update(payload)
          .eq("id", editingExpense.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("clinic_expenses")
          .insert(payload);
        if (error) throw error;
      }

      toast({
        title: editingExpense
          ? "Despesa atualizada!"
          : "Despesa lançada no controle mensal!",
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

  const handleExportExpensesCSV = () => {
    if (expenses.length === 0) {
      return toast({ title: "Sem despesas registradas neste mês." });
    }
    const headers = [
      "Data",
      "Descrição",
      "Categoria",
      "Sala / Alocação",
      "Status",
      "Valor (R$)",
      "Observações",
    ];
    const rows = expenses.map((e) => [
      format(parseISO(e.expense_date), "dd/MM/yyyy"),
      e.title,
      EXPENSE_CATEGORIES[e.category] || e.category,
      e.room_name || "Custo Geral",
      e.payment_status === "paid" ? "Pago" : "Pendente",
      e.amount.toFixed(2).replace(".", ","),
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
    link.setAttribute("download", `Despesas_Clinica_${selectedMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // ============================================================================
  // CÁLCULO DE KPIS OPERACIONAIS DO MÊS
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

  // Filtros de busca
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

  const filteredExpenses = expenses.filter(
    (e) =>
      e.title.toLowerCase().includes(q) ||
      (EXPENSE_CATEGORIES[e.category] || "").toLowerCase().includes(q) ||
      (e.room_name || "").toLowerCase().includes(q),
  );

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 max-w-7xl mx-auto w-full pb-32 font-sans">
      {/* HEADER E SELETOR DE COMPETÊNCIA MENSAL */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <Package className="w-8 h-8 text-[#BF4B24]" />
            Controle Interno, Estoque & Manutenção
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Gerencie insumos das salas, alertas de reposição crítica, ordens de
            manutenção e despesas operacionais do mês.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-sm">
            <CalendarIcon className="w-4 h-4 text-[#BF4B24] mr-2" />
            <span className="text-xs font-bold text-slate-500 mr-2 uppercase">
              Mês:
            </span>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-sm font-black text-slate-900 outline-none bg-transparent"
            />
          </div>
        </div>
      </div>

      {/* BANNER AUTOMÁTICO DE ALERTA DE ESTOQUE CRÍTICO */}
      {criticalItems.length > 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-red-50 border-2 border-red-200 flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in fade-in">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-600 text-white flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-red-950 uppercase tracking-wide">
                Atenção: {criticalItems.length} item(ns) em Estoque Crítico de
                Reposição!
              </h3>
              <p className="text-xs font-medium text-red-800 mt-0.5">
                Itens precisando de compra imediata:{" "}
                <strong>
                  {criticalItems
                    .slice(0, 5)
                    .map((i) => `${i.name} (${i.current_quantity} ${i.unit})`)
                    .join(", ")}
                </strong>
                {criticalItems.length > 5 ? "..." : ""}. Custo estimado de
                reposição:{" "}
                <strong>
                  R${" "}
                  {estimatedRestockBudget.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              setActiveSubTab("inventory");
              setOnlyCriticalStock(true);
            }}
            className="bg-red-600 hover:bg-red-700 text-white font-black text-xs h-10 px-4 rounded-xl shrink-0"
          >
            Filtrar Itens Críticos
          </Button>
        </div>
      )}

      {/* 4 KPIS OPERACIONAIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {/* KPI 1: Gasto Total da Clínica no Mês */}
        <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-lg relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">
              Gasto da Clínica no Mês
            </span>
            <TrendingDown className="w-5 h-5 text-orange-400" />
          </div>
          <p className="text-2xl font-black text-white">
            R${" "}
            {totalMonthExpenses.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-[11px] font-bold">
            <span className="text-emerald-400">
              Pago: R$ {paidMonthExpenses.toFixed(0)}
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-amber-300">
              A Pagar: R$ {pendingMonthExpenses.toFixed(0)}
            </span>
          </div>
        </div>

        {/* KPI 2: Itens em Estoque Crítico */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">
              Estoque Crítico
            </span>
            <AlertTriangle
              className={`w-5 h-5 ${
                criticalItems.length > 0 ? "text-red-500" : "text-emerald-500"
              }`}
            />
          </div>
          <p
            className={`text-2xl font-black ${
              criticalItems.length > 0 ? "text-red-600" : "text-slate-900"
            }`}
          >
            {criticalItems.length}{" "}
            <span className="text-sm font-bold text-slate-400">
              / {inventory.length} itens
            </span>
          </p>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            Abaixo da quantidade mínima de segurança
          </p>
        </div>

        {/* KPI 3: Manutenções em Aberto */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">
              Manutenções Abertas
            </span>
            <Wrench className="w-5 h-5 text-blue-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            {openMaintenances.length}
          </p>
          <p className="text-[11px] font-bold text-amber-600 mt-1">
            {urgentMaintenances.length > 0
              ? `${urgentMaintenances.length} de prioridade alta/urgente`
              : "Nenhuma urgência pendente"}
          </p>
        </div>

        {/* KPI 4: Valor Imobilizado em Estoque */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">
              Valor em Estoque Atual
            </span>
            <Package className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            R${" "}
            {totalStockValue.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            Soma dos insumos disponíveis na clínica
          </p>
        </div>
      </div>

      {/* BARRA DE NAVEGAÇÃO INTERNA DAS 3 SUB-ABAS */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3 mb-6 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="flex bg-slate-100 p-1 rounded-xl overflow-x-auto">
          <button
            onClick={() => setActiveSubTab("inventory")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-black whitespace-nowrap transition-all ${
              activeSubTab === "inventory"
                ? "bg-white text-[#BF4B24] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Package className="w-4 h-4" />
            Estoque & Reposição ({inventory.length})
            {criticalItems.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-red-600 text-white">
                {criticalItems.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab("maintenance")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-black whitespace-nowrap transition-all ${
              activeSubTab === "maintenance"
                ? "bg-white text-[#BF4B24] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Wrench className="w-4 h-4" />
            Manutenção das Salas ({maintenances.length})
          </button>

          <button
            onClick={() => setActiveSubTab("expenses")}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-black whitespace-nowrap transition-all ${
              activeSubTab === "expenses"
                ? "bg-white text-[#BF4B24] shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Receipt className="w-4 h-4" />
            Despesas do Mês ({expenses.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Buscar insumo, reparo ou conta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-10 rounded-xl border-slate-200"
            />
          </div>

          {activeSubTab === "inventory" && (
            <Button
              onClick={openNewItemModal}
              className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black h-10 rounded-xl"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Novo Insumo
            </Button>
          )}

          {activeSubTab === "maintenance" && (
            <Button
              onClick={openNewMaintModal}
              className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black h-10 rounded-xl"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Nova Manutenção
            </Button>
          )}

          {activeSubTab === "expenses" && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleExportExpensesCSV}
                className="h-10 rounded-xl font-bold border-slate-200 text-slate-700"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5 text-emerald-600" />
                Exportar CSV
              </Button>
              <Button
                onClick={openNewExpenseModal}
                className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black h-10 rounded-xl"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Lançar Despesa
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SUB-ABA 1: ESTOQUE & REPOSIÇÃO CRÍTICA */}
      {/* ==================================================================== */}
      {activeSubTab === "inventory" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <p className="text-xs font-bold text-slate-500">
              Use os botões <strong>Repor (+)</strong> e{" "}
              <strong>Baixa (-)</strong> para atualizar rapidamente o estoque
              diário da clínica.
            </p>
            <label className="flex items-center gap-2 text-xs font-bold text-red-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyCriticalStock}
                onChange={(e) => setOnlyCriticalStock(e.target.checked)}
                className="rounded accent-red-600"
              />
              Mostrar apenas estoque crítico ({criticalItems.length})
            </label>
          </div>

          {filteredInventory.length === 0 ? (
            <div className="py-16 text-center px-4">
              <Package className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="font-bold text-slate-600">
                Nenhum item de estoque encontrado.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Cadastre luvas, lençol de maca, álcool, café, copos e materiais
                para ser avisado antes de acabarem.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4">Insumo / Material</th>
                    <th className="px-6 py-4">Sala / Local</th>
                    <th className="px-6 py-4 text-center">
                      Quantidade Atual vs Mínimo
                    </th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Custo Unit.</th>
                    <th className="px-6 py-4 text-center">
                      Movimentação Rápida
                    </th>
                    <th className="px-6 py-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInventory.map((item) => {
                    const isCritical =
                      item.current_quantity <= item.min_quantity;
                    const isZero = item.current_quantity <= 0;

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isCritical
                            ? "bg-red-50/40 hover:bg-red-50/70"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-6 py-4">
                          <p className="font-black text-slate-900">
                            {item.name}
                          </p>
                          <p className="text-[11px] font-bold text-slate-400">
                            {INVENTORY_CATEGORIES[item.category] ||
                              item.category}
                            {item.supplier ? ` • Forn: ${item.supplier}` : ""}
                          </p>
                        </td>

                        <td className="px-6 py-4">
                          <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-slate-400" />
                            {item.room_name}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <span
                            className={`text-base font-black ${
                              isCritical ? "text-red-600" : "text-slate-900"
                            }`}
                          >
                            {item.current_quantity} {item.unit}
                          </span>
                          <span className="text-xs font-bold text-slate-400 block">
                            Mínimo ideal: {item.min_quantity} {item.unit}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-center">
                          {isZero ? (
                            <Badge className="bg-red-600 text-white border-0 font-black">
                              Esgotado!
                            </Badge>
                          ) : isCritical ? (
                            <Badge className="bg-red-100 text-red-800 border-0 font-black">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Reposição Crítica
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 border-0 font-bold">
                              Estoque Normal
                            </Badge>
                          )}
                        </td>

                        <td className="px-6 py-4 text-right">
                          <p className="font-bold text-slate-800">
                            R${" "}
                            {item.unit_cost.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">
                            Total: R${" "}
                            {(
                              item.current_quantity * item.unit_cost
                            ).toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                openStockMovementModal(item, "out")
                              }
                              className="h-8 px-2.5 border-slate-200 text-slate-700 font-bold hover:bg-slate-100"
                            >
                              <Minus className="w-3.5 h-3.5 mr-1" /> Baixa
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => openStockMovementModal(item, "in")}
                              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                            >
                              <Plus className="w-3.5 h-3.5 mr-1" /> Repor
                            </Button>
                          </div>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditItemModal(item)}
                              className="h-8 w-8 text-slate-500 hover:text-slate-900"
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-ABA 2: MANUTENÇÃO & INFRAESTRUTURA DAS SALAS */}
      {/* ==================================================================== */}
      {activeSubTab === "maintenance" && (
        <div className="space-y-4">
          {filteredMaintenances.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center px-4">
              <Wrench className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="font-bold text-slate-600">
                Nenhuma ordem de manutenção registrada.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Registre revisões de ar-condicionado, reparos elétricos ou
                consertos de mobiliário para manter o padrão das salas.
              </p>
            </div>
          ) : (
            filteredMaintenances.map((m) => (
              <div
                key={m.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-[#BF4B24]/30 transition-colors"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-black text-slate-900">
                      {m.title}
                    </h3>
                    <Badge className="bg-slate-100 text-slate-700 border-0 text-[10px] font-bold">
                      {m.room_name}
                    </Badge>
                    {m.priority === "urgent" && (
                      <Badge className="bg-red-600 text-white border-0 text-[10px] font-black">
                        Urgente
                      </Badge>
                    )}
                    {m.priority === "high" && (
                      <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] font-black">
                        Alta Prioridade
                      </Badge>
                    )}
                    {m.status === "completed" ? (
                      <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Concluída
                      </Badge>
                    ) : m.status === "in_progress" ? (
                      <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px] font-bold">
                        Em Execução
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                        Pendente
                      </Badge>
                    )}
                  </div>

                  {m.description && (
                    <p className="text-xs text-slate-600 font-medium">
                      {m.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 font-bold pt-1">
                    <span>
                      Categoria:{" "}
                      {MAINTENANCE_CATEGORIES[m.category] || m.category}
                    </span>
                    {m.provider_name && (
                      <span>
                        Técnico/Empresa: {m.provider_name}{" "}
                        {m.provider_phone ? `(${m.provider_phone})` : ""}
                      </span>
                    )}
                    {m.scheduled_date && (
                      <span>
                        Data prevista:{" "}
                        {format(parseISO(m.scheduled_date), "dd/MM/yyyy")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between md:justify-end gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  <div className="text-left md:text-right">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block">
                      Custo do Serviço
                    </span>
                    <span className="text-lg font-black text-slate-900">
                      R${" "}
                      {m.cost.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {m.status !== "completed" && (
                      <Button
                        size="sm"
                        onClick={() => handleMarkMaintCompleted(m)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold h-9 rounded-xl"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Concluir
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => openEditMaintModal(m)}
                      className="h-9 w-9 rounded-xl border-slate-200"
                    >
                      <Edit3 className="w-4 h-4 text-slate-600" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteMaint(m)}
                      className="h-9 w-9 rounded-xl text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-ABA 3: DESPESAS OPERACIONAIS DO MÊS */}
      {/* ==================================================================== */}
      {activeSubTab === "expenses" && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {filteredExpenses.length === 0 ? (
            <div className="py-16 text-center px-4">
              <Receipt className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="font-bold text-slate-600">
                Nenhuma despesa registrada na competência {selectedMonth}.
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Lance contas de energia, condomínio, limpeza ou reposições de
                estoque para acompanhar o custo mensal real da clínica.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4">Data</th>
                    <th className="px-6 py-4">Descrição da Despesa</th>
                    <th className="px-6 py-4">Categoria</th>
                    <th className="px-6 py-4">Alocação / Sala</th>
                    <th className="px-6 py-4 text-center">Status</th>
                    <th className="px-6 py-4 text-right">Valor (R$)</th>
                    <th className="px-6 py-4 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-bold text-slate-600">
                        {format(parseISO(exp.expense_date), "dd/MM/yyyy")}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-black text-slate-900">{exp.title}</p>
                        {exp.notes && (
                          <p className="text-[11px] font-medium text-slate-400">
                            {exp.notes}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className="bg-slate-100 text-slate-700 border-0 font-bold">
                          {EXPENSE_CATEGORIES[exp.category] || exp.category}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-600">
                        {exp.room_name}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleToggleExpensePaid(exp)}
                          title="Clique para alternar entre Pago e Pendente"
                        >
                          {exp.payment_status === "paid" ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-0 font-bold cursor-pointer">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Pago
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-0 font-bold cursor-pointer">
                              <Clock className="w-3 h-3 mr-1" /> Pendente
                            </Badge>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-right font-black text-slate-900">
                        R${" "}
                        {exp.amount.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
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
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: CRIAR / EDITAR ITEM DE ESTOQUE */}
      {/* ==================================================================== */}
      <Dialog open={isItemModalOpen} onOpenChange={setIsItemModalOpen}>
        <DialogContent className="sm:max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900">
              {editingItem
                ? "Editar Item do Estoque"
                : "Cadastrar Insumo no Estoque"}
            </DialogTitle>
            <DialogDescription>
              Defina a quantidade mínima de segurança para receber alertas
              automáticos de reposição.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-slate-600">
                Nome do Insumo / Material *
              </Label>
              <Input
                value={itemForm.name}
                onChange={(e) =>
                  setItemForm({ ...itemForm, name: e.target.value })
                }
                placeholder="Ex: Rolo de Lençol Descartável 70x50m / Luva Nitrílica M"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Categoria
                </Label>
                <select
                  value={itemForm.category}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, category: e.target.value })
                  }
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                >
                  {Object.entries(INVENTORY_CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Sala Vinculada (Opcional)
                </Label>
                <select
                  value={itemForm.room_id}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, room_id: e.target.value })
                  }
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                >
                  <option value="">Uso Geral da Clínica</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-600">
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
                  className="mt-1 font-black"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-red-600">
                  Estoque Mínimo *
                </Label>
                <Input
                  type="number"
                  value={itemForm.min_quantity}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, min_quantity: e.target.value })
                  }
                  className="mt-1 font-black border-red-200"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Unidade
                </Label>
                <select
                  value={itemForm.unit}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, unit: e.target.value })
                  }
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                >
                  <option value="un">Unidade (un)</option>
                  <option value="cx">Caixa (cx)</option>
                  <option value="pct">Pacote (pct)</option>
                  <option value="rolo">Rolo</option>
                  <option value="frasco">Frasco / Litro</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Custo Unitário de Compra (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={itemForm.unit_cost}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, unit_cost: e.target.value })
                  }
                  placeholder="Ex: 18.50"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Fornecedor (Opcional)
                </Label>
                <Input
                  value={itemForm.supplier}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, supplier: e.target.value })
                  }
                  placeholder="Ex: Dental Cremer / Atacadão"
                  className="mt-1"
                />
              </div>
            </div>

            {!editingItem && (
              <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={itemForm.recordInitialExpense}
                  onChange={(e) =>
                    setItemForm({
                      ...itemForm,
                      recordInitialExpense: e.target.checked,
                    })
                  }
                  className="rounded accent-[#BF4B24]"
                />
                Lançar o valor deste lote inicial nas Despesas do Mês
              </label>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsItemModalOpen(false)}
              className="font-bold"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveInventoryItem}
              disabled={saving}
              className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black"
            >
              {saving ? "Salvando..." : "Salvar Insumo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================================== */}
      {/* MODAL 2: REPOSIÇÃO (+) OU BAIXA (-) DE ESTOQUE */}
      {/* ==================================================================== */}
      <Dialog open={isRestockModalOpen} onOpenChange={setIsRestockModalOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900">
              {restockMode === "in"
                ? `Repor Estoque: ${restockTarget?.name}`
                : `Registrar Consumo / Baixa: ${restockTarget?.name}`}
            </DialogTitle>
            <DialogDescription>
              Saldo atual: <strong>{restockTarget?.current_quantity}</strong>{" "}
              {restockTarget?.unit} (Mínimo: {restockTarget?.min_quantity}{" "}
              {restockTarget?.unit})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-slate-600">
                Quantidade a{" "}
                {restockMode === "in" ? "Adicionar (+)" : "Retirar (-)"} *
              </Label>
              <Input
                type="number"
                min="1"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                className="mt-1 font-black text-lg"
              />
            </div>

            {restockMode === "in" && (
              <>
                <div>
                  <Label className="text-xs font-bold text-slate-600">
                    Custo Unitário desta Compra (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={restockUnitCost}
                    onChange={(e) => setRestockUnitCost(e.target.value)}
                    className="mt-1 font-bold"
                  />
                </div>

                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={restockAutoExpense}
                    onChange={(e) => setRestockAutoExpense(e.target.checked)}
                    className="rounded accent-emerald-600 h-4 w-4"
                  />
                  <span>
                    Lançar automaticamente{" "}
                    <strong>
                      R${" "}
                      {(
                        (Number(restockQty) || 0) *
                        (Number(restockUnitCost) || 0)
                      ).toFixed(2)}
                    </strong>{" "}
                    nas Despesas do Mês
                  </span>
                </label>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsRestockModalOpen(false)}
              className="font-bold"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmStockMovement}
              disabled={saving}
              className={
                restockMode === "in"
                  ? "bg-emerald-600 hover:bg-emerald-700 text-white font-black"
                  : "bg-slate-900 hover:bg-slate-800 text-white font-black"
              }
            >
              {saving
                ? "Processando..."
                : restockMode === "in"
                  ? "Confirmar Entrada"
                  : "Confirmar Baixa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================================== */}
      {/* MODAL 3: CRIAR / EDITAR ORDEM DE MANUTENÇÃO */}
      {/* ==================================================================== */}
      <Dialog open={isMaintModalOpen} onOpenChange={setIsMaintModalOpen}>
        <DialogContent className="sm:max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900">
              {editingMaint
                ? "Editar Ordem de Manutenção"
                : "Nova Ordem de Manutenção / Reparo"}
            </DialogTitle>
            <DialogDescription>
              Registre manutenções preventivas ou corretivas das salas e
              controle os gastos com prestadores.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-slate-600">
                Título do Serviço / Reparo *
              </Label>
              <Input
                value={maintForm.title}
                onChange={(e) =>
                  setMaintForm({ ...maintForm, title: e.target.value })
                }
                placeholder="Ex: Higienização e recarga de gás do Ar-Condicionado"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Sala / Espaço
                </Label>
                <select
                  value={maintForm.room_id}
                  onChange={(e) =>
                    setMaintForm({ ...maintForm, room_id: e.target.value })
                  }
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                >
                  <option value="">Área Comum / Clínica Geral</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Tipo de Manutenção
                </Label>
                <select
                  value={maintForm.category}
                  onChange={(e) =>
                    setMaintForm({ ...maintForm, category: e.target.value })
                  }
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                >
                  {Object.entries(MAINTENANCE_CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Prioridade
                </Label>
                <select
                  value={maintForm.priority}
                  onChange={(e) =>
                    setMaintForm({
                      ...maintForm,
                      priority: e.target.value as any,
                    })
                  }
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                >
                  <option value="low">Baixa</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Status
                </Label>
                <select
                  value={maintForm.status}
                  onChange={(e) =>
                    setMaintForm({
                      ...maintForm,
                      status: e.target.value as any,
                    })
                  }
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                >
                  <option value="pending">Pendente</option>
                  <option value="in_progress">Em Execução</option>
                  <option value="completed">Concluída</option>
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Data Prevista
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
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Prestador / Técnico
                </Label>
                <Input
                  value={maintForm.provider_name}
                  onChange={(e) =>
                    setMaintForm({
                      ...maintForm,
                      provider_name: e.target.value,
                    })
                  }
                  placeholder="Nome do técnico"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">
                  WhatsApp Técnico
                </Label>
                <Input
                  value={maintForm.provider_phone}
                  onChange={(e) =>
                    setMaintForm({
                      ...maintForm,
                      provider_phone: e.target.value,
                    })
                  }
                  placeholder="(84) 99999-9999"
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Orçamento / Custo (R$)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={maintForm.cost}
                  onChange={(e) =>
                    setMaintForm({ ...maintForm, cost: e.target.value })
                  }
                  placeholder="Ex: 250.00"
                  className="mt-1 font-black"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-600">
                Detalhes do Serviço (Opcional)
              </Label>
              <Input
                value={maintForm.description}
                onChange={(e) =>
                  setMaintForm({ ...maintForm, description: e.target.value })
                }
                placeholder="Peças trocadas, garantia do serviço, etc."
                className="mt-1"
              />
            </div>

            {!editingMaint && Number(maintForm.cost) > 0 && (
              <label className="flex items-center gap-2 p-3 rounded-xl bg-orange-50 border border-orange-200 text-xs font-bold text-orange-950 cursor-pointer">
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
                Lançar este custo de R$ {Number(maintForm.cost).toFixed(2)}{" "}
                automaticamente nas Despesas do Mês
              </label>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsMaintModalOpen(false)}
              className="font-bold"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveMaintenance}
              disabled={saving}
              className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black"
            >
              {saving ? "Salvando..." : "Salvar Manutenção"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================================================================== */}
      {/* MODAL 4: LANÇAR / EDITAR DESPESA DO MÊS */}
      {/* ==================================================================== */}
      <Dialog open={isExpenseModalOpen} onOpenChange={setIsExpenseModalOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900">
              {editingExpense ? "Editar Despesa" : "Lançar Despesa Operacional"}
            </DialogTitle>
            <DialogDescription>
              Registre contas fixas e variáveis para acompanhar o custo real de
              operação da clínica no mês.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-bold text-slate-600">
                Descrição da Despesa *
              </Label>
              <Input
                value={expenseForm.title}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, title: e.target.value })
                }
                placeholder="Ex: Conta de Energia Cosern / Diarista Semanal"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Categoria
                </Label>
                <select
                  value={expenseForm.category}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, category: e.target.value })
                  }
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                >
                  {Object.entries(EXPENSE_CATEGORIES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Sala (Opcional)
                </Label>
                <select
                  value={expenseForm.room_id}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, room_id: e.target.value })
                  }
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                >
                  <option value="">Custo Geral da Clínica</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Valor (R$) *
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) =>
                    setExpenseForm({ ...expenseForm, amount: e.target.value })
                  }
                  placeholder="0.00"
                  className="mt-1 font-black"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">Data</Label>
                <Input
                  type="date"
                  value={expenseForm.expense_date}
                  onChange={(e) =>
                    setExpenseForm({
                      ...expenseForm,
                      expense_date: e.target.value,
                    })
                  }
                  className="mt-1"
                />
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Situação
                </Label>
                <select
                  value={expenseForm.payment_status}
                  onChange={(e) =>
                    setExpenseForm({
                      ...expenseForm,
                      payment_status: e.target.value as any,
                    })
                  }
                  className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700"
                >
                  <option value="paid">Pago</option>
                  <option value="pending">Pendente</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-600">
                Observações (Opcional)
              </Label>
              <Input
                value={expenseForm.notes}
                onChange={(e) =>
                  setExpenseForm({ ...expenseForm, notes: e.target.value })
                }
                placeholder="Ex: Pago via Pix CNPJ"
                className="mt-1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setIsExpenseModalOpen(false)}
              className="font-bold"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveExpense}
              disabled={saving}
              className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black"
            >
              {saving ? "Salvando..." : "Salvar Despesa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
