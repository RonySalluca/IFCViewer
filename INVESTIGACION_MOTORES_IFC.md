# Investigación inicial: motores y repositorios para aplicaciones IFC

Fecha: 2026-06-24  
Carpeta revisada: `C:\Users\NAVIO\Downloads\ECD Projects\IFCViewer`

## Estado local

La carpeta `IFCViewer` está vacía. No hay todavía framework, dependencias ni archivos fuente, así que la selección del motor puede hacerse desde cero.

## Recomendación rápida

Para comenzar una aplicación web tipo visor IFC interactivo, la ruta más directa es:

1. **That Open Components + web-ifc** para prototipo y visor BIM moderno en navegador.
2. **xeokit SDK + XKT** si el objetivo es manejar modelos grandes, federados o con precisión de coordenadas real-world.
3. **IfcOpenShell** como motor de backend/CLI para validación, extracción de datos, conversión, automatización BIM y procesamiento IFC profundo.

Mi recomendación para este proyecto: arrancar con **That Open Components** si queremos una app web editable y rápida de iterar; diseñar desde el inicio una capa opcional de conversión/cache para migrar a **Fragments** o **XKT** cuando aparezcan modelos pesados.

## Ranking práctico

| Opción | Mejor para | Ventajas | Riesgos / límites | Licencia |
|---|---|---|---|---|
| That Open Components | Visores BIM web modernos, herramientas de medición, selección, clasificación, planos, UX rápida | Ecosistema actual de That Open; basado en Three.js; `IfcLoader` convierte IFC a Fragments; buena ergonomía para apps web | Requiere entender Three.js; hay que cuidar la configuración WASM de `web-ifc` | MIT |
| web-ifc | Lectura/escritura IFC en JS/WASM, base de carga IFC | Rápido, directo, activo; funciona en navegador y Node | No es un visor completo por sí solo; hay que construir UI/geometría alrededor o usar Components | MPL-2.0 |
| xeokit SDK | Visores BIM/AEC robustos, modelos grandes, federación, precisión alta, móvil | Muy orientado a producción; WebGL puro; formato XKT compacto; plugins BIM maduros | Flujo ideal exige conversión previa a XKT; licencia AGPL puede condicionar producto comercial cerrado | AGPL-3.0 |
| xeokit-convert | Pipeline de conversión IFC/GLB/CityJSON/etc. a XKT | CLI y APIs Node para preparar modelos optimizados | La conversión directa IFC vía web-ifc se marca como alpha; para producción recomiendan pipeline estándar IFC -> GLB -> XKT | AGPL-3.0 |
| IfcOpenShell | Backend BIM, validación, cantidades, propiedades, conversión, autoría IFC | Motor IFC muy completo; C++/Python; soporte amplio de esquemas IFC; ecosistema Bonsai/IfcConvert/IDS/BCF | No es la opción más ligera para visor web puro; WASM existe como preview pesado vía Pyodide | LGPL-3.0 |

## Repositorios principales

### 1. That Open Components

- Repo: https://github.com/ThatOpen/engine_components
- Docs: https://docs.thatopen.com/
- Paquetes relevantes:
  - `@thatopen/components`
  - `@thatopen/components-front`
  - `web-ifc`
- Actividad GitHub consultada: actualizado el 2026-05-29, ~673 stars, MIT.

Uso recomendado:

- Viewer IFC en navegador.
- Herramientas BIM interactivas: selección, medición, clipping, navegación por plantas, clasificación, visibilidad.
- App React/Vite/Three.js donde el IFC se carga y luego se trabaja como modelo Fragments.

Nota técnica:

- El tutorial de `IfcLoader` configura `web-ifc` y carga un `Uint8Array` del IFC.
- La documentación recomienda usar Fragments directamente si se necesita más control sobre la conversión.
- La conversión a Fragments importa porque cargar el modelo resultante es más eficiente que reconvertir IFC cada vez.

### 2. web-ifc

- Repo: https://github.com/thatopen/engine_web-ifc
- Docs enlazadas desde repo: https://thatopen.github.io/engine_web-ifc/docs/
- Demo: https://thatopen.github.io/engine_web-ifc/demo/
- Actividad GitHub consultada: actualizado el 2026-06-24, ~982 stars, MPL-2.0.

Uso recomendado:

- Parsear IFC desde JavaScript.
- Leer propiedades, entidades, geometría o escribir IFC.
- Crear loaders propios o procesamiento Node/browser.

No lo usaría solo para una app final, salvo que queramos construir el motor gráfico manualmente. Es mejor usarlo como base bajo That Open Components o bajo una arquitectura propia con Three.js.

