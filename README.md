# Colorcal

🔗 Aplicación publicada: **[https://aramcap.github.io/colorcal/](https://aramcap.github.io/colorcal/)**

Colorcal es una aplicación web para visualizar un calendario de varios meses y marcar rangos de días con etiquetas de colores personalizadas. Permite resaltar fines de semana, exportar e importar los datos marcados, y alternar entre tema claro, oscuro o automático según el sistema.

## Características

- Selección del período a mostrar (mes de inicio y cantidad de meses).
- Resaltado opcional de fines de semana con color configurable.
- Creación de etiquetas personalizadas con nombre y color.
- Marcado de rangos de fechas asociados a una etiqueta.
- Conteo del rango en días naturales o solo laborables, excluyendo sábados y domingos.
- Etiqueta reservada «Festivos», siempre presente y no eliminable: sus días se resaltan en rojo
  y no cuentan en los períodos laborables. Se marcan como cualquier otro período.
- Descripción opcional por período, para distinguir «Navidad» o «Vacaciones de agosto».
- Carga de los festivos nacionales y autonómicos de la comunidad elegida (2026-2030).
  Los dos festivos locales de cada municipio no se incluyen y hay que añadirlos a mano;
  el origen y las limitaciones de los datos están documentados en `holidays-es.js`.
- Listado y gestión de los períodos marcados.
- Exportación e importación de datos en formato JSON.
- Tema claro, oscuro o automático (según preferencia del sistema).
- Interfaz adaptable: en móvil y tablet la configuración se abre como panel lateral deslizante y el calendario ajusta columnas y tamaño de celda al ancho disponible.
- Vista de impresión con leyenda y pie de página.

## Uso

Al ser una aplicación estática, basta con abrir `index.html` en un navegador, o acceder directamente a la versión publicada en GitHub Pages enlazada arriba.

## Licencia

Este proyecto está licenciado bajo los términos de la [GNU Affero General Public License v3.0](LICENSE).
