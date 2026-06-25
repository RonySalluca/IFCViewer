import {
  ChangeEvent,
  DragEvent,
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
      onStationChange: () => { /* future: highlight station in list */ },
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

  // Primary alignment (first model that has one)
  const primaryAlignment = alignments[0] ?? null;

  return (
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

          {/* 2D civil panels — always in DOM; shown/hidden via CSS */}
          <div className="civil-panel" style={{ display: activeView === "plan" ? undefined : "none" }}>
            <div className="civil-panel-label">Planta — Alineamiento horizontal</div>
            <div className="civil-canvas" ref={planPanelRef} />
          </div>
          <div className="civil-panel" style={{ display: activeView === "profile" ? undefined : "none" }}>
            <div className="civil-panel-label">Perfil longitudinal — Alineamiento vertical</div>
            <div className="civil-canvas" ref={elevPanelRef} />
          </div>
          <div className="civil-panel" style={{ display: activeView === "section" ? undefined : "none" }}>
            <div className="civil-panel-label">Sección transversal — Click en Planta para generar</div>
            <div className="civil-canvas" ref={crossPanelRef} />
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
                      : "Sin datos de alineamiento"}
                  </h2>
                </div>
                {primaryAlignment && (
                  <button title="Ver perfil completo" onClick={() => handleViewTab("profile")}>
                    <Move3D size={16} />
                  </button>
                )}
              </div>
              {primaryAlignment ? (
                <AlignmentProfile alignment={primaryAlignment} />
              ) : (
                <div className="profile-empty">
                  Carga un IFC con datos de alineamiento (IfcAlignment) para ver el perfil longitudinal.
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
                <h2>{primaryAlignment ? primaryAlignment.name : "Eje de referencia"}</h2>
              </div>
              <Map size={17} />
            </div>
            {primaryAlignment && primaryAlignment.stations.length > 0 ? (
              <div className="station-list">
                {primaryAlignment.stations.map((s) => (
                  <button key={s.station}>
                    <strong>{formatStation(s.station)}</strong>
                    <span>{s.label || "Estacion"}</span>
                    <em>{s.elevation !== 0 ? `${s.elevation.toFixed(2)} m` : "—"}</em>
                  </button>
                ))}
              </div>
            ) : (
              <div className="empty-state">
                {models.length === 0
                  ? "Carga un IFC con alineamiento para ver las progresivas."
                  : "El modelo cargado no contiene datos de alineamiento IFC."}
              </div>
            )}
          </section>
        </aside>
      </main>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

function AlignmentProfile({ alignment }: { alignment: AlignmentData }) {
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

function PropertyPanel({ selection }: { selection: SelectionPayload | null }) {
  if (!selection) {
    return (
      <div className="empty-state">
        Selecciona un elemento del modelo para ver sus atributos IFC, propiedades y relaciones.
      </div>
    );
  }
  const first = selection.attributes[0] ?? {};
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
      <PropertyGroup label="Atributos IFC" data={first} />
      {selection.attributes.slice(1).map((attr, i) => (
        <PropertyGroup key={i} label={`Relación ${i + 1}`} data={attr} />
      ))}
    </div>
  );
}

function PropertyGroup({ label, data }: { label: string; data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([k, v]) => v !== null && v !== undefined && k !== "type");
  if (entries.length === 0) return null;
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

function formatIfcType(name: string): string {
  return name.replace(/^IFC/i, "").replace(/([A-Z])/g, " $1").trim();
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
