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
};

export class BimEngine {
  private components?: OBC.Components;
  private world?: any;
  private fragments?: OBC.FragmentsManager;
  private ifcLoader?: OBC.IfcLoader;
  private highlighter?: OBF.Highlighter;
  private lengthMeasurement?: OBF.LengthMeasurement;
  private clipper?: OBC.Clipper;
  private clipStyler?: OBF.ClipStyler;
  private civilNavigators?: OBF.CivilNavigators;
  private loadedAlignmentObjects = new Map<string, THREE.Object3D>();
  private callbacks: EngineCallbacks = {};
  private loadedModels = new Map<string, LoadedModel>();
  private alignments: AlignmentData[] = [];
  private isOrtho = false;
  private currentTool: ActiveTool = "select";
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

    // Civil navigator — used when IFC models contain alignment data
    try {
      this.civilNavigators = components.get(OBF.CivilNavigators);
    } catch {
      // Civil components not available
    }

    this.emitStatus("ready", "Motor listo");
  }

  private handleKey(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.code === "Delete" || e.code === "Backspace") {
      if (this.currentTool === "measure") {
        this.lengthMeasurement?.delete();
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
    await this.fitAll();
    await this.updateCategories();
    await this.extractAlignments(modelId);
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
    await this.fitAll();
    await this.updateCategories();
    await this.extractAlignments(modelId);
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
    // Remove alignment geometry if any
    const alignObj = this.loadedAlignmentObjects.get(modelId);
    if (alignObj) {
      this.world?.scene.three.remove(alignObj);
      this.loadedAlignmentObjects.delete(modelId);
    }
    this.alignments = this.alignments.filter((a) => a.modelId !== modelId);
    this.callbacks.onAlignmentsChange?.([...this.alignments]);

    this.fragments.core.disposeModel(modelId);
    this.loadedModels.delete(modelId);
    this.callbacks.onModelRemoved?.(modelId);
    void this.updateCategories();
  }

  setActiveTool(tool: ActiveTool) {
    this.currentTool = tool;
    if (this.lengthMeasurement) {
      this.lengthMeasurement.enabled = tool === "measure";
    }
    if (this.clipper) {
      this.clipper.enabled = tool === "sections";
    }
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
    if (!this.fragments || !this.world) return;
    const fragModel = this.fragments.list.get(modelId) as any;
    if (!fragModel) return;

    try {
      // getAlignments returns a THREE.Object3D group with alignment geometry
      const alignmentObj: THREE.Object3D = await fragModel.getAlignments();
      if (!alignmentObj) return;

      this.world.scene.three.add(alignmentObj);
      this.loadedAlignmentObjects.set(modelId, alignmentObj);

      // Extract station data from alignment userData
      const stationData: AlignmentStation[] = [];
      let initialStation = 0;
      let totalLength = 0;

      alignmentObj.traverse((child: THREE.Object3D) => {
        if (child.userData?.initialStation !== undefined) {
          initialStation = child.userData.initialStation as number;
        }
        if (child.userData?.length !== undefined) {
          totalLength = Math.max(totalLength, child.userData.length as number);
        }
      });

      // Build evenly-spaced stations if no explicit stations exist
      if (totalLength > 0) {
        const steps = Math.min(10, Math.floor(totalLength / 50));
        const stepSize = totalLength / Math.max(steps, 1);
        for (let i = 0; i <= steps; i++) {
          const s = initialStation + i * stepSize;
          stationData.push({ station: s, label: "", elevation: 0 });
        }
      }

      // Try to wire the civil navigator for 3D marker interaction
      if (this.civilNavigators) {
        try {
          const nav = (this.civilNavigators as any).create?.("absolute");
          if (nav) {
            nav.world = this.world;
            nav.alignments.push(alignmentObj);
            nav.updateAlignments?.();
          }
        } catch {
          // Navigator setup failed, alignment geometry is still visible
        }
      }

      const modelMeta = this.loadedModels.get(modelId);
      const alignData: AlignmentData = {
        modelId,
        name: modelMeta?.name ?? modelId,
        initialStation,
        length: totalLength,
        stations: stationData,
        hasHorizontal: true,
        hasVertical: stationData.some((s) => s.elevation !== 0),
      };

      this.alignments = [...this.alignments.filter((a) => a.modelId !== modelId), alignData];
      this.callbacks.onAlignmentsChange?.([...this.alignments]);
    } catch {
      // Model has no alignment data — that's fine, stay silent
    }
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
