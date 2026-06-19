"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  Users,
  Building2,
  CalendarDays,
  LayoutDashboard,
  ShieldCheck,
  LogOut,
  Loader2,
} from "lucide-react";
import { AdminRoomsTab } from "@/components/admin/rooms-tab";
import { AdminSpecialistsTab } from "@/components/admin/specialists-tab"; // <-- 1. IMPORTAÇÃO REALIZADA AQUI

export default function AdminDashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState("salas");

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "especialistas", label: "Especialistas", icon: Users },
    { id: "parceiros", label: "Parceiros", icon: ShieldCheck },
    { id: "salas", label: "Gestão de Salas", icon: Building2 },
    { id: "agendamentos", label: "Agendamentos", icon: CalendarDays },
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/admin/login");
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* SIDEBAR ADMIN */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f05e23] font-black text-xl shadow-lg">
            F
          </div>
          <div>
            <h1 className="font-black text-lg leading-tight tracking-wide">
              Fusion Admin
            </h1>
            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
              Torre de Controle
            </p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all ${
                  isActive
                    ? "bg-[#f05e23] text-white shadow-md shadow-orange-500/20"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-400"}`}
                />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
          >
            <LogOut className="w-5 h-5" /> Sair
          </button>
        </div>
      </aside>

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm z-10">
          <h2 className="text-xl font-black text-slate-800 capitalize">
            {activeTab.replace("-", " ")}
          </h2>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-slate-900">Administrador</p>
              <p className="text-xs text-slate-500 font-medium">
                tecnologia@fusionclinic.com.br
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-black text-slate-600">
              A
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          {/* ROTEAMENTO INTERNO DELA */}
          {activeTab === "salas" && <AdminRoomsTab />}

          {/* 2. CONEXÃO DA ABA DE ESPECIALISTAS CONSTRUÍDA AQUI */}
          {activeTab === "especialistas" && <AdminSpecialistsTab />}

          {activeTab !== "salas" && activeTab !== "especialistas" && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin mb-4 text-slate-300" />
              <p className="font-bold">Módulo em construção...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
