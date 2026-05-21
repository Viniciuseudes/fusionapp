import { useState } from "react";
import Image from "next/image";
import {
  Search,
  Plus,
  Star,
  MapPin,
  Eye,
  Edit,
  Power,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface HostSpaceListProps {
  onNavigate: (view: string) => void;
}

export function HostSpaceList({ onNavigate }: HostSpaceListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<
    "all" | "active" | "inactive"
  >("all");

  // Mock provisório até ligarmos ao banco
  const [spaces, setSpaces] = useState([
    {
      id: "1",
      name: "Consultório Psicanálise",
      image: "/images/room-consultorio.jpg",
      price: 45,
      rating: 4.8,
      reviews: 12,
      status: "active",
      bookings: 24,
      revenue: 1080,
      location: "Centro Médico Fusion, Sala 201",
      type: "Consultório",
    },
    {
      id: "2",
      name: "Sala de Reunião Premium",
      image: "/images/room-reuniao.jpg",
      price: 80,
      rating: 5.0,
      reviews: 8,
      status: "inactive",
      bookings: 14,
      revenue: 1120,
      location: "Centro Médico Fusion, Sala 205",
      type: "Reunião/Grupo",
    },
  ]);

  const filteredSpaces = spaces.filter((space) => {
    const matchesSearch = space.name
      .toLowerCase()
      .includes(searchQuery.toLowerCase());
    const matchesStatus =
      selectedStatus === "all" || space.status === selectedStatus;
    return matchesSearch && matchesStatus;
  });

  const toggleStatus = (id: string) => {
    setSpaces(
      spaces.map((s) =>
        s.id === id
          ? { ...s, status: s.status === "active" ? "inactive" : "active" }
          : s,
      ),
    );
  };

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 max-w-5xl mx-auto w-full">
      {/* Header & Filtros */}
      <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-200 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Meus Espaços</h1>
            <p className="text-sm text-slate-500 font-medium">
              {spaces.length} espaços cadastrados
            </p>
          </div>
          <Button
            onClick={() => onNavigate("create_space")}
            className="bg-primary hover:bg-primary/90 text-white shadow-md rounded-xl h-11 px-6 font-bold"
          >
            <Plus className="w-5 h-5 mr-2" /> Novo Espaço
          </Button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Buscar espaços..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-slate-50 border-slate-200 rounded-xl"
            />
          </div>
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setSelectedStatus("all")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedStatus === "all" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Todos
            </button>
            <button
              onClick={() => setSelectedStatus("active")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedStatus === "active" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Ativos
            </button>
            <button
              onClick={() => setSelectedStatus("inactive")}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${selectedStatus === "inactive" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Inativos
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Espaços */}
      <div className="space-y-4">
        {filteredSpaces.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 border-dashed">
            <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              Nenhum espaço encontrado.
            </p>
          </div>
        ) : (
          filteredSpaces.map((space) => (
            <div
              key={space.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col sm:flex-row hover:shadow-md transition-shadow"
            >
              <div className="relative h-48 sm:h-auto sm:w-64 bg-slate-100 shrink-0">
                <Image
                  src={space.image}
                  alt={space.name}
                  fill
                  className="object-cover"
                />
                <div className="absolute top-3 left-3">
                  <span
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold text-white shadow-sm backdrop-blur-md ${space.status === "active" ? "bg-emerald-500/90" : "bg-slate-600/90"}`}
                  >
                    {space.status === "active" ? "Ativo" : "Pausado"}
                  </span>
                </div>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="text-lg font-black text-slate-900">
                        {space.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-sm text-slate-500 font-medium mt-1">
                        <MapPin className="w-4 h-4" /> {space.location}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-md">
                      <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                      <span className="text-xs font-bold text-amber-700">
                        {space.rating} ({space.reviews})
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4 my-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">
                        Valor/Hora
                      </p>
                      <p className="text-base font-black text-primary">
                        R$ {space.price}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">
                        Reservas
                      </p>
                      <p className="text-base font-black text-slate-900">
                        {space.bookings}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-1">
                        Faturamento
                      </p>
                      <p className="text-base font-black text-emerald-600">
                        R$ {space.revenue}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => onNavigate("edit_space")}
                    className="flex-1 border-slate-200 text-slate-700 hover:bg-slate-50 font-bold"
                  >
                    <Edit className="w-4 h-4 mr-2" /> Editar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => toggleStatus(space.id)}
                    className={`flex-1 font-bold ${space.status === "active" ? "border-red-200 text-red-600 hover:bg-red-50" : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"}`}
                  >
                    <Power className="w-4 h-4 mr-2" />{" "}
                    {space.status === "active" ? "Pausar" : "Ativar"}
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
