import {
  ChangeEvent,
  Component,
  DragEvent,
  ErrorInfo,
  ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Activity,
  AlignJustify,
  BarChart3,
  Box,
  Building2,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileUp,
  Filter,
  Layers,
  Map,
  Mountain,
  Move3D,
  PanelRight,
  Ruler,
  Scissors,
  Tag,
  Trash2,
  Waypoints,
} from "lucide-react";
import {
  ActiveTool,
  AlignmentData,
  BimEngine,
  CategoryInfo,
  EngineStatus,
  LoadedModel,
  MeasurementKind,
  SelectionPayload,
} from "./bim/engine";

type ToolKey = ActiveTool | "alignment" | "profile" | "buildings" | "quantities";
type InspectorTab = "models" | "categories" | "properties";

const tools: Array<{ key: ToolKey; label: string; icon: typeof Ruler; hint?: string }> = [
  { key: "select",    label: "Seleccion",   icon: Box,       hint: "Click para seleccionar · Esc para limpiar" },
  { key: "measure",   label: "Medicion",    icon: Ruler,     hint: "Click para anclar puntos · Supr borra · F encuadra" },
  { key: "sections",  label: "Secciones",   icon: Scissors,  hint: "Doble-click para cortar · Supr borra plano activo" },
  { key: "alignment", label: "Progresivas", icon: Waypoints, hint: "Disponible al cargar un IFC con datos de alineamiento" },
  { key: "profile",   label: "Perfil",      icon: Mountain,  hint: "Perfil longitudinal sincronizado con el modelo" },
  { key: "buildings", label: "Edificaciones", icon: Building2 },
  { key: "quantities", label: "Cantidades", icon: BarChart3 },
];

const measurementModes: Array<{ key: MeasurementKind; label: string }> = [
  { key: "length", label: "Longitud" },
  { key: "area", label: "Area" },
  { key: "angle", label: "Angulo" },
  { key: "volume", label: "Volumen" },
];

