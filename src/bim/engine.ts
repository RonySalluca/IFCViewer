import * as THREE from "three";
import * as OBC from "@thatopen/components";
import * as OBF from "@thatopen/components-front";

export type EngineStatus =
  | "idle"
  | "initializing"
  | "ready"
  | "loading"
  | "loaded"
  | "error";

export type LoadedModel = {
  id: string;
  name: string;
  source: "ifc" | "fragment" | "demo";
  loadedAt: string;
  visible: boolean;
};

export type SelectionPayload = {
  modelId: string;
  localIds: number[];
  attributes: Record<string, unknown>[];
};

export type CategoryInfo = {
  name: string;
  count: number;
};

export type AlignmentStation = {
  station: number;
  label: string;
  elevation: number;
  x: number;
  y: number;
  z: number;
};

export type AlignmentData = {
  modelId: string;
  name: string;
  initialStation: number;
  length: number;
  stations: AlignmentStation[];
  hasHorizontal: boolean;
  hasVertical: boolean;
};

export type ActiveTool = "select" | "measure" | "sections";
export type MeasurementKind = "length" | "area" | "angle" | "volume";
type MeasurementTool = {
  enabled: boolean;
  delete?: () => void;
};

export type EngineCallbacks = {
  onStatus?: (status: EngineStatus, message?: string) => void;
  onProgress?: (progress: number | null) => void;
  onModelLoaded?: (model: LoadedModel) => void;
  onModelRemoved?: (modelId: string) => void;
  onModelVisibilityChange?: (modelId: string, visible: boolean) => void;
  onSelection?: (payload: SelectionPayload | null) => void;
  onProjectionChange?: (isOrtho: boolean) => void;
  onCategoriesChange?: (categories: CategoryInfo[]) => void;
  onAlignmentsChange?: (alignments: AlignmentData[]) => void;
  onStationChange?: (station: number | null, elevation: number | null) => void;
};

export class BimEngine {
  private components?: OBC.Components;
  private world?: any;
  private fragments?: OBC.FragmentsManager;
  private ifcLoader?: OBC.IfcLoader;
  private highlighter?: OBF.Highlighter;
  private lengthMeasurement?: OBF.LengthMeasurement;
  private areaMeasurement?: OBF.AreaMeasurement;
  private angleMeasurement?: OBF.AngleMeasurement;
  private volumeMeasurement?: OBF.VolumeMeasurement;
  private clipper?: OBC.Clipper;
  private clipStyler?: OBF.ClipStyler;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private planNavigator: any = null;
  private crossNavigator: OBF.CivilCrossSectionNavigator | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private planWorld: any = null;
  private civilPanelsReady = false;
  private loadedAlignmentObjects = new Map<string, THREE.Object3D>();
  private navigableAlignments = new Map<string, THREE.Group[]>();
  private callbacks: EngineCallbacks = {};
  private loadedModels = new Map<string, LoadedModel>();
  private alignments: AlignmentData[] = [];
  private isOrtho = false;
  private currentTool: ActiveTool = "select";
  private measurementKind: MeasurementKind = "length";
  private keyHandler?: (e: KeyboardEvent) => void;

  constructor(private readonly container: HTMLElement) {}

