import { useEffect, useState } from 'react'

type Doc = { id: string; number: string; claims: string; title?: string; source?: string }
type Evidence = { feature: string; passage: string; score: number; claimRef: string }
type Result = { id: string; number: string; score: number; evidence: Evidence[] }
const STORE = 'comparador-documentos-semanticos-v2'
const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
const newDoc = (): Doc => ({ id: crypto.randomUUID(), number: '', claims: '' })
function sections(text: string, max = 90): string[] {
  const pieces = text.replace(/\r/g, '').split(/\n\s*(?=(?:claim\s*)?\d+[.)]\s)|(?<=\.)\s+(?=(?:claim\s*)?\d+[.)]\s)/i).map(x => x.trim()).filter(Boolean)
  const result: string[] = []
  for (const part of pieces) {
    if (part.length <= 1200) result.push(part)
    else for (let i = 0; i < part.length; i += 950) result.push(part.slice(i, i + 1100))
  }
  return result.slice(0, max)
}
function cosine(a: number[], b: number[]) {
  let dot = 0, aa = 0, bb = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2 }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0
}
function claimRef(passage: string, index: number) {
  const match = passage.match(/^(?:claim\s*)?(\d+)[.)]/i)
  return match ? `Reivindicación ${match[1]}` : `Fragmento ${index + 1}`
}
function loadDocs(): Doc[] {
  try {
    const current: unknown = JSON.parse(localStorage.getItem(STORE) || 'null')
    if (Array.isArray(current)) return current.filter((d): d is Doc => !!d && typeof d.id === 'string' && typeof d.claims === 'string' && typeof d.number === 'string')
    const legacy: unknown = JSON.parse(localStorage.getItem('comparador-documentos-semanticos-v1') || '[]')
    return Array.isArray(legacy) ? legacy.filter((d): d is Doc => !!d && typeof d.id === 'string' && typeof d.claims === 'string' && typeof d.number === 'string') : []
  } catch { return [] }
}
export function SemanticCompare() {
  const [application, setApplication] = useState(() => { try { return localStorage.getItem('comparador-solicitud-claims-v1') || '' } catch { return '' } })
  const [docs, setDocs] = useState<Doc[]>(loadDocs)
  const [apiKey, setApiKey] = useState('')
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [results, setResults] = useState<Result[]>([])
  useEffect(() => { try { localStorage.setItem(STORE, JSON.stringify(docs)) } catch { /* navegador sin espacio */ } }, [docs])
  useEffect(() => { try { localStorage.setItem('comparador-solicitud-claims-v1', application) } catch { /* navegador sin espacio */ } }, [application])
  function update(id: string, patch: Partial<Doc>) { setDocs(previous => previous.map(d => d.id === id ? { ...d, ...patch } : d)); setResults([]) }
  async function retrieve(doc: Doc) {
    if (!doc.number.trim()) { setError('Introduce el número de publicación antes de consultar BigQuery.'); return }
    setError(''); setNotice(''); setLoadingId(doc.id)
    try {
      const response = await fetch('/api/patents', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-Patents-Key': apiKey } : {}) }, body: JSON.stringify({ numbers: [doc.number.trim()] }) })
      const data = await response.json() as { error?: string; results?: { publication_number: string; title: string; claims: string }[]; manualFallback?: boolean }
      if (!response.ok) throw new Error(data.error || 'No se pudo consultar BigQuery.')
      const found = data.results?.[0]
      if (!found) { setNotice('Publicación no localizada. Comprueba el número exacto o pega las reivindicaciones manualmente.'); return }
      if (!found.claims.trim()) { setNotice('Se localizó la publicación, pero BigQuery no contiene sus reivindicaciones. Puedes pegarlas manualmente.'); return }
      update(doc.id, { claims: found.claims, title: found.title, number: found.publication_number, source: 'BigQuery' })
      setNotice(`Reivindicaciones recuperadas: ${found.publication_number}. Verifica su correspondencia con la publicación original.`)
    } catch (e) { setError(`${e instanceof Error ? e.message : 'Error de conexión.'} Puedes introducir las reivindicaciones manualmente.`) }
    finally { setLoadingId(null) }
  }
  async function compare() {
    setError(''); setNotice(''); setResults([]); setBusy(true)
    try {
      const features = sections(application, 50)
      const selected = docs.filter(d => d.claims.trim())
      if (!features.length || !selected.length) throw new Error('Introduce las reivindicaciones de la solicitud y al menos un documento D.')
      setProgress('Cargando el modelo semántico multilingüe en tu navegador…')
      const { pipeline, env } = await import('@huggingface/transformers')
      env.allowRemoteModels = true
      const extractor = await pipeline('feature-extraction', MODEL, { dtype: 'q8', device: 'wasm' })
      const cache = new Map<string, number[]>()
      async function vector(text: string) {
        const cached = cache.get(text); if (cached) return cached
        const tensor = await extractor(text, { pooling: 'mean', normalize: true })
        const values = Array.from(tensor.data as Float32Array)
        cache.set(text, values); return values
      }
      const featureVectors = await Promise.all(features.map(vector))
      const output: Result[] = []
      for (const [index, doc] of selected.entries()) {
        setProgress(`Analizando D${index + 1}: ${doc.number || 'documento manual'}…`)
        const passages = sections(doc.claims)
        const passageVectors = await Promise.all(passages.map(vector))
        const evidence = features.map((feature, fi) => {
          let bestIndex = 0, bestScore = -1
          passageVectors.forEach((v, pi) => { const score = cosine(featureVectors[fi], v); if (score > bestScore) { bestIndex = pi; bestScore = score } })
          return { feature, passage: passages[bestIndex] || '', score: Math.max(0, bestScore), claimRef: claimRef(passages[bestIndex] || '', bestIndex) }
        })
        // Indicador agregado: promedio de la mejor correspondencia por fragmento de la solicitud.
        const score = evidence.reduce((sum, e) => sum + e.score, 0) / evidence.length
        output.push({ id: doc.id, number: doc.number || `D${index + 1}`, score, evidence })
      }
      setResults(output.sort((a, b) => b.score - a.score))
      setProgress('Análisis completado.')
    } catch (e) { setError(e instanceof Error ? e.message : 'No fue posible completar el análisis.') }
    finally { setBusy(false) }
  }
  const inputClass = 'w-full rounded-lg border border-slate-300 bg-white p-3 text-sm'
  return <div className="space-y-6">
    <div><h2 className="text-xl font-semibold">Comparación semántica y técnica de reivindicaciones</h2><p className="mt-2 text-sm text-slate-600">Compara la solicitud en estudio contra cada documento D. BigQuery solo recupera reivindicaciones por número de publicación; no realiza búsquedas masivas. El modelo semántico se ejecuta en tu navegador.</p></div>
    <section className="rounded-xl border p-4 space-y-3"><h3 className="font-semibold">1. Solicitud en estudio</h3><p className="text-sm text-slate-600">Pega las reivindicaciones de tu solicitud, preferentemente numeradas. El sistema utiliza cada reivindicación o fragmento como unidad de comparación.</p><textarea className={inputClass} rows={9} value={application} onChange={e => { setApplication(e.target.value); setResults([]) }} placeholder={'1. Un dispositivo que comprende…\n2. El dispositivo de la reivindicación 1…'} aria-label="Reivindicaciones de la solicitud en estudio"/><input type="file" accept=".txt,.md" className="text-sm" onChange={async e => { const file = e.target.files?.[0]; if (file) { setApplication(await file.text()); setResults([]) } e.target.value = '' }}/><p className="text-xs text-slate-500">Los textos se guardan localmente en este navegador. No subas información confidencial a servicios externos sin autorización.</p></section>
    <section className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">2. Documentos del estado de la técnica</h3><button className="rounded-lg bg-cyan-700 px-4 py-2 text-sm text-white" onClick={() => setDocs(ds => [...ds, newDoc()])}>Agregar documento D</button></div><label className="block text-sm">Clave de acceso a la API (si está configurada en Cloudflare)<input className={inputClass} type="password" autoComplete="off" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="Opcional" /></label>
      {docs.length === 0 && <p className="rounded-lg bg-slate-50 p-4 text-sm">Agrega D1 para comenzar.</p>}
      {docs.map((doc, index) => <article key={doc.id} className="rounded-xl border p-4 space-y-3"><div className="flex flex-wrap items-center gap-2"><strong>D{index + 1}</strong><input className="min-w-44 flex-1 rounded-lg border p-2 text-sm" aria-label={`Número de publicación D${index + 1}`} placeholder="US3056665A" value={doc.number} onChange={e => update(doc.id, { number: e.target.value })}/><button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={loadingId !== null || !doc.number.trim()} onClick={() => void retrieve(doc)}>{loadingId === doc.id ? 'Consultando…' : 'Recuperar claims (BigQuery)'}</button><button className="text-sm text-red-700" onClick={() => { setDocs(ds => ds.filter(d => d.id !== doc.id)); setResults([]) }}>Eliminar</button></div>{doc.title && <p className="text-sm text-slate-600">{doc.title}</p>}<textarea className={inputClass} rows={6} aria-label={`Reivindicaciones D${index + 1}`} value={doc.claims} onChange={e => update(doc.id, { claims: e.target.value, source: 'Manual' })} placeholder="Reivindicaciones recuperadas o pegadas manualmente…"/><div className="flex flex-wrap items-center gap-3"><input type="file" accept=".txt,.md" className="text-sm" onChange={async e => { const file = e.target.files?.[0]; if (file) update(doc.id, { claims: await file.text(), source: 'Archivo local' }); e.target.value = '' }}/><span className="text-xs text-slate-500">{doc.claims.length.toLocaleString('es-MX')} caracteres · {doc.source || 'Entrada manual'}</span></div></article>)}
    </section>
    {notice && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{notice}</p>}{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <section className="space-y-3"><h3 className="font-semibold">3. Comparar contra la solicitud</h3><button className="rounded-lg bg-cyan-700 px-5 py-3 font-semibold text-white disabled:opacity-40" disabled={busy || !application.trim() || !docs.some(d => d.claims.trim())} onClick={() => void compare()}>{busy ? 'Analizando…' : 'Comparar reivindicaciones'}</button>{progress && <p role="status" className="text-sm text-slate-600">{progress}</p>}
      {!!results.length && <div className="space-y-4"><p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"><strong>Alcance:</strong> el indicador es similitud semántica agregada, no porcentaje de novedad, ni prueba de equivalencia funcional o divulgación directa e inequívoca. Las correspondencias son candidatas a revisión técnica y jurídica; las diferencias funcionales deben ser evaluadas por el examinador.</p>{results.map(result => <article key={result.id} className="rounded-xl border p-4 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{result.number}</h4><strong>Correspondencia semántica global: {(result.score * 100).toFixed(1)}%</strong></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr className="border-b bg-slate-50"><th className="p-3">Característica / reivindicación en estudio</th><th className="p-3">Evidencia más cercana en documento D</th><th className="p-3">Referencia</th></tr></thead><tbody>{result.evidence.map((e, i) => <tr key={i} className="border-b align-top"><td className="p-3 whitespace-pre-wrap">{e.feature}</td><td className="p-3 whitespace-pre-wrap">{e.passage || 'Sin evidencia textual'}</td><td className="p-3">{e.claimRef}</td></tr>)}</tbody></table></div><p className="text-xs text-slate-500">Revisa si cada característica está realmente divulgada y si cumple la misma función técnica. Una coincidencia semántica no demuestra anticipación.</p></article>)}</div>}
    </section>
  </div>
}
