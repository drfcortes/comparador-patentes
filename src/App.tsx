
import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  GitCompareArrows,
  FileText,
  Files,
  Scale,
  Upload,
  CheckCircle2,
  AlertCircle,
  Copy,
  ExternalLink,
} from 'lucide-react'

import { loadStrategy, type SearchConcept } from './utils/strategy'
import { StrategyEditor, blankConcept, validateConcepts } from './components/StrategyEditor'
import {
  generateVariants,
  type SearchOperator,
} from './utils/queryBuilder'

type Tab = 'busquedas' | 'comparacion' | 'documentos' | 'pares'
type Engine = 'espacenet' | 'wipo'

const tabs = [
  { id: 'busquedas', label: 'Búsquedas', icon: Search },
  { id: 'comparacion', label: 'Comparación', icon: GitCompareArrows },
  { id: 'documentos', label: 'Documentos', icon: FileText },
  { id: 'pares', label: 'Pares', icon: Files },
] as const

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('busquedas')
  const [concepts, setConcepts] = useState<SearchConcept[]>(() => {
    try {
      const saved = localStorage.getItem('comparador-estrategia-v1')
      if (!saved) return []
      const parsed: unknown = JSON.parse(saved)
      if (!Array.isArray(parsed)) return []
      return parsed.filter((row): row is SearchConcept =>
        !!row && typeof row === 'object' &&
        typeof row.id === 'string' && typeof row.concept === 'string' &&
        typeof row.field === 'string' && Array.isArray(row.terms) &&
        row.terms.every((term: unknown) => typeof term === 'string') &&
        typeof row.enabled === 'boolean' && typeof row.required === 'boolean' &&
        typeof row.core === 'boolean' && typeof row.weight === 'number'
      )
    } catch { return [] }
  })
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [operator, setOperator] = useState<SearchOperator>('any')
  const [engine, setEngine] = useState<Engine>('espacenet')
  const [copied, setCopied] = useState<string | null>(null)

  useEffect(() => {
    try { localStorage.setItem('comparador-estrategia-v1', JSON.stringify(concepts)) }
    catch { /* Navegación privada o almacenamiento no disponible. */ }
  }, [concepts])

  const validationError = validateConcepts(concepts)
  const enabledCount = concepts.filter(c => c.enabled).length

  const variants = useMemo(
    () => validationError ? [] : generateVariants(
      concepts.map(c => ({ ...c, terms: c.terms.map(t => t.trim()).filter(Boolean) })), operator
    ),
    [concepts, operator, validationError],
  )

  async function importExcel(file: File) {
    setLoading(true)
    setError('')

    try {
      const loaded = await loadStrategy(file)
      setConcepts(loaded)
      setFileName(file.name)
      setCopied(null)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo importar el archivo.',
      )
    } finally {
      setLoading(false)
    }
  }

  function toggleConcept(id: string, enabled: boolean) {
    setConcepts(previous =>
      previous.map(concept =>
        concept.id === id ? { ...concept, enabled } : concept,
      ),
    )
  }

  function toggleAll(enabled: boolean) {
    setConcepts(previous =>
      previous.map(concept => ({ ...concept, enabled })),
    )
  }

  async function copyQuery(query: string, key: string) {
    try {
      await navigator.clipboard.writeText(query)
      setCopied(key)
      setError('')
    } catch {
      setError('No se pudo copiar la consulta al portapapeles.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-900 px-5 py-5 text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3">
          <Scale size={32} className="shrink-0 text-cyan-400" />
          <div>
            <h1 className="text-xl font-semibold md:text-2xl">
              Comparador de Patentes
            </h1>
            <p className="text-sm text-slate-300">
              Plataforma de búsqueda y análisis documental
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4 md:p-6">
        <nav className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-4">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`flex items-center justify-center gap-2 rounded-lg
                p-3 text-sm font-medium transition md:text-base ${
                activeTab === id
                  ? 'bg-cyan-700 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
        </nav>

        <section className="min-h-96 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          {activeTab === 'busquedas' && (
            <div>
              <h2 className="text-xl font-semibold">
                Generador de estrategias de búsqueda
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                Importa conceptos y palabras clave para generar
                variantes de búsqueda en Espacenet y PATENTSCOPE.
              </p>

              <div className="mt-5 flex flex-wrap gap-2">
                <button type="button" onClick={() => {
                  if (concepts.length && !window.confirm('¿Crear una estrategia nueva? La estrategia actual será reemplazada. Puedes exportarla antes.')) return
                  setConcepts([blankConcept()])
                  setFileName('Estrategia creada en el sitio')
                  setError('')
                }} className="rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800">
                  Crear estrategia nueva
                </button>
                {concepts.length > 0 && <button type="button" onClick={() => {
                  if (window.confirm('¿Vaciar toda la estrategia?')) { setConcepts([]); setFileName(''); setError('') }
                }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100">Vaciar estrategia</button>}
              </div>

              <div className="mt-6 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6">
                <div className="flex flex-col items-center gap-3 text-center">
                  <Upload size={36} className="text-cyan-700" />
                  <p className="font-semibold">
                    Importar estrategia de búsqueda
                  </p>
                  <p className="text-sm text-slate-500">
                    Archivos XLSX, CSV o TSV
                  </p>

                  <input
                    type="file"
                    accept=".xlsx,.csv,.tsv"
                    disabled={loading}
                    className="block max-w-full cursor-pointer text-sm
                      file:mr-3 file:rounded-lg file:border-0
                      file:bg-cyan-700 file:px-4 file:py-2
                      file:font-medium file:text-white
                      hover:file:bg-cyan-800"
                    onChange={event => {
                      const file = event.target.files?.[0]
                      if (file) void importExcel(file)
                      event.target.value = ''
                    }}
                  />

                  {loading && (
                    <p className="text-sm text-cyan-700">
                      Leyendo archivo...
                    </p>
                  )}
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-lg
                    border border-red-200 bg-red-50 p-4 text-red-800"
                >
                  <AlertCircle size={20} className="shrink-0" />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {concepts.length > 0 && (
                <>
                  <StrategyEditor concepts={concepts} onChange={setConcepts} onError={setError} />
                  {validationError && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{validationError} Las consultas se habilitarán al corregirlo.</p>}
                  <div className="mt-7">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-semibold">
                          Tabla de conceptos
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          Archivo: {fileName}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 rounded-lg bg-cyan-50 px-3 py-2 text-sm font-medium text-cyan-800">
                        <CheckCircle2 size={17} />
                        {enabledCount} de {concepts.length} incluidos
                      </div>
                    </div>

                    <div className="mb-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggleAll(true)}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
                      >
                        Marcar todas
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleAll(false)}
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-100"
                      >
                        Desmarcar todas
                      </button>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <table className="w-full min-w-[950px] border-collapse text-left text-sm">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            {[
                              'Incluir',
                              'Concepto',
                              'Campo',
                              'Alternativas OR',
                              'Obligatorio',
                              'Peso',
                              'Núcleo',
                            ].map(heading => (
                              <th
                                key={heading}
                                className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-semibold"
                              >
                                {heading}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {concepts.map((concept, index) => (
                            <tr
                              key={concept.id}
                              className={`border-b border-slate-100 hover:bg-cyan-50 ${
                                !concept.enabled
                                  ? 'bg-slate-50 text-slate-400'
                                  : index % 2 === 0
                                    ? 'bg-white'
                                    : 'bg-slate-50/50'
                              }`}
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  aria-label={`Incluir ${concept.concept}`}
                                  checked={concept.enabled}
                                  onChange={event =>
                                    toggleConcept(
                                      concept.id,
                                      event.target.checked,
                                    )
                                  }
                                  className="h-5 w-5 cursor-pointer accent-cyan-700"
                                />
                              </td>
                              <td className="px-4 py-3 font-medium">
                                {concept.concept}
                              </td>
                              <td className="px-4 py-3">
                                <span className="rounded-md bg-slate-200 px-2 py-1 font-mono text-xs text-slate-700">
                                  {concept.field}
                                </span>
                              </td>
                              <td className="min-w-64 px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {concept.terms.map((term, i) => (
                                    <span
                                      key={`${term}-${i}`}
                                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                                    >
                                      {term}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                {concept.required ? 'Sí' : 'No'}
                              </td>
                              <td className="px-4 py-3">
                                {concept.weight}
                              </td>
                              <td className="px-4 py-3">
                                {concept.core ? 'Sí' : 'No'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="mt-8 border-t border-slate-200 pt-6">
                    <h3 className="text-lg font-semibold">
                      Estrategias generadas
                    </h3>

                    <div className="mt-4 flex flex-wrap items-end gap-4">
                      <label className="flex flex-col gap-2 text-sm font-medium">
                        Motor de búsqueda
                        <select
                          value={engine}
                          onChange={event =>
                            setEngine(event.target.value as Engine)
                          }
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                        >
                          <option value="espacenet">Espacenet</option>
                          <option value="wipo">
                            PATENTSCOPE (OMPI/WIPO)
                          </option>
                        </select>
                      </label>

                      <label className="flex flex-col gap-2 text-sm font-medium">
                        Operador Espacenet
                        <select
                          value={operator}
                          onChange={event =>
                            setOperator(event.target.value as SearchOperator)
                          }
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2"
                        >
                          <option value="any">any</option>
                          <option value="=">=</option>
                        </select>
                      </label>

                      <span className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-medium">
                        {variants.length} consultas
                      </span>
                    </div>

                    <p className="mt-3 text-xs text-slate-500">
                      any: cualquiera de las palabras; =: frase exacta.
                      Este selector solo modifica las consultas de Espacenet.
                    </p>

                    {variants.length === 0 ? (
                      <p className="mt-5 rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
                        Selecciona al menos un concepto textual.
                        No se generan búsquedas utilizando Ãºnicamente clasificaciones.
                      </p>
                    ) : (
                      <div className="mt-5 space-y-4">
                        {variants.map((variant, index) => {
                          const query = engine === 'wipo'
                            ? variant.wipo_query
                            : variant.query

                          const key = `${engine}-${index}-${query}`

                          return (
                            <article
                              key={`${variant.name}-${index}`}
                              className="rounded-xl border border-slate-200 p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <h4 className="font-semibold">
                                  {index + 1}. {variant.name}
                                </h4>
                                <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs text-cyan-800">
                                  {variant.text_concepts} conceptos textuales
                                </span>
                              </div>

                              <p className="mt-3 text-sm text-slate-600">
                                <strong>Incluidos:</strong> {variant.included}
                              </p>

                              {variant.omitted && (
                                <p className="mt-1 text-sm text-slate-500">
                                  <strong>Omitidos:</strong> {variant.omitted}
                                </p>
                              )}

                              {query ? (
                                <pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-900 p-4 font-mono text-xs text-slate-100">
                                  {query}
                                </pre>
                              ) : (
                                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                                  {variant.note}
                                </p>
                              )}

                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={!query}
                                  onClick={() => void copyQuery(query, key)}
                                  className="flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <Copy size={16} />
                                  {copied === key ? 'Copiado' : 'Copiar consulta'}
                                </button>

                                <a
                                  href={
                                    engine === 'wipo'
                                      ? variant.wipo_url
                                      : variant.url
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
                                >
                                  <ExternalLink size={16} />
                                  {engine === 'wipo'
                                    ? 'Abrir PATENTSCOPE'
                                    : 'Buscar en Espacenet'}
                                </a>
                              </div>

                              {engine === 'wipo' && (
                                <p className="mt-3 text-xs text-slate-500">
                                  Copia la consulta y pégala en la búsqueda
                                  avanzada de PATENTSCOPE. El enlace abre
                                  el portal, no ejecuta automáticamente la consulta.
                                </p>
                              )}
                            </article>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'comparacion' && (
            <div>
              <h2 className="text-xl font-semibold">
                Comparación de resultados
              </h2>
              <p className="mt-3 text-slate-600">
                Pendiente: importaciÃ³n de exportaciones de Espacenet,
                consolidaciÃ³n de publicaciones, identificaciÃ³n de
                familias y análisis de recurrencia.
              </p>
            </div>
          )}

          {activeTab === 'documentos' && (
            <div>
              <h2 className="text-xl font-semibold">
                Documentos de patente
              </h2>
              <p className="mt-3 text-slate-600">
                Pendiente: documentos consolidados, coincidencias
                léxicas, evidencias y clasificaciones.
              </p>
            </div>
          )}

          {activeTab === 'pares' && (
            <div>
              <h2 className="text-xl font-semibold">
                Comparación entre pares
              </h2>
              <p className="mt-3 text-slate-600">
                Pendiente: similitud léxica TF-IDF por tÃ­tulo,
                resumen, reivindicaciones y descripciÃ³n.
              </p>
            </div>
          )}
        </section>

        <footer className="mt-5 text-center text-xs text-slate-500">
          Comparador de Patentes · Migración web de Python 2.3
        </footer>
      </main>
    </div>
  )
}