function App() {
  const viewportRef   = useRef<HTMLDivElement | null>(null);
  const planPanelRef  = useRef<HTMLDivElement | null>(null);
  const elevPanelRef  = useRef<HTMLDivElement | null>(null);
  const crossPanelRef = useRef<HTMLDivElement | null>(null);
  const engineRef     = useRef<BimEngine | null>(null);
  const ifcInputRef   = useRef<HTMLInputElement>(null);
  const fragInputRef  = useRef<HTMLInputElement>(null);
  const panelsInited  = useRef(false);

  const [status,       setStatus]       = useState<EngineStatus>("idle");
  const [message,      setMessage]      = useState("Inicializando interfaz");
  const [progress,     setProgress]     = useState<number | null>(null);
  const [activeTool,   setActiveTool]   = useState<ToolKey>("select");
  const [models,       setModels]       = useState<LoadedModel[]>([]);
  const [selection,    setSelection]    = useState<SelectionPayload | null>(null);
  const [isOrtho,      setIsOrtho]      = useState(false);
  const [categories,   setCategories]   = useState<CategoryInfo[]>([]);
  const [alignments,   setAlignments]   = useState<AlignmentData[]>([]);
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("models");
  const [isDragging,   setIsDragging]   = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"3d" | "plan" | "profile" | "section">("3d");
  const [activeStation, setActiveStation] = useState<number | null>(null);
  const [measurementKind, setMeasurementKind] = useState<MeasurementKind>("length");

  // Engine initialization
  useEffect(() => {
    if (!viewportRef.current || engineRef.current) return;
    const engine = new BimEngine(viewportRef.current);
    engineRef.current = engine;

    engine.init({
      onStatus: (s, m) => { setStatus(s); if (m) setMessage(m); },
      onProgress: setProgress,
      onModelLoaded:  (model) => setModels((prev) => [...prev.filter((m) => m.id !== model.id), model]),
      onModelRemoved: (id)    => setModels((prev) => prev.filter((m) => m.id !== id)),
      onModelVisibilityChange: (id, visible) =>
        setModels((prev) => prev.map((m) => (m.id === id ? { ...m, visible } : m))),
      onSelection: (payload) => {
        setSelection(payload);
        if (payload) setInspectorTab("properties");
      },
      onProjectionChange:  setIsOrtho,
      onCategoriesChange:  setCategories,
      onAlignmentsChange:  setAlignments,
      onStationChange: (station) => {
        if (typeof station === "number") setActiveStation(station);
      },
    }).catch((err) => {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Error al iniciar motor");
    });

    return () => { engineRef.current?.dispose(); engineRef.current = null; };
  }, []);

  // Sync active tool to engine
  useEffect(() => {
    const tool: ActiveTool =
      activeTool === "measure"  ? "measure"  :
      activeTool === "sections" ? "sections" : "select";
    engineRef.current?.setActiveTool(tool);
  }, [activeTool]);

  useEffect(() => {
    engineRef.current?.setMeasurementKind(measurementKind);
  }, [measurementKind]);

  // File handlers
  const handleIfcFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await engineRef.current?.loadIfc(file);
    e.target.value = "";
  };
  const handleFragFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await engineRef.current?.loadFragment(file);
    e.target.value = "";
  };

  // Drag & drop
  const handleDragOver  = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  };
  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const name = file.name.toLowerCase();
    if (name.endsWith(".frag"))             await engineRef.current?.loadFragment(file);
    else if (name.endsWith(".ifc") || name.endsWith(".ifczip")) await engineRef.current?.loadIfc(file);
  };

  // Camera
  const handleFit       = () => void engineRef.current?.fitAll();
  const handleView      = (v: "top" | "front" | "right") => void engineRef.current?.setView(v);
  const handleProjection = () => void engineRef.current?.toggleProjection();

  // Category filter
  const handleCategoryClick = async (name: string) => {
    const engine = engineRef.current;
    if (!engine) return;
    if (activeCategory === name) {
      setActiveCategory(null);
      await engine.showAll();
    } else {
      setActiveCategory(name);
      await engine.isolateCategory(name);
    }
  };

  const activeTip = tools.find((t) => t.key === activeTool)?.hint;

  const handleViewTab = (view: "3d" | "plan" | "profile" | "section") => {
    setActiveView(view);
    if (view !== "3d" && !panelsInited.current) {
      const plan  = planPanelRef.current;
      const elev  = elevPanelRef.current;
      const cross = crossPanelRef.current;
      if (plan && elev && cross && engineRef.current) {
        panelsInited.current = true;
        void engineRef.current.setupCivilPanels(plan, elev, cross);
      }
    }
  };

  // Primary alignment read from IFC data. No synthetic civil data is shown.
  const primaryAlignment = alignments[0] ?? null;
  const hasIfcAlignment = Boolean(primaryAlignment);

  const handleStationSelect = (station: number) => {
    setActiveStation(station);
    if (primaryAlignment) {
      void engineRef.current?.goToStation(primaryAlignment.modelId, station);
    }
  };

  return (
    <AppErrorBoundary>
      <div className="app-shell">
      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            {/* Custom logo — place your file at public/logo.png */}
            <img src="/logo.png" alt="Logo" className="brand-logo" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            <Box size={20} className="brand-logo-fallback" />
          </div>
          <div>
            <strong>IFCViewer</strong>
            <span>Infraestructura + edificaciones</span>
          </div>
        </div>

        <div className="status-strip">
          <Activity size={15} />
          <span className={`status-dot ${status}`} />
          <span className="status-msg">{message}</span>
          {progress !== null && (
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>

        <div className="topbar-actions">
          <button className="action-btn secondary" title="Cargar fragmento .frag (carga rapida sin conversión)"
            onClick={() => fragInputRef.current?.click()}>
            <Download size={15} /><span>.frag</span>
          </button>
          <input ref={fragInputRef} type="file" accept=".frag" style={{ display: "none" }} onChange={handleFragFile} />

          <label className="upload-button">
            <FileUp size={15} /><span>Cargar IFC</span>
            <input ref={ifcInputRef} type="file" accept=".ifc,.ifczip" onChange={handleIfcFile} />
          </label>
        </div>
      </header>

      {/* ── Workspace ── */}
      <main className="workspace">
        {/* Tool rail */}
        <aside className="tool-rail" aria-label="Herramientas">
          {tools.map(({ key, label, icon: Icon }) => (
            <button key={key} className={activeTool === key ? "active" : ""} title={label}
              onClick={() => setActiveTool(key)}>
              <Icon size={20} />
            </button>
          ))}
        </aside>

        {/* Viewer zone */}
        <section className="viewer-zone">
          {/* Viewport header */}
          <div className="viewport-header">
            <div className="viewport-title">
              <span className="eyebrow">Vista federada</span>
              <h1>Corredor, secciones y entorno construido</h1>
            </div>
            <div className="camera-controls">
              <button className="cam-btn" title="Encuadrar todo (F)" onClick={handleFit}>
                <AlignJustify size={14} /><span>Fit</span>
              </button>
              <div className="cam-divider" />
              <button className="cam-btn" title="Vista superior" onClick={() => handleView("top")}>Top</button>
              <button className="cam-btn" title="Vista frontal"  onClick={() => handleView("front")}>Front</button>
              <button className="cam-btn" title="Vista lateral"  onClick={() => handleView("right")}>Side</button>
              <div className="cam-divider" />
              <button className={`cam-btn proj-toggle ${isOrtho ? "active" : ""}`}
                title="Alternar perspectiva / ortográfico" onClick={handleProjection}>
                {isOrtho ? "Orto" : "Persp"}
              </button>
            </div>
            <div className="view-tabs">
              <button className={activeView === "3d" ? "active" : ""} onClick={() => handleViewTab("3d")}>3D</button>
              <button className={activeView === "plan" ? "active" : ""} onClick={() => handleViewTab("plan")}>Planta</button>
              <button className={activeView === "section" ? "active" : ""} onClick={() => handleViewTab("section")}>Sección</button>
              <button className={activeView === "profile" ? "active" : ""} onClick={() => handleViewTab("profile")}>Perfil</button>
            </div>
          </div>

          {/* Tool hint */}
          <div className={`tool-hint${activeTip ? "" : " tool-hint--hidden"}`}>
            <ChevronRight size={12} />
            <span>{activeTip ?? ""}</span>
            {activeTool === "measure" && (
              <div className="measurement-modes" aria-label="Tipo de medicion">
                {measurementModes.map((mode) => (
                  <button
                    key={mode.key}
                    className={measurementKind === mode.key ? "active" : ""}
                    onClick={() => setMeasurementKind(mode.key)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 3D Viewport — always mounted so WebGL context is preserved */}
          <div
            className={`viewport ${isDragging ? "dragging" : ""}`}
            ref={viewportRef}
            style={{ display: activeView === "3d" ? undefined : "none" }}
            onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
          >
            {isDragging && (
              <div className="drag-overlay">
                <Layers size={32} />
                <strong>Soltar .ifc o .frag aquí</strong>
              </div>
            )}
            {models.length === 0 && status !== "loading" && !isDragging && (
              <div className="drop-hint">
                <Layers size={30} />
                <strong>Arrastra tu primer modelo aquí</strong>
                <span>Acepta .ifc, .ifczip o .frag. Puedes federar varios modelos en la misma escena.</span>
              </div>
            )}
            {models.length > 0 && (
              <div className="visibility-legend">
                {models.map((model) => (
                  <button key={model.id}
                    className={`vis-chip ${model.visible ? "visible" : "hidden"}`}
                    title={model.visible ? "Click para ocultar" : "Click para mostrar"}
                    onClick={() => engineRef.current?.toggleModelVisibility(model.id)}>
                    {model.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                    <span>{shortenName(model.name)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 2D civil panels: That Open canvas + technical overlays */}
          <div className="civil-panel" style={{ display: activeView === "plan" ? undefined : "none" }}>
            <div className="civil-panel-label">Planta - Alineamiento horizontal</div>
            <div className="civil-canvas" ref={planPanelRef} />
            <CivilPlanView
              alignment={primaryAlignment}
              activeStation={activeStation}
              hasIfcAlignment={hasIfcAlignment}
              onSelectStation={handleStationSelect}
            />
          </div>
          <div className="civil-panel" style={{ display: activeView === "profile" ? undefined : "none" }}>
            <div className="civil-panel-label">Perfil longitudinal - rasante y terreno</div>
            <div className="civil-canvas" ref={elevPanelRef} />
            <CivilProfileView
              alignment={primaryAlignment}
              activeStation={activeStation}
              hasIfcAlignment={hasIfcAlignment}
              onSelectStation={handleStationSelect}
            />
          </div>
          <div className="civil-panel" style={{ display: activeView === "section" ? undefined : "none" }}>
            <div className="civil-panel-label">Seccion transversal - progresiva activa</div>
            <div className="civil-canvas" ref={crossPanelRef} />
            <CrossSectionView
              alignment={primaryAlignment}
              activeStation={activeStation}
              hasIfcAlignment={hasIfcAlignment}
            />
          </div>

          {/* Summary profile strip — shown in 3D view when alignment loaded */}
          {activeView === "3d" && (
            <section className="profile-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Perfil longitudinal</span>
                  <h2>
                    {primaryAlignment
                      ? `${primaryAlignment.name} · ${primaryAlignment.length.toFixed(0)} m`
                      : "Sin alineamiento IFC detectado"}
                  </h2>
                </div>
                {primaryAlignment && (
                  <button title="Ver perfil completo" onClick={() => handleViewTab("profile")}>
                    <Move3D size={16} />
                  </button>
                )}
              </div>
              {primaryAlignment ? (
                <AlignmentProfile
                  alignment={primaryAlignment}
                  activeStation={activeStation ?? primaryAlignment.initialStation}
                />
              ) : (
                <div className="profile-empty">
                  Carga un IFC con IfcAlignment para ver progresivas y perfil longitudinal del modelo.
                </div>
              )}
            </section>
          )}
        </section>

        {/* Inspector */}
        <aside className="inspector">
          {/* Tab navigation */}
          <div className="inspector-tabs">
            <button className={inspectorTab === "models" ? "active" : ""} onClick={() => setInspectorTab("models")} title="Modelos cargados">
              <Building2 size={14} /><span>Modelos</span>
              {models.length > 0 && <em>{models.length}</em>}
            </button>
            <button className={inspectorTab === "categories" ? "active" : ""} onClick={() => setInspectorTab("categories")} title="Categorias IFC">
              <Tag size={14} /><span>Categorías</span>
              {categories.length > 0 && <em>{categories.length}</em>}
            </button>
            <button className={inspectorTab === "properties" ? "active" : ""} onClick={() => setInspectorTab("properties")} title="Propiedades del elemento">
              <Filter size={14} /><span>Propiedades</span>
              {selection && <em>!</em>}
            </button>
          </div>

          {/* Models tab */}
          {inspectorTab === "models" && (
            <section className="tab-content side-section">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Federación activa</span>
                  <h2>{models.length === 0 ? "Sin modelos" : `${models.length} modelo${models.length !== 1 ? "s" : ""}`}</h2>
                </div>
                <PanelRight size={17} />
              </div>
              <div className="model-list">
                {models.length === 0 ? (
                  <div className="empty-state">Carga un archivo IFC o .frag para comenzar la federación.</div>
                ) : (
                  models.map((model) => (
                    <ModelRow key={model.id} model={model}
                      onToggleVisibility={() => engineRef.current?.toggleModelVisibility(model.id)}
                      onExport={() => void engineRef.current?.exportFragment(model.id)}
                      onRemove={() => engineRef.current?.removeModel(model.id)}
                      onFit={() => void engineRef.current?.fitToModel(model.id)}
                      hasAlignment={alignments.some((a) => a.modelId === model.id)}
                    />
                  ))
                )}
              </div>
            </section>
          )}

          {/* Categories tab */}
          {inspectorTab === "categories" && (
            <section className="tab-content side-section">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Tipos IFC detectados</span>
                  <h2>{categories.length === 0 ? "Sin datos" : `${categories.length} tipos`}</h2>
                </div>
                {activeCategory && (
                  <button className="reset-btn" onClick={() => { setActiveCategory(null); void engineRef.current?.showAll(); }}>
                    Mostrar todo
                  </button>
                )}
              </div>
              {categories.length === 0 ? (
                <div className="empty-state">Carga un modelo IFC para ver sus categorías.</div>
              ) : (
                <div className="category-list">
                  {categories.map((cat) => (
                    <button key={cat.name}
                      className={`category-row ${activeCategory === cat.name ? "active" : ""}`}
                      onClick={() => void handleCategoryClick(cat.name)}
                      title={`${cat.count} elementos · click para aislar`}>
                      <span className="cat-name">{formatIfcType(cat.name)}</span>
                      <span className="cat-raw">{cat.name}</span>
                      <span className="cat-count">{cat.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Properties tab */}
          {inspectorTab === "properties" && (
            <section className="tab-content side-section">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Elemento seleccionado</span>
                  <h2>{selection ? getElementName(selection) : "Sin selección"}</h2>
                </div>
              </div>
              <PropertyPanel selection={selection} />
            </section>
          )}

          {/* Stations — from loaded alignment or empty */}
          <section className="side-section station-section">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">Progresivas</span>
                <h2>{primaryAlignment ? primaryAlignment.name : "Sin alineamiento"}</h2>
              </div>
              <Map size={17} />
            </div>
            {primaryAlignment ? (
              <div className="station-list">
                {primaryAlignment.stations.map((s) => (
                  <button
                    key={s.station}
                    className={activeStation !== null && Math.abs(s.station - activeStation) < 0.1 ? "active" : ""}
                    onClick={() => handleStationSelect(s.station)}
                  >
                    <strong>{formatStation(s.station)}</strong>
                    <span>{s.label || "Estacion"}</span>
                    <em>{`${s.elevation.toFixed(2)} m`}</em>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                Carga un IFC con IfcAlignment para listar progresivas reales del modelo.
              </div>
            )}
          </section>
        </aside>
      </main>
      </div>
    </AppErrorBoundary>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("IFCViewer render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="app-shell app-error-shell">
        <div className="app-error-card">
          <strong>El visor detuvo el render de la interfaz</strong>
          <span>{this.state.error.message}</span>
          <button onClick={() => this.setState({ error: null })}>Reintentar interfaz</button>
        </div>
      </div>
    );
  }
}

type ModelRowProps = {
  model: LoadedModel;
  hasAlignment: boolean;
  onToggleVisibility: () => void;
  onExport: () => void;
  onRemove: () => void;
  onFit: () => void;
};

function ModelRow({ model, hasAlignment, onToggleVisibility, onExport, onRemove, onFit }: ModelRowProps) {
  return (
    <div className={`model-row ${model.visible ? "" : "hidden-model"}`}>
      <button className="model-vis" title={model.visible ? "Ocultar" : "Mostrar"} onClick={onToggleVisibility}>
        {model.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <div className="model-info" onClick={onFit} title="Click para encuadrar">
        <strong>{model.name}</strong>
        <span>
          {model.source === "ifc" ? "IFC" : "Frag"} · {model.loadedAt}
          {hasAlignment && " · Alineamiento"}
        </span>
      </div>
      <div className="model-actions">
        {model.source === "ifc" && (
          <button title="Exportar como .frag (carga rápida)" onClick={onExport}>
            <Download size={13} />
          </button>
        )}
        <button title="Eliminar modelo" className="danger" onClick={onRemove}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function AlignmentProfile({
  alignment,
  activeStation,
}: {
  alignment: AlignmentData;
  activeStation: number;
}) {
  const { stations, initialStation, length } = alignment;
  if (stations.length < 2) {
    return (
      <div className="profile-empty">
        Alineamiento detectado ({length.toFixed(0)} m). Datos de perfil no disponibles.
      </div>
    );
  }

  const hasElevation = stations.some((s) => s.elevation !== 0);
  const maxElev = hasElevation ? Math.max(...stations.map((s) => s.elevation)) : 100;
  const minElev = hasElevation ? Math.min(...stations.map((s) => s.elevation)) : 0;
  const elevRange = maxElev - minElev || 1;

  const W = 480;
  const H = 80;
  const PAD_L = 20;
  const PAD_R = 20;
  const PAD_T = 8;
  const PAD_B = 16;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const toX = (s: number) => PAD_L + ((s - initialStation) / length) * chartW;
  const toY = (e: number) => PAD_T + chartH - ((e - minElev) / elevRange) * chartH;
  const activeX = toX(Math.max(initialStation, Math.min(initialStation + length, activeStation)));

  const points = stations
    .map((s) => `${toX(s.station).toFixed(1)},${toY(s.elevation).toFixed(1)}`)
    .join(" ");

  return (
    <div className="profile-chart">
      <svg viewBox={`0 0 ${W} ${H + 10}`} role="img" aria-label="Perfil longitudinal">
        <line x1={PAD_L} y1={PAD_T + chartH} x2={W - PAD_R} y2={PAD_T + chartH} />
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + chartH} />
        {hasElevation ? (
          <polyline className="grade" points={points} />
        ) : (
          <line className="grade" x1={PAD_L} y1={PAD_T + chartH / 2} x2={W - PAD_R} y2={PAD_T + chartH / 2} />
        )}
        {stations.map((s, i) => {
          if (i % Math.ceil(stations.length / 5) !== 0 && i !== stations.length - 1) return null;
          const x = toX(s.station);
          return (
            <g key={s.station}>
              <line className="station-line" x1={x} y1={PAD_T} x2={x} y2={PAD_T + chartH} />
              <text x={x - 14} y={H - 1}>{formatStation(s.station)}</text>
            </g>
          );
        })}
        <line className="active-station-line" x1={activeX} y1={PAD_T} x2={activeX} y2={PAD_T + chartH} />
      </svg>
      <div className="legend">
        <span><i className="grade-key" />Rasante</span>
        <span style={{ marginLeft: "auto", fontSize: "10px", color: "var(--muted)" }}>
          {formatStation(initialStation)} → {formatStation(initialStation + length)}
        </span>
      </div>
    </div>
  );
}

function CivilPlanView({
  alignment,
  activeStation,
  hasIfcAlignment,
  onSelectStation,
}: {
  alignment: AlignmentData | null;
  activeStation: number | null;
  hasIfcAlignment: boolean;
  onSelectStation: (station: number) => void;
}) {
  if (!alignment || alignment.stations.length < 2 || alignment.length <= 0) {
    return <CivilEmptyState title="Sin planta de alineamiento" body="Carga un IFC con IfcAlignment para dibujar el eje horizontal y sus progresivas reales." />;
  }

  const W = 980;
  const H = 520;
  const bounds = getPlanBounds(alignment);
  const toX = (x: number) => 90 + ((x - bounds.minX) / bounds.width) * 790;
  const toY = (z: number) => 420 - ((z - bounds.minZ) / bounds.depth) * 300;
  const pathPoints = alignment.stations.map((station) => `${toX(station.x)},${toY(station.z)}`).join(" ");
  const active = getActiveStation(alignment, activeStation);
  const activeX = toX(active.x);
  const activeY = toY(active.z);

  return (
    <div className="civil-overlay">
      <div className="civil-card civil-card--summary">
        <span>{hasIfcAlignment ? "IfcAlignment activo" : "Datos IFC"}</span>
        <strong>{alignment.name}</strong>
        <em>{formatStation(alignment.initialStation)} - {formatStation(alignment.initialStation + alignment.length)}</em>
      </div>
      <svg className="civil-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Planta de alineamiento">
        <rect x="0" y="0" width={W} height={H} />
        <g className="civil-grid">
          {Array.from({ length: 18 }, (_, i) => <line key={`v-${i}`} x1={i * 60} y1="0" x2={i * 60} y2={H} />)}
          {Array.from({ length: 10 }, (_, i) => <line key={`h-${i}`} x1="0" y1={i * 60} x2={W} y2={i * 60} />)}
        </g>
        <polyline className="alignment-halo" points={pathPoints} />
        <polyline className="alignment-path" points={pathPoints} />
        {alignment.stations.map((station) => {
          const x = toX(station.x);
          const y = toY(station.z);
          const isActive = activeStation !== null && Math.abs(station.station - activeStation) < 0.1;
          return (
            <g
              key={station.station}
              className={`station-marker ${isActive ? "active" : ""}`}
              onClick={() => onSelectStation(station.station)}
            >
              <line x1={x} y1={y - 42} x2={x} y2={y + 42} />
              <circle cx={x} cy={y} r={isActive ? 8 : 5} />
              <text x={x + 9} y={y - 11}>{formatStation(station.station)}</text>
            </g>
          );
        })}
        <g className="active-station-target">
          <circle cx={activeX} cy={activeY} r="17" />
          <text x={activeX + 18} y={activeY + 4}>{formatStation(active.station)}</text>
        </g>
      </svg>
    </div>
  );
}

function CivilProfileView({
  alignment,
  activeStation,
  hasIfcAlignment,
  onSelectStation,
}: {
  alignment: AlignmentData | null;
  activeStation: number | null;
  hasIfcAlignment: boolean;
  onSelectStation: (station: number) => void;
}) {
  if (!alignment || alignment.stations.length < 2 || alignment.length <= 0) {
    return <CivilEmptyState title="Sin perfil longitudinal" body="Carga un IFC con IfcAlignment vertical para graficar cotas y rasante reales." />;
  }

  const W = 980;
  const H = 520;
  const PAD = { left: 70, top: 60, right: 40, bottom: 70 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const stations = alignment.stations;
  const maxElev = Math.max(...stations.map((s) => s.elevation));
  const minElev = Math.min(...stations.map((s) => s.elevation));
  const range = maxElev - minElev || 1;
  const toX = (s: number) => PAD.left + ((s - alignment.initialStation) / alignment.length) * chartW;
  const toY = (e: number) => PAD.top + chartH - ((e - minElev) / range) * chartH;
  const grade = stations.map((s) => `${toX(s.station)},${toY(s.elevation)}`).join(" ");
  const active = getActiveStation(alignment, activeStation);
  const activeX = toX(active.station);
  const hasVertical = alignment.hasVertical;

  return (
    <div className="civil-overlay">
      <div className="civil-card civil-card--summary">
        <span>{hasIfcAlignment ? "Perfil desde IFC" : "Datos IFC"}</span>
        <strong>{formatStation(active.station)}</strong>
        <em>{hasVertical ? "Cotas leidas del alineamiento cargado" : "Alineamiento sin variacion vertical detectada"}</em>
      </div>
      <svg className="civil-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Perfil longitudinal">
        <rect x="0" y="0" width={W} height={H} />
        <g className="civil-grid">
          {Array.from({ length: 12 }, (_, i) => <line key={`v-${i}`} x1={PAD.left + i * 80} y1={PAD.top} x2={PAD.left + i * 80} y2={PAD.top + chartH} />)}
          {Array.from({ length: 7 }, (_, i) => <line key={`h-${i}`} x1={PAD.left} y1={PAD.top + i * 60} x2={PAD.left + chartW} y2={PAD.top + i * 60} />)}
        </g>
        <polyline className="grade-line-large" points={grade} />
        <line className="active-profile-line" x1={activeX} y1={PAD.top} x2={activeX} y2={PAD.top + chartH} />
        {stations.map((s) => (
          <g key={s.station} className="profile-station" onClick={() => onSelectStation(s.station)}>
            <circle cx={toX(s.station)} cy={toY(s.elevation)} r={activeStation !== null && Math.abs(s.station - activeStation) < 0.1 ? 7 : 4} />
            <text x={toX(s.station) - 18} y={PAD.top + chartH + 28}>{formatStation(s.station)}</text>
          </g>
        ))}
        <text className="axis-title" x="22" y="48">Cota</text>
        <text className="axis-title" x={W - 170} y={H - 25}>Progresiva</text>
      </svg>
    </div>
  );
}

function CrossSectionView({
  alignment,
  activeStation,
  hasIfcAlignment,
}: {
  alignment: AlignmentData | null;
  activeStation: number | null;
  hasIfcAlignment: boolean;
}) {
  if (!alignment || alignment.stations.length === 0) {
    return <CivilEmptyState title="Sin seccion transversal" body="Carga un IFC con alineamiento para crear secciones reales desde CivilCrossSectionNavigator." />;
  }

  const active = getActiveStation(alignment, activeStation);

  return (
    <div className="civil-overlay">
      <div className="civil-card civil-card--summary">
        <span>{hasIfcAlignment ? "Corte vinculado al eje IFC" : "Datos IFC"}</span>
        <strong>{formatStation(active.station)}</strong>
        <em>La seccion se genera desde el alineamiento real del modelo.</em>
      </div>
      <CivilEmptyState
        title="Seccion real lista para generarse"
        body="Selecciona una progresiva. El corte se calcula con CivilCrossSectionNavigator sobre la geometria IFC cargada, no con geometria simulada."
      />
    </div>
  );
}

function CivilEmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="civil-overlay">
      <div className="civil-empty-state">
        <Layers size={28} />
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
    </div>
  );
}

function PropertyPanel({ selection }: { selection: SelectionPayload | null }) {
  if (!selection) {
    return (
      <div className="empty-state">
        Selecciona un elemento del modelo para ver sus atributos IFC, propiedades y relaciones.
      </div>
    );
  }
  const records = selection.attributes.filter(isRecord);
  const first = records[0] ?? {};
  const identity = pickKeys(first, [
    "GlobalId",
    "Name",
    "ObjectType",
    "PredefinedType",
    "Tag",
    "Description",
    "type",
    "expressID",
  ]);
  const materialGroups = collectMatchingGroups(records, ["material", "matlayer", "layer"]);
  const propertySets = collectMatchingGroups(records, ["pset", "propertyset", "isdefinedby", "hasproperties"]);
  const quantitySets = collectMatchingGroups(records, ["qto", "quantity", "quantities"]);
  return (
    <div className="property-panel-content">
      <div className="prop-section">
        <div className="prop-section-header">Referencia</div>
        <PropertyRow label="Modelo" value={selection.modelId} />
        <PropertyRow label="IDs"
          value={selection.localIds.length <= 3
            ? selection.localIds.join(", ")
            : `${selection.localIds.slice(0, 3).join(", ")} +${selection.localIds.length - 3}`} />
      </div>
      <PropertyGroup label="Identidad IFC" data={identity} emptyText="El elemento no trae campos de identidad en los datos cargados." />
      <PropertyMatches label="Materiales y asociaciones" matches={materialGroups} emptyText="No se encontraron materiales asociados en este elemento." />
      <PropertyMatches label="Property sets" matches={propertySets} emptyText="No se encontraron property sets asociados en este elemento." />
      <PropertyMatches label="Cantidades" matches={quantitySets} emptyText="No se encontraron quantity sets asociados en este elemento." />
      {records.map((attr, i) => (
        <PropertyGroup key={i} label={i === 0 ? "Datos IFC completos" : `Relacion IFC ${i}`} data={attr} />
      ))}
    </div>
  );
}

function PropertyMatches({
  label,
  matches,
  emptyText,
}: {
  label: string;
  matches: Array<{ label: string; data: Record<string, unknown> }>;
  emptyText: string;
}) {
  return (
    <div className="prop-section">
      <div className="prop-section-header">{label}</div>
      {matches.length === 0 ? (
        <div className="property-note">{emptyText}</div>
      ) : (
        matches.map((match, i) => (
          <PropertyGroup key={`${match.label}-${i}`} label={match.label} data={match.data} />
        ))
      )}
    </div>
  );
}

function PropertyGroup({
  label,
  data,
  emptyText,
}: {
  label: string;
  data: Record<string, unknown>;
  emptyText?: string;
}) {
  const entries = Object.entries(data).filter(([k, v]) => v !== null && v !== undefined && k !== "type");
  if (entries.length === 0) {
    if (!emptyText) return null;
    return (
      <div className="prop-section">
        <div className="prop-section-header">{label}</div>
        <div className="property-note">{emptyText}</div>
      </div>
    );
  }
  const primitives = entries.filter(([, v]) => typeof v !== "object" || v === null);
  const nested     = entries.filter(([, v]) => v !== null && typeof v === "object");
  return (
    <div className="prop-section">
      <div className="prop-section-header">{label}</div>
      {primitives.map(([k, v]) => <PropertyRow key={k} label={k} value={formatValue(v)} />)}
      {nested.map(([k, v])     => <NestedProperty key={k} label={k} value={v} />)}
    </div>
  );
}

function NestedProperty({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  if (Array.isArray(value)) {
    return (
      <div className="prop-nested">
        <button className={`prop-nested-header ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
          <ChevronRight size={11} /><span>{label}</span><em>{value.length}</em>
        </button>
        {open && (
          <div className="prop-nested-body">
            {value.map((item, i) =>
              typeof item === "object" && item !== null
                ? <PropertyGroup key={i} label={`[${i}]`} data={item as Record<string, unknown>} />
                : <PropertyRow key={i} label={`[${i}]`} value={formatValue(item)} />
            )}
          </div>
        )}
      </div>
    );
  }
  if (typeof value === "object" && value !== null) {
    return (
      <div className="prop-nested">
        <button className={`prop-nested-header ${open ? "open" : ""}`} onClick={() => setOpen(!open)}>
          <ChevronRight size={11} /><span>{label}</span>
        </button>
        {open && (
          <div className="prop-nested-body">
            <PropertyGroup label="" data={value as Record<string, unknown>} />
          </div>
        )}
      </div>
    );
  }
  return <PropertyRow label={label} value={formatValue(value)} />;
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="property-row">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickKeys(data: Record<string, unknown>, keys: string[]) {
  return keys.reduce<Record<string, unknown>>((picked, key) => {
    if (key in data && data[key] !== null && data[key] !== undefined) {
      picked[key] = data[key];
    }
    return picked;
  }, {});
}

function collectMatchingGroups(values: unknown[], keywords: string[]) {
  const matches: Array<{ label: string; data: Record<string, unknown> }> = [];
  const seen = new WeakSet<object>();
  const normalizedKeywords = keywords.map((keyword) => keyword.toLowerCase());

  const visit = (value: unknown, path: string, depth: number) => {
    if (matches.length >= 18 || depth > 8) return;

    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`, depth + 1));
      return;
    }

    if (!isRecord(value)) {
      const lowerPath = path.toLowerCase();
      if (normalizedKeywords.some((keyword) => lowerPath.includes(keyword))) {
        matches.push({ label: path || "Valor", data: { value } });
      }
      return;
    }

    if (seen.has(value)) return;
    seen.add(value);

    const descriptor = [
      path,
      value.type,
      value.Name,
      value.name,
      value.ObjectType,
      value.RelatingMaterial,
      value.RelatingPropertyDefinition,
    ]
      .map((item) => formatSearchToken(item))
      .join(" ")
      .toLowerCase();

    if (depth > 0 && normalizedKeywords.some((keyword) => descriptor.includes(keyword))) {
      matches.push({ label: path || String(value.type ?? "Dato IFC"), data: value });
    }

    for (const [key, nested] of Object.entries(value)) {
      if (nested === null || nested === undefined) continue;
      visit(nested, path ? `${path}.${key}` : key, depth + 1);
    }
  };

  values.forEach((value, index) => visit(value, `Elemento ${index + 1}`, 0));
  return matches;
}

function formatSearchToken(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (isRecord(value)) {
    return String(value.type ?? value.Name ?? value.name ?? "");
  }
  return "";
}

function formatIfcType(name: string): string {
  return name.replace(/^IFC/i, "").replace(/([A-Z])/g, " $1").trim();
}

function getPlanBounds(alignment: AlignmentData) {
  const xs = alignment.stations.map((station) => station.x);
  const zs = alignment.stations.map((station) => station.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);
  return {
    minX,
    minZ,
    width: Math.max(maxX - minX, 1),
    depth: Math.max(maxZ - minZ, 1),
  };
}

function getActiveStation(alignment: AlignmentData, activeStation: number | null) {
  if (activeStation === null) return alignment.stations[0];
  return alignment.stations.reduce((closest, station) => {
    return Math.abs(station.station - activeStation) < Math.abs(closest.station - activeStation)
      ? station
      : closest;
  }, alignment.stations[0]);
}

function getElementName(selection: SelectionPayload): string {
  const first = selection.attributes[0] ?? {};
  return String(first.Name ?? first.name ?? first.type ?? "Elemento IFC");
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (typeof v === "number")  return String(v);
  if (typeof v === "string")  return v || "—";
  if (typeof v === "object")  return JSON.stringify(v).slice(0, 80);
  return String(v);
}

/** Format a station number as KP: 0+000 style */
function formatStation(meters: number): string {
  const km   = Math.floor(meters / 1000);
  const rest = Math.round(meters % 1000);
  return `${km}+${String(rest).padStart(3, "0")}`;
}

/** Shorten a filename for the visibility chip */
function shortenName(name: string): string {
  const base = name.replace(/\.[^/.]+$/, "");
  return base.length > 18 ? base.slice(0, 16) + "…" : base;
}

export default App;