  async init(callbacks: EngineCallbacks = {}) {
    this.callbacks = callbacks;
    this.emitStatus("initializing", "Preparando motor BIM");

    const components = new OBC.Components();
    this.components = components;

    const worlds = components.get(OBC.Worlds);
    const world = worlds.create<
      OBC.SimpleScene,
      OBC.OrthoPerspectiveCamera,
      OBF.PostproductionRenderer
    >();
    this.world = world;

    world.scene = new OBC.SimpleScene(components);
    world.scene.setup();
    world.scene.three.background = new THREE.Color("#eef2f5");

    world.renderer = new OBF.PostproductionRenderer(components, this.container);
    world.camera = new OBC.OrthoPerspectiveCamera(components);
    await world.camera.controls.setLookAt(85, 46, 78, 0, 0, 0);

    components.init();

    // Hide the That Open Company watermark so a custom brand can be placed by the UI
    (world.renderer as any).showLogo = false;

    world.renderer.postproduction.enabled = true;
    const postproduction = world.renderer.postproduction as any;
    if (postproduction?.customEffects) {
      postproduction.customEffects.outlineEnabled = true;
    }

    const grids = components.get(OBC.Grids);
    const grid = grids.create(world);
    grid.config.color.set(0x8b98a8);

    const workerUrl = await OBC.FragmentsManager.getWorker();
    const fragments = components.get(OBC.FragmentsManager);
    fragments.init(workerUrl);
    this.fragments = fragments;

    world.camera.controls.addEventListener("update", () => fragments.core.update());
    world.onCameraChanged?.add?.((camera: any) => {
      for (const [, model] of fragments.list) {
        model.useCamera(camera.three);
      }
      fragments.core.update(true);
    });

    fragments.list.onItemSet.add(({ value: model }: any) => {
      model.useCamera(world.camera.three);
      world.scene.three.add(model.object);
      fragments.core.update(true);
    });

    fragments.core.models.materials.list.onItemSet.add(({ value: material }: any) => {
      if (!("isLodMaterial" in material && material.isLodMaterial)) {
        material.polygonOffset = true;
        material.polygonOffsetUnits = 1;
        material.polygonOffsetFactor = 1;
      }
    });

    this.ifcLoader = components.get(OBC.IfcLoader);
    await this.ifcLoader.setup({
      autoSetWasm: false,
      wasm: {
        path: "https://unpkg.com/web-ifc@0.0.77/",
        absolute: true,
      },
    });

    components.get(OBC.Raycasters).get(world);

    this.highlighter = components.get(OBF.Highlighter);
    this.highlighter.setup({
      world,
      selectMaterialDefinition: {
        color: new THREE.Color("#f0d24d"),
        opacity: 1,
        transparent: false,
        renderedFaces: 0,
      },
    });

    this.highlighter.events.select.onHighlight.add(async (modelIdMap) => {
      const selection = await this.resolveSelection(modelIdMap);
      this.callbacks.onSelection?.(selection);
    });

    this.highlighter.events.select.onClear.add(() => {
      this.callbacks.onSelection?.(null);
    });

    this.lengthMeasurement = components.get(OBF.LengthMeasurement);
    this.lengthMeasurement.world = world;
    this.lengthMeasurement.color = new THREE.Color("#2d6cdf");
    this.lengthMeasurement.enabled = false;

    this.areaMeasurement = components.get(OBF.AreaMeasurement);
    this.areaMeasurement.world = world;
    this.areaMeasurement.color = new THREE.Color("#1f9f84");
    this.areaMeasurement.enabled = false;

    this.angleMeasurement = components.get(OBF.AngleMeasurement);
    this.angleMeasurement.world = world;
    this.angleMeasurement.color = new THREE.Color("#c0802b");
    this.angleMeasurement.enabled = false;

    this.volumeMeasurement = components.get(OBF.VolumeMeasurement);
    this.volumeMeasurement.world = world;
    this.volumeMeasurement.color = new THREE.Color("#7a67d8");
    this.volumeMeasurement.enabled = false;

    this.clipper = components.get(OBC.Clipper);
    this.clipper.enabled = false;
    this.clipper.setup();

    try {
      this.clipStyler = components.get(OBF.ClipStyler);
      this.clipStyler.world = world;
      this.clipStyler.styles.set("BimFill", {
        fillsMaterial: new THREE.MeshBasicMaterial({
          color: "#b8d8ea",
          side: THREE.DoubleSide,
          opacity: 0.9,
          transparent: true,
        }),
      });
      this.clipper.list.onItemSet.add(({ key }: any) => {
        this.clipStyler?.createFromClipping(key, {
          items: { All: { style: "BimFill" } },
        });
      });
    } catch {
      // ClipStyler unavailable, basic clipping still works
    }

    this.container.addEventListener("dblclick", () => {
      if (this.currentTool === "sections" && this.clipper?.enabled) {
        this.clipper.create(this.world);
      }
    });

    this.keyHandler = (e: KeyboardEvent) => this.handleKey(e);
    window.addEventListener("keydown", this.keyHandler);

    this.emitStatus("ready", "Motor listo");
  }

