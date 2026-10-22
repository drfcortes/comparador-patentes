# Comparación semántica local

La solicitud en estudio es la referencia principal. Se pega o importa en formato TXT/MD, al igual que los documentos D1, D2, etc. La recuperación opcional por número de publicación utiliza BigQuery con un presupuesto por consulta protegido. Los textos se guardan en localStorage del navegador.

La comparación usa `Xenova/paraphrase-multilingual-MiniLM-L12-v2` en el navegador. Se fragmentan reivindicaciones por numeración, se generan vectores y se selecciona el pasaje más próximo en cada documento D para cada fragmento de la solicitud. Se muestra **un indicador global por documento** (promedio de mejores similitudes) y una tabla de pasajes con referencia tentativa.

**Limitaciones:** no es un motor de inferencia técnica ni un dictamen de patentabilidad. No identifica automáticamente características estructurales o efectos técnicos equivalentes, ni verifica divulgación directa e inequívoca. Las correspondencias son sugerencias para el examen humano; revisar reivindicaciones, descripción, dibujos y prioridad de los documentos originales. El modelo se descarga la primera vez y después puede usar caché del navegador.