### 3. xeokit SDK

- Repo: https://github.com/xeokit/xeokit-sdk
- Sitio/docs: https://xeokit.io/
- API/docs/examples: https://xeokit.github.io/xeokit-sdk/
- Actividad GitHub consultada: actualizado el 2026-06-24, ~904 stars, AGPL-3.0.

Uso recomendado:

- Viewer BIM de producción.
- Modelos muy grandes o federados.
- Aplicaciones AEC/GIS con coordenadas reales y doble precisión.
- Necesidad de formatos optimizados, carga rápida y mucha escena.

Arquitectura típica:

- Convertir IFC a XKT.
- Servir XKT + metadata desde backend/CDN.
- Cargar con `XKTLoaderPlugin`.

Punto legal importante:

- AGPL-3.0 puede ser incompatible con un producto cerrado si no se licencia de otra forma. Hay que validarlo antes de comprometer arquitectura.

### 4. xeokit-bim-viewer-app

- Repo: https://github.com/xeokit/xeokit-bim-viewer-app
- Demo/docs: https://xeokit.github.io/xeokit-bim-viewer/
- Actividad GitHub consultada: actualizado el 2023-09-28, ~18 stars.

Uso recomendado:

- Referencia de app lista para clonar.
- Buen punto para ver estructura de proyecto, data directory, proyectos, modelos y visor.
- Menos recomendable como base directa si queremos una app propia moderna, porque se ve menos activo que `xeokit-sdk`.

### 5. xeokit-convert

- Repo: https://github.com/xeokit/xeokit-convert
- Docs/API: https://xeokit.github.io/xeokit-convert/
- Actividad GitHub consultada: actualizado el 2026-05-19, ~81 stars, AGPL-3.0.

Uso recomendado:

- CLI de conversión a XKT.
- Pipeline Node para preprocesar modelos antes de mostrarlos.
- Preparar cache de geometría/metadata.

Nota importante:

- El propio repo advierte que la conversión directa IFC es alpha porque depende de `web-ifc`; para producción recomiendan un flujo estándar con `cxConverter`.

### 6. IfcOpenShell

- Repo: https://github.com/IfcOpenShell/IfcOpenShell
- Sitio: https://ifcopenshell.org/
- Docs: https://docs.ifcopenshell.org/
- Actividad GitHub consultada: actualizado el 2026-06-24, ~2575 stars, LGPL-3.0.

Uso recomendado:

- Validar IFC.
- Extraer cantidades, propiedades, materiales, relaciones, spatial structure.
- Transformar IFC, crear IFC, automatizar QA/QC.
- Backend Python/FastAPI o scripts de conversión.

No lo elegiría como motor principal de render web en el primer prototipo, pero sí como pieza fuerte si la app necesita inteligencia BIM real, no solo visualización.

### 7. IfcOpenShell WASM preview

- Repo: https://github.com/IfcOpenShell/wasm-preview
- Demo: https://ifcopenshell.github.io/wasm-preview/
- Actividad GitHub consultada: actualizado el 2023-04-01, ~45 stars.

Uso recomendado:

- Investigación.
- Pruebas de IfcOpenShell en navegador vía Pyodide.

Riesgo:

- El README lo define como una preview tecnológica y reconoce que es un enfoque pesado porque carga un intérprete Python y el módulo IfcOpenShell en WASM.

## Repos históricos o a evitar como base nueva

### web-ifc-viewer

- Repo: https://github.com/ThatOpen/web-ifc-viewer
- Actividad GitHub consultada: actualizado el 2023-09-29, ~1025 stars, MIT.

Fue muy importante en IFC.js, pero no lo usaría para un proyecto nuevo. La propia conversación pública del ecosistema indica que fue sustituido por Components y queda como repo histórico/deprecado.

### web-ifc-three

- Repo: https://github.com/ThatOpen/web-ifc-three
- Actividad GitHub consultada: actualizado el 2024-04-17, ~591 stars, MIT.

Sirve para entender el loader IFC sobre Three.js, pero para nuevo desarrollo conviene usar That Open Components o integrar `web-ifc` directamente si se necesita algo más bajo nivel.

## Documentación adicional revisada: That Open past docs 3.0.x Front

- Índice revisado: https://github.com/ThatOpen/engine_past-docs/tree/main/3.0.x/Tutorials/Components/Front
- Nota de versión: es documentación de **versiones 3.0.x y anteriores**, por lo que no debe copiarse ciegamente si instalamos las versiones actuales de `@thatopen/components` y `@thatopen/components-front`.
- Valor práctico: contiene tutoriales completos de componentes front que ayudan a entender patrones de UX BIM: selección, clipping con bordes, plantas, secciones, mediciones, marcadores y streaming.

