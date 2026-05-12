import React, { useState } from 'react';
import { Layers, Map as MapIcon, BarChart2, Download, ChevronDown, Globe, Settings2, Compass } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function DarkGIS() {
  const [activeTab, setActiveTab] = useState('analise');
  
  const layers = [
    { id: 'provincias', label: 'Províncias', defaultChecked: true },
    { id: 'distritos', label: 'Distritos', defaultChecked: false },
    { id: 'postos', label: 'Postos', defaultChecked: false },
    { id: 'aldeias', label: 'Aldeias', defaultChecked: false },
    { id: 'geologia', label: 'Geologia', defaultChecked: true },
  ];

  return (
    <div className="flex flex-col h-screen w-full bg-[#0f172a] text-[#e2e8f0] font-sans overflow-hidden">
      {/* Top Navbar */}
      <header className="h-14 bg-[#1e293b] border-b border-[#334155] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-[#06b6d4] p-1.5 rounded-md">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <span className="font-semibold text-lg tracking-tight">GeoMoz Explorer</span>
          <div className="h-4 w-[1px] bg-[#334155] mx-2"></div>
          <div className="text-sm text-[#94a3b8] flex items-center gap-1">
            <span>Mozambique</span>
            <ChevronDown className="w-3 h-3" />
            <span className="text-[#e2e8f0]">Maputo Province</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" className="text-[#94a3b8] hover:text-[#e2e8f0] hover:bg-[#334155]">
            <Settings2 className="w-5 h-5" />
          </Button>
          <div className="w-8 h-8 bg-[#334155] rounded-full flex items-center justify-center text-sm font-medium border border-[#475569]">
            GM
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        
        {/* Left Sidebar - Layer Panel */}
        <aside className="w-[280px] bg-[#1e293b] border-r border-[#334155] flex flex-col shrink-0">
          <div className="h-10 bg-[#334155]/50 flex items-center px-4 border-b border-[#334155] shrink-0">
            <Layers className="w-4 h-4 mr-2 text-[#06b6d4]" />
            <span className="font-medium text-sm">Painel de Camadas</span>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto space-y-6 scrollbar-thin scrollbar-thumb-[#334155]">
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Filtros Regionais</h3>
              <div className="space-y-2">
                <Select defaultValue="all">
                  <SelectTrigger className="w-full bg-[#0f172a] border-[#334155] text-sm h-8">
                    <SelectValue placeholder="Selecione Província" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#1e293b] border-[#334155] text-[#e2e8f0]">
                    <SelectItem value="all">Todas Províncias</SelectItem>
                    <SelectItem value="maputo">Maputo</SelectItem>
                    <SelectItem value="gaza">Gaza</SelectItem>
                    <SelectItem value="inhambane">Inhambane</SelectItem>
                    <SelectItem value="sofala">Sofala</SelectItem>
                    <SelectItem value="manica">Manica</SelectItem>
                    <SelectItem value="tete">Tete</SelectItem>
                    <SelectItem value="zambezia">Zambézia</SelectItem>
                    <SelectItem value="nampula">Nampula</SelectItem>
                    <SelectItem value="cabo_delgado">Cabo Delgado</SelectItem>
                    <SelectItem value="niassa">Niassa</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select disabled>
                  <SelectTrigger className="w-full bg-[#0f172a]/50 border-[#334155]/50 text-sm h-8 opacity-70">
                    <SelectValue placeholder="Selecione Distrito" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos Distritos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Camadas Operacionais</h3>
              <div className="space-y-3 bg-[#0f172a]/30 p-3 rounded-md border border-[#334155]/50">
                {layers.map((layer) => (
                  <div key={layer.id} className="flex items-center justify-between">
                    <span className="text-sm text-[#e2e8f0]">{layer.label}</span>
                    <Switch 
                      defaultChecked={layer.defaultChecked} 
                      className="data-[state=checked]:bg-[#06b6d4]"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Mapa Base</h3>
              <Select defaultValue="topo">
                <SelectTrigger className="w-full bg-[#0f172a] border-[#334155] text-sm h-8">
                  <SelectValue placeholder="Mapa Base" />
                </SelectTrigger>
                <SelectContent className="bg-[#1e293b] border-[#334155] text-[#e2e8f0]">
                  <SelectItem value="topo">Topográfico (Dark)</SelectItem>
                  <SelectItem value="sat">Satélite</SelectItem>
                  <SelectItem value="osm">OpenStreetMap</SelectItem>
                  <SelectItem value="gray">Canvas Cinza</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </aside>

        {/* Main Map Area */}
        <main className="flex-1 relative bg-[#162032] overflow-hidden flex items-center justify-center">
          {/* Map Controls */}
          <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
            <div className="bg-[#1e293b]/90 backdrop-blur border border-[#334155] rounded-md shadow-lg overflow-hidden flex flex-col">
              <button className="w-8 h-8 flex items-center justify-center text-[#e2e8f0] hover:bg-[#334155] hover:text-[#06b6d4] transition-colors border-b border-[#334155]">+</button>
              <button className="w-8 h-8 flex items-center justify-center text-[#e2e8f0] hover:bg-[#334155] hover:text-[#06b6d4] transition-colors">-</button>
            </div>
            <button className="w-8 h-8 bg-[#1e293b]/90 backdrop-blur border border-[#334155] rounded-md shadow-lg flex items-center justify-center text-[#e2e8f0] hover:bg-[#334155] hover:text-[#06b6d4] transition-colors">
              <MapIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Scale & North Arrow */}
          <div className="absolute bottom-6 left-4 z-10 flex flex-col gap-3">
            <div className="w-8 h-8 bg-[#1e293b]/80 backdrop-blur rounded-full border border-[#334155] flex items-center justify-center shadow-lg">
              <Compass className="w-5 h-5 text-[#94a3b8]" />
              <div className="absolute -top-1 font-bold text-[8px] text-[#e2e8f0]">N</div>
            </div>
            <div className="flex items-end">
              <div className="h-2 border-x border-b border-[#e2e8f0] w-32 relative">
                <span className="absolute -top-4 text-[10px] left-0 text-[#e2e8f0]">0</span>
                <span className="absolute -top-4 text-[10px] right-0 text-[#e2e8f0]">100 km</span>
              </div>
            </div>
          </div>

          {/* Map Legend overlay */}
          <div className="absolute bottom-4 right-4 bg-[#1e293b]/90 backdrop-blur border border-[#334155] p-3 rounded-md shadow-lg z-10 text-xs w-48">
            <h4 className="font-semibold mb-2 text-[#e2e8f0] border-b border-[#334155] pb-1">Geologia Dominante</h4>
            <div className="space-y-1.5 mt-2">
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#b45309]"></div><span className="text-[#94a3b8]">Granitos / Sienitos</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#92400e]"></div><span className="text-[#94a3b8]">Gneisse Migmatítico</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#4d7c0f]"></div><span className="text-[#94a3b8]">Sedimentos Aluviais</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#047857]"></div><span className="text-[#94a3b8]">Rochas Vulcânicas</span></div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-sm bg-[#d97706]"></div><span className="text-[#94a3b8]">Complexo de Base</span></div>
            </div>
          </div>

          {/* SVG Map of Mozambique */}
          <div className="w-full h-full p-8 flex items-center justify-center opacity-90">
            <svg viewBox="0 0 500 800" className="w-auto h-full drop-shadow-2xl max-w-full">
              {/* Ocean/Background Lines Context */}
              <path d="M400,0 L400,800 M450,0 L450,800" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" fill="none" />
              <path d="M0,200 L500,200 M0,400 L500,400 M0,600 L500,600" stroke="#1e293b" strokeWidth="1" strokeDasharray="4 4" fill="none" />
              
              <g stroke="#0f172a" strokeWidth="1.5" className="transition-all duration-300">
                {/* Niassa */}
                <g className="hover:opacity-80 cursor-pointer transition-opacity">
                  <path d="M150,50 Q180,30 220,40 Q250,70 230,120 Q200,180 160,170 Q130,150 140,90 Z" fill="#b45309" />
                  <text x="180" y="110" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none">Niassa</text>
                </g>
                
                {/* Cabo Delgado */}
                <g className="hover:opacity-80 cursor-pointer transition-opacity">
                  <path d="M220,40 Q260,20 300,50 Q320,80 290,130 Q260,140 230,120 Z" fill="#92400e" />
                  <text x="260" y="80" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none">Cabo Delgado</text>
                </g>
                
                {/* Nampula */}
                <g className="hover:opacity-80 cursor-pointer transition-opacity">
                  <path d="M230,120 Q290,130 330,160 Q340,210 280,240 Q240,220 220,170 Z" fill="#d97706" />
                  <text x="270" y="180" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none">Nampula</text>
                </g>
                
                {/* Zambézia */}
                <g className="hover:opacity-80 cursor-pointer transition-opacity">
                  <path d="M160,170 Q220,170 280,240 Q250,300 200,320 Q160,280 140,220 Z" fill="#4d7c0f" />
                  <text x="200" y="240" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none">Zambézia</text>
                </g>
                
                {/* Tete */}
                <g className="hover:opacity-80 cursor-pointer transition-opacity">
                  <path d="M60,150 Q130,150 160,170 Q140,220 120,270 Q50,220 40,180 Z" fill="#92400e" />
                  <text x="100" y="200" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none">Tete</text>
                </g>
                
                {/* Manica */}
                <g className="hover:opacity-80 cursor-pointer transition-opacity">
                  <path d="M120,270 Q160,280 160,340 Q150,420 100,400 Q80,350 100,300 Z" fill="#d97706" />
                  <text x="120" y="340" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none">Manica</text>
                </g>
                
                {/* Sofala */}
                <g className="hover:opacity-80 cursor-pointer transition-opacity">
                  <path d="M160,280 Q200,320 230,360 Q210,430 160,450 Q150,420 160,340 Z" fill="#047857" />
                  <text x="190" y="360" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none">Sofala</text>
                </g>
                
                {/* Inhambane */}
                <g className="hover:opacity-80 cursor-pointer transition-opacity">
                  <path d="M160,450 Q210,430 260,500 Q240,600 190,620 Q170,550 150,480 Z" fill="#b45309" />
                  <text x="200" y="530" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none">Inhambane</text>
                </g>
                
                {/* Gaza */}
                <g className="hover:opacity-80 cursor-pointer transition-opacity">
                  <path d="M100,400 Q150,420 160,450 Q150,480 170,550 Q190,620 130,680 Q100,600 80,500 Z" fill="#4d7c0f" />
                  <text x="130" y="550" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none">Gaza</text>
                </g>
                
                {/* Maputo */}
                <g className="hover:opacity-80 cursor-pointer transition-opacity">
                  <path d="M130,680 Q190,620 210,650 Q180,720 150,750 Q110,730 130,680 Z" fill="#d97706" />
                  <text x="160" y="690" fill="#ffffff" fontSize="10" fontWeight="bold" textAnchor="middle" stroke="none">Maputo</text>
                  {/* Highlight current selection */}
                  <path d="M130,680 Q190,620 210,650 Q180,720 150,750 Q110,730 130,680 Z" fill="none" stroke="#06b6d4" strokeWidth="3" />
                </g>
              </g>
            </svg>
          </div>
        </main>

        {/* Right Panel - Analysis */}
        <aside className="w-[320px] bg-[#1e293b] border-l border-[#334155] flex flex-col shrink-0">
          <div className="h-10 bg-[#334155]/50 flex items-center px-4 border-b border-[#334155] shrink-0">
            <BarChart2 className="w-4 h-4 mr-2 text-[#06b6d4]" />
            <span className="font-medium text-sm">Painel Analítico</span>
          </div>
          
          <div className="flex-1 overflow-hidden flex flex-col">
            <Tabs defaultValue="analise" className="flex-1 flex flex-col h-full" onValueChange={setActiveTab}>
              <div className="px-4 pt-4 shrink-0">
                <TabsList className="w-full bg-[#0f172a] border border-[#334155]">
                  <TabsTrigger value="analise" className="flex-1 data-[state=active]:bg-[#1e293b] data-[state=active]:text-[#06b6d4]">Análise</TabsTrigger>
                  <TabsTrigger value="estatisticas" className="flex-1 data-[state=active]:bg-[#1e293b] data-[state=active]:text-[#06b6d4]">Estatísticas</TabsTrigger>
                  <TabsTrigger value="exportar" className="flex-1 data-[state=active]:bg-[#1e293b] data-[state=active]:text-[#06b6d4]">Exportar</TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-[#334155]">
                <TabsContent value="analise" className="m-0 space-y-4">
                  <div className="text-xs text-[#94a3b8] mb-2 uppercase tracking-wide">Métricas da Seleção Atual</div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="bg-[#0f172a] border-[#334155]">
                      <CardContent className="p-3">
                        <div className="text-[10px] text-[#94a3b8] uppercase mb-1">Total Features</div>
                        <div className="text-xl font-semibold text-[#e2e8f0]">1,247</div>
                      </CardContent>
                    </Card>
                    <Card className="bg-[#0f172a] border-[#334155]">
                      <CardContent className="p-3">
                        <div className="text-[10px] text-[#94a3b8] uppercase mb-1">Unidades Geológicas</div>
                        <div className="text-xl font-semibold text-[#e2e8f0]">84</div>
                      </CardContent>
                    </Card>
                  </div>
                  
                  <Card className="bg-[#0f172a] border-[#334155]">
                    <CardContent className="p-3">
                      <div className="text-[10px] text-[#94a3b8] uppercase mb-1">Área Total</div>
                      <div className="text-xl font-semibold text-[#e2e8f0]">801,590 <span className="text-sm font-normal text-[#94a3b8]">km²</span></div>
                    </CardContent>
                  </Card>
                  
                  <Card className="bg-[#0f172a] border-[#334155]">
                    <CardContent className="p-3">
                      <div className="text-[10px] text-[#94a3b8] uppercase mb-1">Litologia Dominante</div>
                      <div className="text-md font-semibold text-[#06b6d4]">Gneisse Migmatítico</div>
                      <div className="text-xs text-[#94a3b8] mt-1">Ocupa ~32% da área total selecionada</div>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="estatisticas" className="m-0 space-y-4">
                  <div className="text-xs text-[#94a3b8] mb-4 uppercase tracking-wide">Top 5 Litologias (Área)</div>
                  
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#e2e8f0]">Gneisse Migmatítico</span>
                        <span className="text-[#94a3b8]">32%</span>
                      </div>
                      <div className="w-full h-2 bg-[#0f172a] rounded-full overflow-hidden">
                        <div className="h-full bg-[#92400e] w-[32%] rounded-full"></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#e2e8f0]">Sedimentos Aluviais</span>
                        <span className="text-[#94a3b8]">24%</span>
                      </div>
                      <div className="w-full h-2 bg-[#0f172a] rounded-full overflow-hidden">
                        <div className="h-full bg-[#4d7c0f] w-[24%] rounded-full"></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#e2e8f0]">Granitos / Sienitos</span>
                        <span className="text-[#94a3b8]">18%</span>
                      </div>
                      <div className="w-full h-2 bg-[#0f172a] rounded-full overflow-hidden">
                        <div className="h-full bg-[#b45309] w-[18%] rounded-full"></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#e2e8f0]">Complexo de Base</span>
                        <span className="text-[#94a3b8]">15%</span>
                      </div>
                      <div className="w-full h-2 bg-[#0f172a] rounded-full overflow-hidden">
                        <div className="h-full bg-[#d97706] w-[15%] rounded-full"></div>
                      </div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-[#e2e8f0]">Rochas Vulcânicas</span>
                        <span className="text-[#94a3b8]">11%</span>
                      </div>
                      <div className="w-full h-2 bg-[#0f172a] rounded-full overflow-hidden">
                        <div className="h-full bg-[#047857] w-[11%] rounded-full"></div>
                      </div>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="exportar" className="m-0 space-y-4">
                  <div className="text-xs text-[#94a3b8] mb-4 uppercase tracking-wide">Exportar Dados Atuais</div>
                  
                  <div className="space-y-3">
                    <Button variant="outline" className="w-full justify-start bg-[#0f172a] border-[#334155] hover:bg-[#334155] hover:text-[#e2e8f0] text-[#e2e8f0]">
                      <MapIcon className="w-4 h-4 mr-2 text-[#06b6d4]" />
                      Exportar Mapa HTML
                    </Button>
                    
                    <Button variant="outline" className="w-full justify-start bg-[#0f172a] border-[#334155] hover:bg-[#334155] hover:text-[#e2e8f0] text-[#e2e8f0]">
                      <Download className="w-4 h-4 mr-2 text-[#06b6d4]" />
                      Exportar CSV (Atributos)
                    </Button>
                    
                    <Button variant="outline" className="w-full justify-start bg-[#0f172a] border-[#334155] hover:bg-[#334155] hover:text-[#e2e8f0] text-[#e2e8f0]">
                      <Layers className="w-4 h-4 mr-2 text-[#06b6d4]" />
                      Exportar GeoJSON
                    </Button>
                  </div>
                  
                  <div className="mt-6 p-3 bg-[#0f172a]/50 border border-[#334155]/50 rounded-md">
                    <p className="text-xs text-[#94a3b8] leading-relaxed">
                      Nota: A exportação está limitada a 5.000 features na versão atual. Para datasets maiores, utilize a API REST.
                    </p>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </div>
        </aside>

      </div>
    </div>
  );
}
