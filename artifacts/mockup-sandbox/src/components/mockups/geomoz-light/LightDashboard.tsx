import React, { useState } from "react";
import { 
  Map, 
  Layers, 
  BarChart2, 
  Download, 
  Settings, 
  Filter, 
  Globe, 
  TrendingUp,
  MapPin,
  ChevronDown,
  Search,
  User,
  Activity,
  Box,
  Hash,
  Maximize
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export function LightDashboard() {
  const [activeTab, setActiveTab] = useState("Mapa");

  const layers = [
    { id: 1, name: "Litologia (1:1M)", active: true, color: "bg-sky-500" },
    { id: 2, name: "Estruturas Geológicas", active: false, color: "bg-rose-500" },
    { id: 3, name: "Ocorrências Minerais", active: true, color: "bg-amber-500" },
    { id: 4, name: "Geofísica (Magnética)", active: false, color: "bg-purple-500" },
    { id: 5, name: "Limites Administrativos", active: true, color: "bg-slate-400" },
  ];

  const lithologies = [
    { name: "Gneisse Migmatítico", percent: 18.4, color: "bg-sky-500" },
    { name: "Granito", percent: 14.2, color: "bg-violet-500" },
    { name: "Basalto", percent: 11.7, color: "bg-emerald-500" },
    { name: "Calcário", percent: 9.3, color: "bg-amber-500" },
    { name: "Quartzito", percent: 7.8, color: "bg-rose-500" },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-white text-slate-900 font-sans overflow-hidden">
      {/* Navbar */}
      <header className="flex-none h-14 border-b border-slate-200 bg-white px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-sky-500 flex items-center justify-center text-white shadow-sm">
              <Globe size={18} />
            </div>
            <span className="font-semibold text-slate-900 tracking-tight text-lg">GeoMoz Explorer</span>
            <Badge variant="outline" className="ml-2 text-xs font-normal border-slate-200 text-slate-500 bg-slate-50">
              Mozambique
            </Badge>
          </div>
          
          <nav className="hidden md:flex items-center gap-1 ml-4">
            {["Mapa", "Análise", "Exportar"].map(item => (
              <button 
                key={item}
                onClick={() => setActiveTab(item)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === item 
                    ? "bg-slate-100 text-slate-900" 
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative hidden md:block">
            <Search className="absolute left-2.5 top-1.5 h-4 w-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar coordenadas ou local..." 
              className="pl-9 pr-4 py-1.5 text-sm border border-slate-200 rounded-md bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-white w-64 transition-all"
            />
          </div>
          <div className="h-6 w-px bg-slate-200 mx-1"></div>
          <button className="text-slate-500 hover:text-slate-900 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100">
            <Settings size={18} />
          </button>
          <Avatar className="h-8 w-8 cursor-pointer border border-slate-200 shadow-sm">
            <AvatarImage src="" />
            <AvatarFallback className="bg-sky-100 text-sky-700 text-xs font-medium">U</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar */}
        <aside className="w-[260px] bg-slate-50 border-r border-slate-200 flex flex-col shrink-0 overflow-y-auto">
          
          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">Filtrar Área</h3>
            </div>
            
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Província</label>
                <div className="relative">
                  <select className="w-full appearance-none bg-white border border-slate-200 text-sm rounded-md pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 cursor-pointer shadow-sm">
                    <option>Todas as Províncias</option>
                    <option>Cabo Delgado</option>
                    <option>Nampula</option>
                    <option>Zambézia</option>
                    <option>Tete</option>
                    <option>Maputo</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-500">Distrito</label>
                <div className="relative">
                  <select className="w-full appearance-none bg-white border border-slate-200 text-sm rounded-md pl-3 pr-8 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 cursor-pointer shadow-sm opacity-60">
                    <option>Selecione a província</option>
                  </select>
                  <ChevronDown className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Layers className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">Camadas</h3>
            </div>
            
            <div className="space-y-2">
              {layers.map(layer => (
                <div key={layer.id} className="flex items-center justify-between p-2 rounded-md hover:bg-slate-100 transition-colors group">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-sm ${layer.color} shadow-sm`}></div>
                    <span className="text-sm text-slate-700 font-medium">{layer.name}</span>
                  </div>
                  <Switch checked={layer.active} />
                </div>
              ))}
            </div>
          </div>

          <div className="p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Colorir por</h3>
            <div className="space-y-2.5">
              {["code2006 (Padrão)", "Legend (Lito)", "ERA", "PERIOD"].map((option, i) => (
                <label key={option} className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input type="radio" name="colorBy" defaultChecked={i === 0} className="peer sr-only" />
                    <div className="w-4 h-4 rounded-full border border-slate-300 peer-checked:border-sky-500 peer-checked:border-4 transition-all"></div>
                  </div>
                  <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">{option}</span>
                </label>
              ))}
            </div>
          </div>
          
        </aside>

        {/* Center Map Area */}
        <main className="flex-1 relative bg-white overflow-hidden flex items-center justify-center shrink-0">
          {/* Subtle grid pattern background */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
               style={{ backgroundImage: 'radial-gradient(#0f172a 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
          
          {/* Map Controls */}
          <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
            <button className="w-8 h-8 bg-white border border-slate-200 rounded-md shadow-sm flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <span className="font-medium leading-none">+</span>
            </button>
            <button className="w-8 h-8 bg-white border border-slate-200 rounded-md shadow-sm flex items-center justify-center text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors">
              <span className="font-medium leading-none">-</span>
            </button>
          </div>

          {/* Map visualization - stylized SVG of Mozambique */}
          <div className="relative w-full max-w-[500px] h-full max-h-[800px] py-8 px-4 flex items-center justify-center opacity-90 drop-shadow-md transition-transform hover:scale-[1.02] duration-500">
            <svg viewBox="0 0 400 800" className="w-full h-full drop-shadow-xl" style={{ filter: 'drop-shadow(0 10px 25px rgba(0,0,0,0.05))' }}>
              {/* Northern region (Niassa, Cabo Delgado) */}
              <path d="M 150 100 L 220 80 L 280 120 L 300 200 L 250 250 L 180 230 Z" fill="#bae6fd" stroke="#fff" strokeWidth="1.5" className="hover:opacity-80 transition-opacity cursor-pointer" />
              <path d="M 280 120 L 350 150 L 330 220 L 300 200 Z" fill="#bbf7d0" stroke="#fff" strokeWidth="1.5" className="hover:opacity-80 transition-opacity cursor-pointer" />
              
              {/* Central-North (Nampula, Zambezia) */}
              <path d="M 250 250 L 300 200 L 330 220 L 380 300 L 340 380 L 220 350 Z" fill="#fde68a" stroke="#fff" strokeWidth="1.5" className="hover:opacity-80 transition-opacity cursor-pointer" />
              <path d="M 180 230 L 250 250 L 220 350 L 150 320 Z" fill="#ddd6fe" stroke="#fff" strokeWidth="1.5" className="hover:opacity-80 transition-opacity cursor-pointer" />
              
              {/* Central (Tete, Manica, Sofala) */}
              <path d="M 150 320 L 220 350 L 240 450 L 180 480 L 100 400 L 80 300 L 120 280 Z" fill="#fecaca" stroke="#fff" strokeWidth="1.5" className="hover:opacity-80 transition-opacity cursor-pointer" />
              <path d="M 220 350 L 340 380 L 280 500 L 240 450 Z" fill="#bfdbfe" stroke="#fff" strokeWidth="1.5" className="hover:opacity-80 transition-opacity cursor-pointer" />
              <path d="M 180 480 L 240 450 L 220 580 L 150 550 Z" fill="#a7f3d0" stroke="#fff" strokeWidth="1.5" className="hover:opacity-80 transition-opacity cursor-pointer" />
              
              {/* South (Inhambane, Gaza, Maputo) */}
              <path d="M 280 500 L 240 450 L 220 580 L 270 650 L 300 580 Z" fill="#fbcfe8" stroke="#fff" strokeWidth="1.5" className="hover:opacity-80 transition-opacity cursor-pointer" />
              <path d="M 220 580 L 150 550 L 120 680 L 180 720 L 240 680 Z" fill="#fed7aa" stroke="#fff" strokeWidth="1.5" className="hover:opacity-80 transition-opacity cursor-pointer" />
              <path d="M 180 720 L 120 680 L 100 750 L 160 780 Z" fill="#e9d5ff" stroke="#fff" strokeWidth="1.5" className="hover:opacity-80 transition-opacity cursor-pointer" />

              {/* Capital Markers */}
              <g stroke="#64748b" strokeWidth="2" strokeLinecap="round">
                <path d="M 195 145 L 205 155 M 205 145 L 195 155" />
                <path d="M 315 165 L 325 175 M 325 165 L 315 175" />
                <path d="M 325 285 L 335 295 M 335 285 L 325 295" />
                <path d="M 135 345 L 145 355 M 145 345 L 135 355" />
                <path d="M 265 435 L 275 445 M 275 435 L 265 445" />
                <path d="M 185 525 L 195 535 M 195 525 L 185 535" />
                <path d="M 265 575 L 275 585 M 275 575 L 265 585" />
                <path d="M 175 645 L 185 655 M 185 645 L 175 655" />
                <circle cx="130" cy="735" r="4" fill="#0f172a" stroke="none" />
                <circle cx="130" cy="735" r="8" fill="none" stroke="#0ea5e9" strokeWidth="1.5" />
              </g>
            </svg>
          </div>

          {/* Legend Overlay */}
          <div className="absolute bottom-6 right-6 bg-white p-4 rounded-xl shadow-lg border border-slate-100 w-56 z-10">
            <h4 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <MapPin size={14} className="text-sky-500" /> Legenda
            </h4>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#bae6fd]"></div>
                <span className="text-xs text-slate-600">Gneisse Migmatítico</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#fde68a]"></div>
                <span className="text-xs text-slate-600">Granito</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#a7f3d0]"></div>
                <span className="text-xs text-slate-600">Basalto</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#fecaca]"></div>
                <span className="text-xs text-slate-600">Quartzito</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-sm bg-[#ddd6fe]"></div>
                <span className="text-xs text-slate-600">Calcário</span>
              </div>
            </div>
          </div>
        </main>

        {/* Right Panel */}
        <aside className="w-[300px] bg-white border-l border-slate-200 flex flex-col shrink-0 overflow-y-auto z-20 shadow-[-4px_0_24px_-16px_rgba(0,0,0,0.1)]">
          <div className="p-4 border-b border-slate-200 bg-slate-50/50">
            <h2 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Activity size={16} className="text-sky-500" />
              Métricas do País
            </h2>
            
            {/* 2x2 Stat Cards */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gradient-to-br from-sky-500 to-blue-600 p-3 rounded-xl text-white shadow-sm shadow-blue-200">
                <div className="flex items-center gap-1.5 mb-2 opacity-80">
                  <Hash size={14} />
                  <span className="text-xs font-medium">Feições</span>
                </div>
                <div className="text-xl font-bold tracking-tight">1,247</div>
              </div>
              
              <div className="bg-gradient-to-br from-violet-500 to-purple-600 p-3 rounded-xl text-white shadow-sm shadow-purple-200">
                <div className="flex items-center gap-1.5 mb-2 opacity-80">
                  <Layers size={14} />
                  <span className="text-xs font-medium">Unidades</span>
                </div>
                <div className="text-xl font-bold tracking-tight">84</div>
              </div>
              
              <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-3 rounded-xl text-white shadow-sm shadow-orange-200">
                <div className="flex items-center gap-1.5 mb-2 opacity-80">
                  <Maximize size={14} />
                  <span className="text-xs font-medium">Área (km²)</span>
                </div>
                <div className="text-xl font-bold tracking-tight">801k</div>
              </div>
              
              <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-3 rounded-xl text-white shadow-sm shadow-teal-200">
                <div className="flex items-center gap-1.5 mb-2 opacity-80">
                  <Box size={14} />
                  <span className="text-xs font-medium">Principal</span>
                </div>
                <div className="text-sm font-bold leading-tight truncate">Gneisse<br/>Migm.</div>
              </div>
            </div>
          </div>

          <div className="p-4 border-b border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <BarChart2 size={16} className="text-violet-500" />
                Top Litologias
              </h3>
              <button className="text-xs font-medium text-sky-600 hover:text-sky-700">Ver todas</button>
            </div>
            
            <div className="space-y-4">
              {lithologies.map((item) => (
                <div key={item.name} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-slate-700">{item.name}</span>
                    <span className="text-slate-500">{item.percent}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${item.color} rounded-full transition-all duration-1000 ease-out`} 
                      style={{ width: `${item.percent}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 flex-1 bg-slate-50/30">
            <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-500" />
              Análise Rápida
            </h3>
            
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">Litologia</th>
                    <th className="py-2.5 px-3 font-medium text-right">Área km²</th>
                    <th className="py-2.5 px-3 font-medium text-right">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 font-medium text-slate-700">Gneisse</td>
                    <td className="py-2 px-3 text-right text-slate-500">147,492</td>
                    <td className="py-2 px-3 text-right font-medium text-sky-600">18.4%</td>
                  </tr>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 font-medium text-slate-700">Granito</td>
                    <td className="py-2 px-3 text-right text-slate-500">113,825</td>
                    <td className="py-2 px-3 text-right font-medium text-violet-600">14.2%</td>
                  </tr>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 font-medium text-slate-700">Basalto</td>
                    <td className="py-2 px-3 text-right text-slate-500">93,786</td>
                    <td className="py-2 px-3 text-right font-medium text-emerald-600">11.7%</td>
                  </tr>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 font-medium text-slate-700">Calcário</td>
                    <td className="py-2 px-3 text-right text-slate-500">74,547</td>
                    <td className="py-2 px-3 text-right font-medium text-amber-600">9.3%</td>
                  </tr>
                  <tr className="hover:bg-slate-50 transition-colors">
                    <td className="py-2 px-3 font-medium text-slate-700">Quartzito</td>
                    <td className="py-2 px-3 text-right text-slate-500">62,524</td>
                    <td className="py-2 px-3 text-right font-medium text-rose-600">7.8%</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <button className="w-full mt-4 flex items-center justify-center gap-2 py-2 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm">
              <Download size={14} />
              Exportar Relatório
            </button>
          </div>
        </aside>

      </div>
    </div>
  );
}
