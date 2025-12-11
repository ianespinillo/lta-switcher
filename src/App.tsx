import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, MonitorPlay } from "lucide-react";
import { Toaster, toast } from "sonner";
// --- SHADCN UI COMPONENTS ---
// Asegurate de importar desde tus rutas locales donde instalaste shadcn
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Button } from "./components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import { Competition, Country } from "./types";

function App() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);

  // Guardamos el ID como string porque el Select de shadcn maneja strings
  const [selectedCountryId, setSelectedCountryId] = useState<string>("");
  const [selectedCompId, setSelectedCompId] = useState<string>("");

  const [_, setSelectedCountryData] = useState<Country | null>(null);
  const [selectedCompData, setSelectedCompData] = useState<Competition | null>(
    null
  );

  const [isApplying, setIsApplying] = useState(false);

  // --- LÓGICA DE CARGA INICIAL ---
  useEffect(() => {
    invoke<Country[]>("get_countries")
      .then(setCountries)
      .catch((e) => console.error("Error cargando países:", e));
  }, []);

  // --- MANEJADORES DE SELECCIÓN ---
  const handleCountryChange = (countryIdStr: string) => {
    setSelectedCountryId(countryIdStr);
    setSelectedCompId(""); // Resetear competencia
    setCompetitions([]);
    setSelectedCompData(null);

    const countryId = parseInt(countryIdStr);
    const country = countries.find((c) => c.id === countryId) || null;
    setSelectedCountryData(country);

    if (countryId) {
      invoke<Competition[]>("get_competitions_by_country", {
        countryId: countryId,
      })
        .then(setCompetitions)
        .catch(console.error);
    }
  };
  const handleRemove = () =>{
    const promise = invoke('remove_current_scoreboard')
    toast.promise(promise, {
    loading: 'Restaurando original...',
    success: (msg) => {
      // Opcional: Limpiamos la selección visual
      // setSelectedCompId(""); 
      // setSelectedCompData(null);
      return `${msg}`;
    },
    error: (err) => `Error: ${err}`,
  });
  }
  const handleCompetitionChange = (compIdStr: string) => {
    setSelectedCompId(compIdStr);
    const compId = parseInt(compIdStr);
    const comp = competitions.find((c) => c.id === compId) || null;
    setSelectedCompData(comp);
  };

  const handleApply = async () => {
    // Verificaciones de seguridad
    if (!selectedCompId || !selectedCompData) {
      toast.warning("No hay un marcador selleccionado!");
      return;
    }

    setIsApplying(true);
    toast.info("Aplicando scoreboard...");
    try {
      // 1. Llamamos a Rust pasando el ID de la competición seleccionada
      // Rust se encarga de buscar el BLOB y escribirlo en C:\...
      await invoke("install_competition", {
        competitionId: selectedCompData.id,
      });

      // 2. Feedback visual de éxito
      // Podrías usar un 'toast' de shadcn si lo tenés instalado, por ahora un alert:
      toast.success("Scoreboard instalado satisfactoriamente");

      // Opcional: alert("✅ Scoreboard instalado correctamente en FC 26 Live Editor");
    } catch (error) {
      console.error("Error instalando:", error);
      toast.error("❌ Error instalando");
    } finally {
      // 3. Terminamos la animación de carga
      // Un pequeño delay artificial para que la animación se vea suave (opcional)
      setTimeout(() => setIsApplying(false), 500);
    }
  };

  // --- HELPER PARA IMÁGENES ---
  const arrayToUrl = (byteArray: number[], type: string = "image,png") => {
    if (!byteArray || byteArray.length === 0) return "";
    const blob = new Blob([new Uint8Array(byteArray)], { type });
    return URL.createObjectURL(blob);
  };

  // URL de imagen de fondo para el preview (puedes cambiarla por una local en assets)
  const bgPreviewUrl = "/fondo.png";

  return (
    // CONTENEDOR PRINCIPAL CON FONDO DEGRADADO Y MALLA
    <div className="h-full w-full text-white font-sans relative overflow-hidden bg-[#0a0a0a] flex items-center justify-center p-8">
      {/* 1. CAPA DE FONDO (Degradado Violeta/Azul a Verde) */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950 via-[#0a0a0a] to-emerald-950 z-0"></div>
      <Toaster theme="dark" richColors position="bottom-right" expand={true} />
      {/* 2. CAPA DE MALLA (Patrón Hexagonal sutil) */}
      <div
        className="absolute inset-0 opacity-20 z-0 mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Cpath d='M20 0L0 10v20l20 10 20-10V10L20 0zm0 2.31L37.69 11v18L20 37.69 2.31 29V11L20 2.31zM20 5L5 12.5v15L20 35l15-7.5v-15L20 5z' fill='%23ffffff' fill-opacity='0.15' fill-rule='evenodd'/%3E%3C/svg%3E")`,
          backgroundSize: "60px 60px",
        }}
      ></div>

      {/* --- CARD PRINCIPAL (Shadcn) --- */}
      <Card className="relative z-10 w-full max-w-5xl bg-black/40 border-white/10 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* HEADER */}
        <CardHeader className="border-b border-white/5 pb-6">
          <div className="flex justify-between items-center">
            <CardTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="h-8 w-1.5 bg-green-500 rounded-full shadow-[0_0_15px_rgba(34,197,94,0.6)]"></div>
              <span>LTA Switcher</span>
            </CardTitle>
            {/* Logo EA FC24 Simulado */}
            <div className="italic font-black text-2xl tracking-tighter text-white/30 select-none">
              EA SPORTS <span className="text-white">FC26</span>
            </div>
          </div>
          <CardDescription className="text-white/50 ml-4">
            Selecciona tu marcador favorito y aplicalo al juego
          </CardDescription>
        </CardHeader>

        {/* CONTENIDO: GRID DE 2 COLUMNAS */}
        <CardContent className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-8">
          {/* --- COLUMNA IZQUIERDA: SELECTORES --- */}
          <div className="lg:col-span-5 flex flex-col gap-8 justify-center">
            {/* Selector País */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-white/60 uppercase tracking-wider ml-1">
                Pais
              </label>
              <Select
                onValueChange={handleCountryChange}
                value={selectedCountryId}
              >
                <SelectTrigger className="w-full h-16 bg-white/5 border-white/10 hover:bg-white/10 transition-colors text-lg rounded-xl focus:ring-green-500/50">
                  <SelectValue placeholder="Seleccione un pais..." />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/10 text-white max-h-[300px]">
                  {countries.map((c) => (
                    <SelectItem
                      key={c.id}
                      value={c.id.toString()}
                      className="focus:bg-white/10 cursor-pointer py-3 text-base"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={arrayToUrl(c.flag_blob, "image/svg+xml")}
                          className="w-8 h-5 object-cover rounded shadow-sm"
                          alt=""
                        />
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Selector Competición */}
            <div
              className={`space-y-3 transition-all duration-500 ${
                selectedCountryId
                  ? "opacity-100 transform-none"
                  : "opacity-50 translate-y-4 pointer-events-none"
              }`}
            >
              <label className="text-sm font-medium text-white/60 uppercase tracking-wider ml-1">
                Competicion
              </label>
              <Select
                onValueChange={handleCompetitionChange}
                value={selectedCompId}
                disabled={!selectedCountryId}
              >
                <SelectTrigger className="w-full h-16 bg-white/5 border-white/10 hover:bg-white/10 transition-colors text-lg rounded-xl focus:ring-green-500/50 disabled:opacity-50">
                  <SelectValue
                    placeholder={
                      selectedCountryId
                        ? "Seleccione una competicion..."
                        : "Esperando por seleccion de pais..."
                    }
                  />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1a] border-white/10 text-white max-h-[300px]">
                  {competitions.map((c) => (
                    <SelectItem
                      key={c.id}
                      value={c.id.toString()}
                      className="focus:bg-white/10 cursor-pointer py-3 text-base"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={arrayToUrl(c.logo_blob)}
                          className="w-6 h-6 object-contain"
                          alt=""
                        />
                        <span className="font-medium">{c.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* --- COLUMNA DERECHA: PREVIEW --- */}
          <div className="lg:col-span-7 flex flex-col justify-center">
            {/* Contenedor estilo "Pantalla de TV" */}
            <div className="relative aspect-video bg-black/50 rounded-2xl border-2 border-white/10 overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)] group">
              {/* Imagen de Fondo (Gameplay) */}
              <img
                src={bgPreviewUrl}
                className={`absolute inset-0 w-full h-full object-cover transition-all duration-700 ${
                  selectedCompData
                    ? "opacity-40 scale-105 blur-sm"
                    : "opacity-20 grayscale"
                }`}
                alt="Preview Background"
              />

              {/* Contenido del Preview */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center z-10">
                {selectedCompData ? (
                  // ESTADO: Competencia Seleccionada
                  <div className="animate-in fade-in zoom-in duration-500 flex flex-col items-center">
                    {/* Logo Grande */}
                    <img
                      src={arrayToUrl(selectedCompData.logo_blob)}
                      className="h-40 w-40 object-contain drop-shadow-[0_0_25px_rgba(255,255,255,0.2)]"
                      alt={selectedCompData.name}
                    />

                    <h2 className="text-3xl font-black tracking-tight mt-6 text-white uppercase drop-shadow-lg">
                      {selectedCompData.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-2 text-lg text-green-400 font-medium bg-black/60 px-4 py-1 rounded-full backdrop-blur-md border border-green-500/30">
                      <Check className="w-5 h-5" /> Listo para aplicar
                    </div>
                  </div>
                ) : (
                  // ESTADO: Nada seleccionado (Placeholder)
                  <div className="text-white/30 flex flex-col items-center gap-4">
                    <MonitorPlay
                      className="w-24 h-24 opacity-50"
                      strokeWidth={1}
                    />
                    <p className="text-xl font-light uppercase tracking-widest">
                      Area de previsualisacion
                    </p>
                    <p className="text-sm">
                      Selleccione una competencia para ver detalles
                    </p>
                  </div>
                )}
              </div>

              {/* Efecto de Scanline sutil */}
              <div className="absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,0.1)_50%)] bg-[length:100%_4px] pointer-events-none opacity-30"></div>
            </div>
          </div>
        </CardContent>

        {/* FOOTER CON BOTONES DE ACCIÓN */}
        <CardFooter className="border-t border-white/5 bg-black/20 p-6 flex justify-end gap-4">
          <Button
          onClick={handleRemove}
            variant="outline"
            className="border-white/10 hover:bg-white/5 text-white hover:text-white px-8 h-12 text-base rounded-xl"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleApply}
            disabled={!selectedCompData || isApplying}
            className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white border-0 h-12 px-10 text-base font-bold tracking-wide rounded-xl shadow-[0_0_20px_rgba(34,197,94,0.4)] hover:shadow-[0_0_30px_rgba(34,197,94,0.6)] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isApplying ? (
              <div className="flex items-center gap-2">
                <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Aplicando...
              </div>
            ) : (
              "Aplicar marcador"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default App;
