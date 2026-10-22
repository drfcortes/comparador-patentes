import * as XLSX from 'xlsx'
import { Plus, Trash2, Download } from 'lucide-react'
import type { SearchConcept, SearchField } from '../utils/strategy'

type Props = {
  concepts: SearchConcept[]
  onChange: (concepts: SearchConcept[]) => void
  onError: (message: string) => void
}

const fields: SearchField[] = ['ti', 'ab', 'claims', 'desc', 'ctxt', 'ftxt', 'nftxt', 'cl', 'ipc', 'cpc']
const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`

export function blankConcept(): SearchConcept {
  return { id: makeId(), concept: '', field: 'nftxt', terms: ['', '', ''], required: false, weight: 1, core: false, enabled: true }
}


export function validateConcepts(concepts: SearchConcept[]): string | null {
  for (const [i, row] of concepts.entries()) {
    if (!row.enabled) continue
    if (!row.concept.trim()) return `Fila ${i + 1}: escribe el nombre del concepto.`
    if (!row.terms.some(term => term.trim())) return `Fila ${i + 1}: agrega al menos una palabra clave.`
    if (!Number.isFinite(row.weight) || row.weight <= 0 || row.weight >= 10000) return `Fila ${i + 1}: el peso debe ser mayor que 0 y menor que 10000.`
    for (const term of row.terms.filter(t => t.trim())) {
      if (/["\r\n]/.test(term)) return `Fila ${i + 1}: no se admiten comillas ni saltos de línea en las palabras clave.`
      if (term.includes('*') && term.split('*')[0].replace(/[^\p{L}\p{N}_]/gu, '').length < 3) {
        return `Fila ${i + 1}: escribe al menos tres caracteres antes de *.`
      }
    }
  }
  return null
}

export function StrategyEditor({ concepts, onChange, onError }: Props) {
  function update(id: string, patch: Partial<SearchConcept>) {
    onChange(concepts.map(row => row.id === id ? { ...row, ...patch } : row))
  }
  function exportExcel() {
    const issue = validateConcepts(concepts)
    if (issue) { onError(issue); return }
    if (!concepts.length) { onError('Agrega un concepto antes de exportar.'); return }
    const termCount = Math.max(3, ...concepts.map(c => c.terms.length))
    const rows = concepts.map(row => {
      const item: Record<string, string | number> = {
        Concepto: row.concept.trim(), Campo: row.field,
      }
      for (let i = 0; i < termCount; i++) item[`Palabra clave ${i + 1}`] = row.terms[i]?.trim() ?? ''
      item.Obligatorio = row.required ? 'Sí' : 'No'
      item.Peso = row.weight
      item.Núcleo = row.core ? 'Sí' : 'No'
      item.Incluir = row.enabled ? 'Sí' : 'No'
      return item
    })
    const sheet = XLSX.utils.json_to_sheet(rows)
    sheet['!cols'] = [{ wch: 35 }, { wch: 12 }, ...Array.from({ length: termCount }, () => ({ wch: 22 })), { wch: 16 }, { wch: 10 }, { wch: 12 }, { wch: 12 }]
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, sheet, 'Estrategia')
    XLSX.writeFile(book, 'Estrategia_Busqueda.xlsx')
    onError('')
  }
  const input = 'w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900 focus:border-cyan-600 focus:outline-none'
  return (
    <div className="mt-6 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Editor de estrategia</h3>
          <p className="text-sm text-slate-600">Modifica la tabla y las consultas se actualizarán automáticamente. Se guarda en este navegador.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onChange([...concepts, blankConcept()])} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-medium text-white hover:bg-cyan-800"><Plus size={16}/> Agregar concepto</button>
          <button type="button" onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium hover:bg-slate-100"><Download size={16}/> Exportar Excel</button>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
          <thead className="bg-slate-100"><tr>{['Incluir', 'Concepto', 'Campo', 'Palabras clave (OR)', 'Obligatorio', 'Peso', 'Núcleo', 'Eliminar'].map(h => <th key={h} className="border-b px-3 py-3">{h}</th>)}</tr></thead>
          <tbody>{concepts.map((row, index) => <tr key={row.id} className="border-b align-top">
            <td className="px-3 py-3"><input type="checkbox" checked={row.enabled} aria-label={`Incluir fila ${index + 1}`} onChange={e => update(row.id, { enabled: e.target.checked })}/></td>
            <td className="min-w-52 px-3 py-2"><input className={input} aria-label={`Concepto fila ${index + 1}`} placeholder="Ej. Retención magnética" value={row.concept} onChange={e => update(row.id, { concept: e.target.value })}/></td>
            <td className="px-3 py-2"><select className={input} value={row.field} onChange={e => update(row.id, { field: e.target.value as SearchField })}>{fields.map(f => <option key={f} value={f}>{f}</option>)}</select></td>
            <td className="min-w-72 px-3 py-2"><div className="space-y-2">{row.terms.map((term, i) => <div key={i} className="flex gap-1"><input className={input} aria-label={`Palabra clave ${i + 1} de fila ${index + 1}`} placeholder={`Palabra clave ${i + 1}`} value={term} onChange={e => update(row.id, { terms: row.terms.map((t, j) => i === j ? e.target.value : t) })}/><button type="button" aria-label={`Quitar palabra clave ${i + 1}`} disabled={row.terms.length <= 1} onClick={() => update(row.id, { terms: row.terms.filter((_, j) => j !== i) })} className="rounded px-2 text-red-600 disabled:opacity-30"><Trash2 size={15}/></button></div>)}<button type="button" className="text-xs font-semibold text-cyan-700 hover:underline" onClick={() => update(row.id, { terms: [...row.terms, ''] })}>+ Otra palabra clave</button></div></td>
            <td className="px-3 py-3"><input type="checkbox" checked={row.required} aria-label={`Obligatorio fila ${index + 1}`} onChange={e => update(row.id, { required: e.target.checked })}/></td>
            <td className="w-24 px-3 py-2"><input className={input} type="number" min="0.01" max="9999" step="0.1" value={Number.isFinite(row.weight) ? row.weight : ''} onChange={e => update(row.id, { weight: e.target.value === '' ? Number.NaN : Number(e.target.value) })}/></td>
            <td className="px-3 py-3"><input type="checkbox" checked={row.core} aria-label={`Núcleo fila ${index + 1}`} onChange={e => update(row.id, { core: e.target.checked })}/></td>
            <td className="px-3 py-2"><button type="button" aria-label={`Eliminar fila ${index + 1}`} onClick={() => { if (window.confirm(`¿Eliminar el concepto ${row.concept || index + 1}?`)) onChange(concepts.filter(c => c.id !== row.id)) }} className="rounded-lg p-2 text-red-600 hover:bg-red-50"><Trash2 size={18}/></button></td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Desplaza la tabla horizontalmente en pantallas pequeñas. Las palabras clave de cada fila se combinan mediante OR; los conceptos seleccionados, mediante AND.</p>
    </div>
  )
}
