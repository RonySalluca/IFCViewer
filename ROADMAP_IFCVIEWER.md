# IFCViewer: producto BIM + infraestructura

## Vision

IFCViewer sera un visor tecnico para modelos IFC de edificaciones e infraestructura en una misma escena. El objetivo es revisar corredores, secciones, progresivas, perfiles longitudinales, edificios cercanos, redes, estructuras, interferencias, cantidades e informacion IFC sin separar artificialmente "obra lineal" y "edificacion".

## Capacidades que vamos a construir

### Base del visor

- Carga local de archivos IFC.
- Conversion IFC a Fragments para trabajar con modelos fluidos.
- Escena 3D federada para varios modelos.
- Orbit, pan, zoom y encuadre automatico.
- Grid tecnico y referencias visuales.
- Seleccion de elementos por click.
- Panel de propiedades IFC.
- Lista de modelos activos.
- Estados de carga y conversion.

### Edificaciones

- Navegacion por niveles y plantas.
- Cortes horizontales tipo planta.
- Aislamiento por edificio, piso, sistema o disciplina.
- Lectura de espacios, muros, losas, puertas, ventanas, columnas, vigas y equipos.
- Panel de propiedades extendidas: psets, materiales, clasificaciones y relaciones.
- Medicion de distancias, areas, volumenes preliminares y angulos.
- Marcadores de incidencias y comentarios sobre elementos.
- Vistas guardadas para revision.

### Infraestructura

- Visualizacion de ejes y alineamientos.
- Progresivas, PK o estaciones sobre el corredor.
- Secciones transversales por progresiva.
- Perfil longitudinal sincronizado con la escena 3D.
- Rasante, terreno, pendientes, cotas y eventos del corredor.
- Revision de puentes, alcantarillas, muros, drenaje, redes, plataformas, taludes y estructuras.
- Filtros por tramo, progresiva inicial/final, disciplina, lote o paquete constructivo.
- Cortes con rellenos y contornos para lectura tipo plano tecnico.
- Marcadores de hitos, interferencias, cambios de pendiente y puntos singulares.

### Integracion BIM + infraestructura

- Federacion de modelos de edificios alrededor del corredor.
- Cruce entre redes de infraestructura y edificaciones cercanas.
- Revision de accesos, interferencias, servidumbres, drenajes y conexiones.
- Coordinacion por zona: tramo + edificio + sistema.
- Navegacion desde una progresiva hacia los elementos IFC cercanos.
- Perfil longitudinal con eventos asociados a estructuras, edificios, cruces y obras auxiliares.

### Analisis y datos

- Tabla de cantidades por tipo IFC.
- Cantidades por tramo o progresiva.
- Cantidades por edificio, nivel o zona.
- Conteo de elementos y clasificaciones.
- Exportacion futura de reportes CSV/XLSX.
- Validacion de atributos obligatorios.
- Revision de nomenclaturas y codificacion.
- Busqueda por GlobalId, nombre, tipo, sistema, progresiva o nivel.

### Revision y coordinacion

- Vistas guardadas con camara y seleccion.
- Marcadores 3D con estado, prioridad y responsable.
- Agrupacion de incidencias por tramo o edificio.
- Capturas del visor.
- Comparacion visual por fases.
- Estados constructivos: planificado, en progreso, observado, aprobado.
- Panel de revision para interferencias y pendientes.

### Escalabilidad

- Cache de Fragments para no reconvertir IFC cada vez.
- Preparacion de modelos grandes por tiles.
- Carga progresiva de geometria visible.
- Separacion futura de backend de procesamiento.
- Motor IfcOpenShell para validacion, cantidades profundas y reportes.
- Pipeline alternativo XKT para escenarios de modelos muy grandes.

## Frameworks y motores disponibles

### That Open Components

Lo usamos como base del visor interactivo:

- `IfcLoader` para importar IFC.
- `FragmentsManager` para trabajar con modelos optimizados.
- `Highlighter` para seleccion.
- `LengthMeasurement` para mediciones.
- `Clipper` y `ClipEdges` para cortes.
- `PostproductionRenderer` para contornos, efectos y lectura visual.
- `Marker` para anotaciones 2D ancladas al 3D.

### Three.js

Lo usamos como capa grafica:

- Camaras.
- Materiales.
- Geometrias auxiliares.
- Lineas de eje y progresivas.
- Visualizaciones de perfil, secciones y referencias.
- Overlays tecnicos.

### IfcOpenShell

Lo reservamos como motor de procesamiento:

- Validacion IFC.
- Extraccion de cantidades.
- Lectura profunda de relaciones.
- QA/QC de atributos.
- Reportes.
- Automatizacion de transformaciones.

### xeokit

Lo mantenemos como ruta de escalabilidad:

- Modelos gigantes.
- Federacion pesada.
- Formato XKT.
- Carga rapida en navegador.
- Precision alta para AEC/GIS.

## Primer MVP

1. Visor 3D con That Open Components.
2. Carga de IFC local.
3. Seleccion y panel de propiedades.
4. Medicion de longitud.
5. Herramienta de corte activable.
6. Panel de progresivas.
7. Perfil longitudinal visual.
8. Lista de modelos federados.
9. Lista de capacidades del producto dentro de la app.

## Segundo incremento

1. Guardar Fragments convertidos.
2. Leer alineamientos desde archivo auxiliar.
3. Generar secciones transversales por estacion.
4. Sincronizar perfil longitudinal con seleccion 3D.
5. Crear marcadores por progresiva.
6. Exportar tabla de elementos visibles.

## Tercer incremento

1. Backend con IfcOpenShell.
2. Cantidades por tramo y edificio.
3. Validacion de propiedades.
4. Reportes.
5. Revision de interferencias.
6. Preparacion de modelos grandes con cache/tiles.