### Componentes encontrados

| Componente | Uso en una app IFC | Estado práctico |
|---|---|---|
| `Highlighter` | Hover, selección, multi-selección, estilos visuales por selección y eventos para leer propiedades | Sigue siendo clave; también aparece en la doc actual |
| `LengthMeasurement` | Medición persistente entre dos puntos, etiquetas, snap, borrado de mediciones | Sigue siendo clave; aparece en la doc actual |
| `AreaMeasurement` | Medición de áreas | Útil para fase 2 del visor |
| `FaceMeasurement` | Medición sobre caras | Útil para herramientas de inspección |
| `AngleMeasurement` | Medición de ángulos | Útil para herramientas de inspección |
| `VolumeMeasurement` | Medición de volumen | Útil para análisis preliminar; cantidades reales conviene validarlas con IfcOpenShell |
| `ClipEdges` | Clipping con rellenos y contornos estilo BIM, no solo planos de corte básicos | Muy importante para plantas/secciones con apariencia profesional |
| `Plans` | Generación y navegación de floorplans desde modelos fragmentados | Muy útil, pero parece movido o reemplazado en docs actuales; revisar API instalada antes de implementar |
| `Sections` | Crear secciones y navegar a vistas 2D con clipping, estilos y culling | Muy útil, pero aparece en past-docs; revisar API instalada antes de implementar |
| `IfcStreamer` | Streaming de modelos grandes mediante tiles de geometría/propiedades | Referencia importante para escalabilidad; no es necesario para MVP inicial |
| `Marker` | Elementos HTML anclados a posiciones 3D con clustering | Útil para incidencias, sensores, anotaciones y digital twins |
| `PostproductionRenderer` | Render con ambient occlusion, outlines, anti-aliasing y presets visuales | Recomendado desde el MVP para acabado visual y selección clara |
| `ShadowDropper` | Sombras/contacto visual | Mejora visual, no prioritario |
| `Civil*Navigator` | Navegación específica para modelos civiles/alineamientos | Solo relevante si el visor apunta a infraestructura lineal |

### Hallazgos técnicos útiles

**Highlighter**

- La doc actual explica que el componente centraliza raycasting, selección por click, multi-selección con Ctrl, estilos con color/opacidad y eventos de selección/deselección.
- Patrón recomendado para el MVP: al seleccionar un elemento, usar el mapa `modelId -> localIds`, buscar el modelo en `FragmentsManager` y llamar `model.getItemsData([...localIds])` para alimentar el panel de propiedades.
- Requiere `Raycasters` para el `world` y un `highlighter.setup({ world, ... })`.

**Fragments como formato operativo**

- Los tutoriales front actuales cargan `.frag`, no IFC directo, para interacción rápida.
- Patrón repetido: inicializar `FragmentsManager`, actualizar fragments cuando cambia la cámara y agregar `model.object` a la escena cuando entra un modelo.
- Esto refuerza la arquitectura recomendada: IFC como entrada, Fragments como formato de trabajo/cache.

**PostproductionRenderer**

- Se usa como reemplazo del renderer base para dar aspecto BIM profesional: outlines, ambient occlusion, edge detection, anti-aliasing y estilos visuales.
- En tutoriales de `Plans`, `Sections` y `ClipEdges`, se activa `postproduction.enabled` y `customEffects.outlineEnabled`.
- Conviene usarlo desde el inicio si queremos que selección, secciones y cortes se lean bien.

**ClipEdges, Plans y Sections**

- `ClipEdges` resuelve el problema de que un clipping plane simple no genera rellenos ni contornos, algo necesario para planos y secciones con apariencia BIM.
- `Plans` genera plantas automáticamente desde el modelo y permite navegar con `plans.goTo(plan.id)`.
- `Sections` permite crear secciones con `normal` y `point`, y navegar con `sections.goTo(section.id)`.
- Ambos tutoriales combinan `Classifier`, `ClipEdges`, `Highlighter`, `Cullers` y `PostproductionRenderer` para lograr vistas 2D limpias con muros/slabs más gruesos y puertas/ventanas más delgadas.
- Como están en past-docs 3.0.x, antes de implementarlos hay que confirmar si en la versión instalada se llaman igual o si migraron a componentes actuales como `ClipStyler`, `Outliner` o nuevos flujos.

**IfcStreamer**

- El tutorial plantea una solución para modelos muy grandes: convertir IFC a tiles y cargar solo lo visible.
- Usa una URL base para tiles, carga JSON de geometría y opcionalmente propiedades, y actualiza el culler cuando la cámara queda en reposo.
- Tiene cache local (`useCache`) y método `clearCache()`.
- No lo pondría en el MVP, pero sí como ruta de escalabilidad si los IFC reales son de cientos de MB o más.

