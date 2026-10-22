# Comparación semántica local — primera etapa

- Ejecutar `npm install` y `npm run build` después de copiar los archivos.
- Pestaña **Comparación**: agregar documentos D1, D2, etc. y pegar sus reivindicaciones o cargar TXT/MD.
- Se toman los conceptos textuales habilitados de **Búsquedas**; no se alteran sus términos.
- El botón **Comparar semánticamente** descarga por primera vez un modelo multilingüe cuantizado de Hugging Face (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`) y calcula embeddings en el navegador mediante WASM. Se requiere conexión para la descarga inicial y suficiente memoria. No usa una API de inferencia de pago.
- Las reivindicaciones se conservan en localStorage del navegador. No se envían a un servicio de IA, aunque las descargas del modelo se realizan desde un servidor externo.
- La similitud de embeddings NO demuestra equivalencia funcional ni falta de novedad. Revisar el texto original y la fecha de publicación.
- Esta primera etapa **no** recupera automáticamente reivindicaciones por número; esa conexión a BigQuery y la biblioteca compartida de documentos se incorporarán en la siguiente etapa. El campo de número sirve para identificar los textos pegados.
- BigQuery sigue siendo un servicio independiente que requiere credenciales y puede generar cargos.