  private handleKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.code === "Delete" || e.code === "Backspace") {
      if (this.currentTool === "measure") {
        this.activeMeasurement()?.delete?.();
      } else if (this.currentTool === "sections" && this.clipper?.enabled) {
        this.clipper.delete(this.world);
      }
    }
    if (e.code === "Escape") {
      void this.highlighter?.clear();
      this.callbacks.onSelection?.(null);
    }
    if (e.code === "KeyF" && !e.ctrlKey && !e.metaKey) {
      void this.fitAll();
    }
  }

  async loadIfc(file: File) {
    if (!this.ifcLoader || !this.fragments) return;
    this.emitStatus("loading", `Cargando ${file.name}`);
    this.callbacks.onProgress?.(0);

    const buffer = new Uint8Array(await file.arrayBuffer());
    const modelId = this.slug(file.name);

    await this.ifcLoader.load(buffer, true, modelId, {
      processData: {
        progressCallback: (progress: number) => {
          const pct = Math.round(progress * 100);
          this.emitStatus("loading", `Convirtiendo IFC ${pct}%`);
          this.callbacks.onProgress?.(progress);
        },
      },
      instanceCallback: (importer: any) => {
        importer.addAllAttributes();
        importer.addAllRelations();
      },
    });

    this.callbacks.onProgress?.(null);
    const model: LoadedModel = {
      id: modelId,
      name: file.name,
      source: "ifc",
      loadedAt: new Date().toLocaleTimeString(),
      visible: true,
    };
    this.loadedModels.set(model.id, model);
    this.callbacks.onModelLoaded?.(model);
    this.emitStatus("loaded", `${file.name} listo`);
    await this.updateCategories();
    await this.extractAlignments(modelId);
    await this.fitAll();
  }

  async loadFragment(file: File) {
    if (!this.fragments) return;
    this.emitStatus("loading", `Cargando fragmento ${file.name}`);
    this.callbacks.onProgress?.(0.5);

    const buffer = await file.arrayBuffer();
    const modelId = this.slug(file.name);
    await this.fragments.core.load(buffer, { modelId });

    this.callbacks.onProgress?.(null);
    const model: LoadedModel = {
      id: modelId,
      name: file.name,
      source: "fragment",
      loadedAt: new Date().toLocaleTimeString(),
      visible: true,
    };
    this.loadedModels.set(model.id, model);
    this.callbacks.onModelLoaded?.(model);
    this.emitStatus("loaded", `${file.name} listo`);
    await this.updateCategories();
    await this.extractAlignments(modelId);
    await this.fitAll();
  }

  async exportFragment(modelId: string) {
    if (!this.fragments) return;
    const model = this.fragments.list.get(modelId);
    if (!model) return;
    const buffer = await (model as any).getBuffer(false);
    const file = new File([buffer], `${modelId}.frag`);
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  }

  toggleModelVisibility(modelId: string) {
    if (!this.fragments) return;
    const model = this.fragments.list.get(modelId);
    const meta = this.loadedModels.get(modelId);
    if (!model || !meta) return;
    const next = !meta.visible;
    model.object.visible = next;
    meta.visible = next;
    this.callbacks.onModelVisibilityChange?.(modelId, next);
    this.fragments.core.update(true);
  }

  removeModel(modelId: string) {
    if (!this.fragments) return;
    const model = this.fragments.list.get(modelId);
    if (model) {
      this.world?.scene.three.remove(model.object);
    }
    // Remove alignment geometry from scene
    const alignObj = this.loadedAlignmentObjects.get(modelId);
    if (alignObj) {
      this.world?.scene.three.remove(alignObj);
      this.loadedAlignmentObjects.delete(modelId);
    }
    this.navigableAlignments.delete(modelId);
    this.alignments = this.alignments.filter((a) => a.modelId !== modelId);
    this.callbacks.onAlignmentsChange?.([...this.alignments]);

    // Rebuild plan navigator alignments list after removal
    if (this.civilPanelsReady && this.planNavigator) {
      try {
        this.planNavigator.alignments = [];
        for (const groups of this.navigableAlignments.values()) {
          for (const group of groups) {
            this.planNavigator.alignments.push(group);
            try { this.planNavigator.createStations(group); } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }
    }

    this.fragments.core.disposeModel(modelId);
    this.loadedModels.delete(modelId);
    this.callbacks.onModelRemoved?.(modelId);
    void this.updateCategories();
  }

  setActiveTool(tool: ActiveTool) {
    this.currentTool = tool;
    this.syncMeasurementTools();
    if (this.clipper) {
      this.clipper.enabled = tool === "sections";
    }
  }

  setMeasurementKind(kind: MeasurementKind) {
    this.measurementKind = kind;
    this.syncMeasurementTools();
  }

  private syncMeasurementTools() {
    const active = this.currentTool === "measure";
    const entries = [
      ["length", this.lengthMeasurement as unknown as MeasurementTool],
      ["area", this.areaMeasurement as unknown as MeasurementTool],
      ["angle", this.angleMeasurement as unknown as MeasurementTool],
      ["volume", this.volumeMeasurement as unknown as MeasurementTool],
    ].filter((entry): entry is [MeasurementKind, MeasurementTool] => Boolean(entry[1]));

    for (const [kind, tool] of entries) {
      tool.enabled = active && this.measurementKind === kind;
    }
  }

  private activeMeasurement(): MeasurementTool | null {
    if (this.measurementKind === "area") return this.areaMeasurement ?? null;
    if (this.measurementKind === "angle") return this.angleMeasurement ?? null;
    if (this.measurementKind === "volume") return this.volumeMeasurement ?? null;
    return this.lengthMeasurement ?? null;
  }

  async fitAll() {
    if (!this.fragments || !this.world) return;
    const box = new THREE.Box3();
    for (const [, model] of this.fragments.list) {
      if (model.object.visible) box.expandByObject(model.object);
    }
    if (!box.isEmpty()) await this.fitToBox(box);
  }

  async fitToModel(modelId: string) {
    if (!this.fragments || !this.world) return;
    const model = this.fragments.list.get(modelId);
    if (!model) return;
    const box = new THREE.Box3().setFromObject(model.object);
    if (!box.isEmpty()) await this.fitToBox(box);
  }

  private async fitToBox(box: THREE.Box3) {
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    await this.world.camera.controls.setLookAt(
      center.x + size * 0.55,
      center.y + size * 0.45,
      center.z + size * 0.55,
      center.x,
      center.y,
      center.z,
      true,
    );
  }

  async setView(view: "top" | "front" | "right") {
    if (!this.world) return;
    const box = new THREE.Box3();
    if (this.fragments) {
      for (const [, m] of this.fragments.list) {
        if (m.object.visible) box.expandByObject(m.object);
      }
    }
    const center = box.isEmpty() ? new THREE.Vector3(0, 0, 0) : box.getCenter(new THREE.Vector3());
    const size = box.isEmpty() ? 100 : box.getSize(new THREE.Vector3()).length() * 1.2;

    const targets: Record<string, [number, number, number]> = {
      top: [center.x, center.y + size, center.z],
      front: [center.x, center.y, center.z + size],
      right: [center.x + size, center.y, center.z],
    };
    const [cx, cy, cz] = targets[view];
    await this.world.camera.controls.setLookAt(cx, cy, cz, center.x, center.y, center.z, true);
  }

  async toggleProjection() {
    if (!this.world) return;
    this.isOrtho = !this.isOrtho;
    const camera = this.world.camera;
    try {
      if (typeof camera.set === "function") {
        await camera.set(this.isOrtho ? "Orthographic" : "Perspective");
      } else if (camera.projection?.set) {
        camera.projection.set(this.isOrtho ? "Orthographic" : "Perspective");
      }
    } catch {
      this.isOrtho = !this.isOrtho;
    }
    this.callbacks.onProjectionChange?.(this.isOrtho);
  }

  async isolateCategory(categoryName: string) {
    if (!this.components) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const classifier = this.components.get(OBC.Classifier as any) as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hider = this.components.get(OBC.Hider as any) as any;
      if (!classifier || !hider) return;
      const groupData = classifier.getGroupData?.("Entities", categoryName);
      if (!groupData) return;
      const modelIdMap = await groupData.get();
      await hider.isolate?.(modelIdMap);
    } catch {
      // Silently skip
    }
  }

  async showAll() {
    if (!this.components) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hider = this.components.get(OBC.Hider as any) as any;
      await hider?.set?.(true);
    } catch {
      // Silently skip
    }
  }

  async clearSelection() {
    await this.highlighter?.clear();
  }

  dispose() {
    if (this.keyHandler) {
      window.removeEventListener("keydown", this.keyHandler);
    }
    try {
      void this.components?.dispose();
    } catch {
      //
    }
  }

  private async extractAlignments(modelId: string) {
    if (!this.fragments || !this.world || !this.components) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fragModel = this.fragments.list.get(modelId) as any;
    if (!fragModel) return;

    try {
      const alignmentObj: THREE.Object3D = await fragModel.getAlignments();
      if (!alignmentObj) return;

      // Add alignment geometry to the 3D scene
      this.world.scene.three.add(alignmentObj);
      this.loadedAlignmentObjects.set(modelId, alignmentObj);
      const alignmentGroups = this.getNavigableAlignmentGroups(alignmentObj);
      this.navigableAlignments.set(modelId, alignmentGroups);

      const modelMeta = this.loadedModels.get(modelId);
      const extracted: AlignmentData[] = [];

      for (let index = 0; index < alignmentGroups.length; index++) {
        const alignmentGroup = alignmentGroups[index];
        let initialStation = 0;
        let totalLength = 0;

        alignmentGroup.traverse((child: THREE.Object3D) => {
          if (typeof child.userData?.initialStation === "number" && !isNaN(child.userData.initialStation)) {
            initialStation = child.userData.initialStation;
          }
          if (typeof child.userData?.length === "number" && !isNaN(child.userData.length) && child.userData.length > 0) {
            totalLength = Math.max(totalLength, child.userData.length);
          }
        });

        try {
          const civilLength = OBF.CivilUtils.alignmentLength(alignmentGroup);
          if (typeof civilLength === "number" && Number.isFinite(civilLength) && civilLength > 0) {
            totalLength = civilLength;
          }
        } catch {
          // Keep userData-derived length if available.
        }

        const stationData: AlignmentStation[] = [];
        if (totalLength > 0) {
          const steps = Math.min(40, Math.max(8, Math.floor(totalLength / 50)));
          const stepSize = totalLength / steps;

          for (let i = 0; i <= steps; i++) {
            const s = initialStation + i * stepSize;
            const percentage = i / steps;
            let civilPoint: OBF.CivilPoint | null = null;
            try {
              civilPoint = OBF.CivilUtils.alignmentPercentageToPoint(
                alignmentGroup,
                percentage,
              );
            } catch {
              civilPoint = null;
            }
            if (!civilPoint) continue;
            stationData.push({
              station: s,
              label: "",
              elevation: civilPoint.point.y,
              x: civilPoint.point.x,
              y: civilPoint.point.y,
              z: civilPoint.point.z,
            });
          }
        }

        if (totalLength > 0 && stationData.length >= 2) {
          extracted.push({
            modelId,
            name: alignmentGroups.length > 1
              ? `${modelMeta?.name ?? modelId} - Eje ${index + 1}`
              : modelMeta?.name ?? modelId,
            initialStation,
            length: totalLength,
            stations: stationData,
            hasHorizontal: true,
            hasVertical: new Set(stationData.map((s) => s.elevation.toFixed(3))).size > 1,
          });
        }
      }

      this.alignments = [
        ...this.alignments.filter((a) => a.modelId !== modelId),
        ...extracted,
      ];
      this.callbacks.onAlignmentsChange?.([...this.alignments]);
      if (alignmentGroups.length > 0) {
        const sampled = extracted.length;
        this.emitStatus(
          "loaded",
          sampled > 0
            ? `${modelMeta?.name ?? modelId}: ${sampled} alineamiento${sampled !== 1 ? "s" : ""} IFC detectado${sampled !== 1 ? "s" : ""}`
            : `${modelMeta?.name ?? modelId}: alineamiento IFC detectado sin progresivas muestreables`,
        );
      }

      // Register with plan navigator if 2D panels are already set up
      if (this.civilPanelsReady && this.planNavigator) {
        for (const group of alignmentGroups) {
          if (!this.planNavigator.alignments.includes(group)) {
            this.planNavigator.alignments.push(group);
            try { this.planNavigator.createStations(group); } catch { /* ignore */ }
          }
        }
        try { this.planNavigator.updateAlignments(); } catch { /* ignore */ }
      }
    } catch {
      // Model has no alignment data
    }
  }

  private getNavigableAlignmentGroups(root: THREE.Object3D): THREE.Group[] {
    const groups: THREE.Group[] = [];
    const hasCivilPoints = (object: THREE.Object3D) => {
      let found = false;
      object.traverse((child) => {
        if (found) return;
        if (Array.isArray(child.userData?.points) && child.userData.points.length >= 6) {
          found = true;
        }
      });
      return found;
    };

    for (const child of root.children) {
      if (child instanceof THREE.Group && hasCivilPoints(child)) {
        groups.push(child);
      }
    }

    if (groups.length === 0 && root instanceof THREE.Group && hasCivilPoints(root)) {
      groups.push(root);
    }

    return groups;
  }

  /**
   * Call once (lazily) when the React UI mounts the 2D panel containers.
   * Uses the actual v3.4.3 API: CivilNavigators + CivilCrossSectionNavigator.
   */
  async setupCivilPanels(planEl: HTMLElement, _elevEl: HTMLElement, _crossEl: HTMLElement) {
    if (!this.components || !this.world || this.civilPanelsReady) return;

    try {
      const worlds = this.components.get(OBC.Worlds);

      // ── Plan 2D world (RendererWith2D for CSS2D station labels) ────────────
      this.planWorld = worlds.create();
      this.planWorld.scene = new OBC.SimpleScene(this.components);
      this.planWorld.renderer = new OBF.RendererWith2D(this.components, planEl);
      this.planWorld.camera = new OBC.OrthoPerspectiveCamera(this.components);
      (this.planWorld.scene as OBC.SimpleScene).setup();

      // ── Civil navigators (v3.4.3 API) ─────────────────────────────────────
      const civilNavigators = this.components.get(OBF.CivilNavigators);
      this.planNavigator = civilNavigators.create("plan-view");
      this.planNavigator.world = this.planWorld;

      // ── Cross-section navigator (renders in the main 3D world) ─────────────
      this.crossNavigator = this.components.get(OBF.CivilCrossSectionNavigator);
      this.crossNavigator.world = this.world;

      // ── Wire plan → cross-section event ────────────────────────────────────
      this.planNavigator.onMarkerChange.add(({ point, normal }: OBF.CivilPoint) => {
        try {
          void this.crossNavigator?.set(point, normal);
          const alignment = this.alignments[0];
          if (alignment) {
            const dist = this.computeStationFromPoint(point, alignment);
            this.callbacks.onStationChange?.(dist, null);
          }
        } catch { /* ignore */ }
      });

      this.civilPanelsReady = true;

      // Add already-loaded alignments to the plan navigator
      for (const groups of this.navigableAlignments.values()) {
        for (const group of groups) {
          if (!this.planNavigator.alignments.includes(group)) {
            this.planNavigator.alignments.push(group);
            try { this.planNavigator.createStations(group); } catch { /* no station userData */ }
          }
        }
      }
      try { this.planNavigator.updateAlignments(); } catch { /* ignore */ }
    } catch {
      // Civil 2D components not available in this environment
    }
  }

  async goToStation(modelId: string, station: number) {
    const alignment = this.alignments.find((item) => item.modelId === modelId);
    const alignObj = this.navigableAlignments.get(modelId)?.[0];
    if (!alignment || !alignObj || !this.world) return;

    const percentage = Math.max(
      0,
      Math.min(1, (station - alignment.initialStation) / alignment.length),
    );
    const civilPoint = OBF.CivilUtils.alignmentPercentageToPoint(
      alignObj,
      percentage,
    );
    if (!civilPoint) return;

    await this.crossNavigator?.set(civilPoint.point, civilPoint.normal);
    this.planNavigator?.setMarkerAtPoint?.(civilPoint, "select");
    this.callbacks.onStationChange?.(station, civilPoint.point.y);

    const cameraOffset = civilPoint.normal.clone().multiplyScalar(90);
    const eye = civilPoint.point.clone().add(cameraOffset).add(new THREE.Vector3(0, 55, 0));
    await this.world.camera.controls.setLookAt(
      eye.x,
      eye.y,
      eye.z,
      civilPoint.point.x,
      civilPoint.point.y,
      civilPoint.point.z,
      true,
    );
  }

  private computeStationFromPoint(point: THREE.Vector3, alignment: AlignmentData): number {
    // Find the closest point along the loaded alignment geometry and return its station value
    const alignObj = this.loadedAlignmentObjects.get(alignment.modelId);
    if (!alignObj) return alignment.initialStation;
    let minDist = Infinity;
    let closestFraction = 0;
    alignObj.traverse((child) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const line = child as any;
      if (!(line.isLine || line.isLineSegments)) return;
      const pos = line.geometry?.attributes?.position;
      if (!pos) return;
      let lineLen = 0;
      const segLens: number[] = [];
      for (let i = 0; i < pos.count - 1; i++) {
        const dx = pos.getX(i + 1) - pos.getX(i);
        const dy = pos.getY(i + 1) - pos.getY(i);
        const dz = pos.getZ(i + 1) - pos.getZ(i);
        const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
        segLens.push(l);
        lineLen += l;
      }
      let walked = 0;
      for (let i = 0; i < pos.count - 1; i++) {
        const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
        const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
        const t = Math.max(0, Math.min(1,
          ((point.x - ax) * (bx - ax) + (point.y - ay) * (by - ay) + (point.z - az) * (bz - az))
          / (segLens[i] * segLens[i] || 1)
        ));
        const cx = ax + t * (bx - ax), cy = ay + t * (by - ay), cz = az + t * (bz - az);
        const d = Math.sqrt((point.x - cx) ** 2 + (point.y - cy) ** 2 + (point.z - cz) ** 2);
        if (d < minDist) {
          minDist = d;
          closestFraction = (walked + t * segLens[i]) / (lineLen || 1);
        }
        walked += segLens[i];
      }
    });
    return alignment.initialStation + closestFraction * alignment.length;
  }

  private async resolveSelection(
    modelIdMap: OBC.ModelIdMap,
  ): Promise<SelectionPayload | null> {
    if (!this.fragments) return null;
    for (const [modelId, localIdsSet] of Object.entries(modelIdMap)) {
      const model = this.fragments.list.get(modelId);
      if (!model) continue;
      const localIds = [...localIdsSet].map(Number);
      const attributes = await (model as any).getItemsData(localIds);
      return {
        modelId,
        localIds,
        attributes: attributes as Record<string, unknown>[],
      };
    }
    return null;
  }

  private async updateCategories() {
    if (!this.components) {
      this.callbacks.onCategoriesChange?.([]);
      return;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const classifier = this.components.get(OBC.Classifier as any) as any;
      if (!classifier?.byCategory) {
        this.callbacks.onCategoriesChange?.([]);
        return;
      }
      await classifier.byCategory();
      const categories: CategoryInfo[] = [];
      const list = classifier.list as any;
      const entities = list?.Entities ?? list?.["Entities"];
      if (entities) {
        for (const [name, groupData] of Object.entries(entities)) {
          try {
            const map = await (groupData as any).get?.();
            let count = 0;
            if (map) {
              for (const ids of Object.values(map as any)) {
                count += (ids as Set<number>).size;
              }
            }
            if (count > 0) categories.push({ name, count });
          } catch {
            // skip this group
          }
        }
      }
      this.callbacks.onCategoriesChange?.(
        categories.sort((a, b) => b.count - a.count),
      );
    } catch {
      this.callbacks.onCategoriesChange?.([]);
    }
  }

  private emitStatus(status: EngineStatus, message?: string) {
    this.callbacks.onStatus?.(status, message);
  }

  private slug(name: string) {
    return (
      name
        .replace(/\.[^/.]+$/, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "") || `model-${Date.now()}`
    );
  }
}