**Marker**

- Permite anclar HTML en coordenadas 3D y agrupar marcadores cercanos según distancia en pantalla.
- Encaja bien para incidencias, comentarios, sensores IoT, QA/QC y navegación por issues.

### Ajuste a la arquitectura recomendada

Después de revisar esta carpeta, el MVP debería priorizar:

1. `PostproductionRenderer` como renderer base.
2. `FragmentsManager` como capa de modelo en runtime.
3. `IfcLoader` para importar IFC y convertir a Fragments.
4. `Highlighter` para selección y panel de propiedades.
5. `LengthMeasurement` como primera herramienta de medición.
6. `Clipper`/`ClipEdges` para cortes visualmente legibles.
7. `Plans`/`Sections` solo después de validar la API real de la versión instalada.
8. `IfcStreamer` como investigación para fase de modelos grandes.

## Matriz de decisión para IFCViewer

| Escenario | Motor sugerido |
|---|---|
| Prototipo rápido con drag & drop IFC, orbit, selección, propiedades | That Open Components |
| App BIM web con medición, clipping, vistas, clasificación | That Open Components |
| Modelos grandes, federados, operación móvil, rendimiento máximo | xeokit SDK + XKT |
| Plataforma con validación IFC, cantidades, IDS, QA/QC | IfcOpenShell backend + visor web |
| Necesidad de escribir/modificar IFC desde navegador | web-ifc o IfcOpenShell, según profundidad |
| Producto comercial cerrado | Revisar licencias: That Open MIT/MPL es más sencillo; xeokit AGPL requiere análisis |

## Arquitectura inicial sugerida

### MVP web

- Frontend: Vite + React + TypeScript.
- Render: Three.js vía That Open Components.
- Loader: `IfcLoader` de That Open Components.
- Persistencia inicial: cargar IFC local por drag & drop.
- Paneles esperados:
  - Árbol espacial.
  - Propiedades del elemento seleccionado.
  - Lista de modelos cargados.
  - Herramientas de medición y clipping.

### Siguiente fase

- Convertir IFC a Fragments y guardar `.frag` para recarga rápida.
- Añadir backend para subir modelos y cachear resultados.
- Evaluar pipeline alternativo XKT si los modelos reales pesan mucho.

### Backend BIM opcional

- Python + IfcOpenShell.
- Endpoints para:
  - Extraer propiedades.
  - Validar modelos.
  - Calcular cantidades.
  - Normalizar clasificaciones.
  - Exportar reportes.

## Fuentes revisadas

- That Open Components repo: https://github.com/ThatOpen/engine_components
- That Open IfcLoader docs: https://docs.thatopen.com/Tutorials/Components/Core/IfcLoader
- That Open past-docs Front 3.0.x: https://github.com/ThatOpen/engine_past-docs/tree/main/3.0.x/Tutorials/Components/Front
- That Open current Highlighter docs: https://docs.thatopen.com/Tutorials/Components/Front/Highlighter
- That Open current LengthMeasurement docs: https://docs.thatopen.com/Tutorials/Components/Front/LengthMeasurement
- That Open current PostproductionRenderer docs: https://docs.thatopen.com/Tutorials/Components/Front/PostproductionRenderer
- That Open current Marker docs: https://docs.thatopen.com/Tutorials/Components/Front/Marker
- web-ifc repo: https://github.com/thatopen/engine_web-ifc
- xeokit SDK repo: https://github.com/xeokit/xeokit-sdk
- xeokit site/docs: https://xeokit.io/
- xeokit BIM viewer app: https://github.com/xeokit/xeokit-bim-viewer-app
- xeokit-convert repo: https://github.com/xeokit/xeokit-convert
- IfcOpenShell repo: https://github.com/IfcOpenShell/IfcOpenShell
- IfcOpenShell docs: https://docs.ifcopenshell.org/
- IfcOpenShell WASM preview: https://github.com/IfcOpenShell/wasm-preview

## Próximo paso recomendado

Crear un MVP mínimo con That Open Components:

1. Inicializar Vite + React + TypeScript en `IFCViewer`.
2. Instalar `three`, `@thatopen/components`, `@thatopen/components-front`, `web-ifc`.
3. Implementar viewport 3D, carga local de `.ifc`, selección de elementos y panel de propiedades.
4. Probar con 2 modelos IFC: uno pequeño y uno mediano.
5. Medir tiempos de carga y decidir si conviene guardar Fragments o evaluar XKT.
