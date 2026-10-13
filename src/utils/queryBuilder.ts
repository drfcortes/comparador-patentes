
import type { SearchConcept } from './strategy'

export type SearchOperator = 'any' | '='

export interface SearchVariant {
  name: string
  included: string
  omitted: string
  query: string
  url: string
  wipo_query: string
  wipo_url: string
  note: string
  core_note: string
  concepts: number
  text_concepts: number
}

const PATENTSCOPE =
  'https://patentscope.wipo.int/search/en/advancedSearch.jsf'

const classificationFields = new Set(['cl', 'ipc', 'cpc'])

const wipoFields: Record<string, string[]> = {
  ti: ['EN_TI'],
  ab: ['EN_AB'],
  claims: ['EN_CL'],
  desc: ['EN_DE'],
  ftxt: ['EN_ALLTXT'],
  nftxt: ['EN_ALLTXT'],
  ctxt: ['EN_TI', 'EN_AB', 'EN_CL'],
  cl: ['IC'],
  ipc: ['IC'],
}

function combinations(items: number[], size: number): number[][] {
  if (size === 0) return [[]]
  if (size > items.length) return []

  const result: number[][] = []

  function visit(start: number, chosen: number[]) {
    if (chosen.length === size) {
      result.push([...chosen])
      return
    }

    for (let i = start; i <= items.length - (size - chosen.length); i++) {
      chosen.push(items[i])
      visit(i + 1, chosen)
      chosen.pop()
    }
  }

  visit(0, [])
  return result
}

export function queryFor(
  groups: SearchConcept[],
  indices: number[],
  operator: SearchOperator = 'any',
): string {
  return [...indices]
    .sort((a, b) => a - b)
    .map(i =>
      '(' +
      groups[i].terms
        .map(term => `${groups[i].field} ${operator} "${term}"`)
        .join(' OR ') +
      ')',
    )
    .join(' AND ')
}

export function wipoQuery(
  groups: SearchConcept[],
  indices: number[],
): { query: string; note: string } {
  const ordered = [...indices].sort((a, b) => a - b)

  if (ordered.some(i => groups[i].field === 'cpc')) {
    return {
      query: '',
      note: 'CPC no convertido automáticamente; adapte ese filtro en PATENTSCOPE.',
    }
  }

  if (ordered.some(i =>
    groups[i].terms.some(term => term.includes('#') || term.includes('?')),
  )) {
    return {
      query: '',
      note: 'Revise manualmente ?/#: no tienen la misma semántica en ambos motores.',
    }
  }

  const wildcardCount: Record<string, number> = {}
  const blocks: string[] = []

  for (const i of ordered) {
    const group = groups[i]
    const alternatives: string[] = []

    for (const field of wipoFields[group.field]) {
      for (const term of group.terms) {
        let searchTerm = term
        let count = (searchTerm.match(/\*/g) ?? []).length
        const used = wildcardCount[field] ?? 0

        if (field === 'EN_ALLTXT' && used + count > 10) {
          searchTerm = searchTerm.replace(/\*/g, '')
          count = 0
        }

        wildcardCount[field] = used + count
        alternatives.push(`${field}:"${searchTerm}"`)
      }
    }

    blocks.push(`(${alternatives.join(' OR ')})`)
  }

  return {
    query: blocks.join(' AND '),
    note:
      'Consulta en inglés. Revise límites de comodines si el portal la rechaza. ' +
      'cl se convierte a IPC (IC), no a CPC.',
  }
}

export function generateVariants(
  original: SearchConcept[],
  operator: SearchOperator = 'any',
): SearchVariant[] {
  if (operator !== 'any' && operator !== '=') {
    throw new Error('Seleccione any o =.')
  }

  const groups = original.filter(g => g.enabled)
  const text = groups
    .map((g, i) => classificationFields.has(g.field) ? -1 : i)
    .filter(i => i >= 0)

  const classifications = groups
    .map((g, i) => classificationFields.has(g.field) ? i : -1)
    .filter(i => i >= 0)

  if (text.length === 0) return []

  const mandatory = text.filter(i => groups[i].required)
  const priority = [...text].sort(
    (a, b) => Number(groups[b].core) - Number(groups[a].core) || a - b,
  )

  const full = groups.map((_, i) => i)
  const choices: { name: string; indices: number[] }[] = []
  const seenSets = new Set<string>()

  const limits: [number, number][] = [
    [1, 6],
    [2, 8],
    [3, 2],
    [4, 1],
  ]

  for (const [size, limit] of limits) {
    const need = size - mandatory.length
    if (need < 0) continue

    const candidates = priority.filter(i => !mandatory.includes(i))
    let added = 0

    for (const extension of combinations(candidates, need)) {
      const indices = [...new Set([
        ...classifications,
        ...mandatory,
        ...extension,
      ])].sort((a, b) => a - b)

      if (indices.length === full.length) continue

      const key = indices.join(',')
      if (seenSets.has(key)) continue

      seenSets.add(key)

      choices.push({
        name: `${size} concepto(s) textual(es)` +
          (classifications.length
            ? ' + clasificación'
            : ' (sin clasificación seleccionada)'),
        indices,
      })

      added++
      if (added >= limit) break
    }
  }

  choices.push({ name: 'Selección completa', indices: full })

  const disabled = original
    .filter(g => !g.enabled)
    .map(g => g.concept)

  const seenQueries = new Set<string>()
  const result: SearchVariant[] = []

  for (const choice of choices) {
    const indices = choice.indices
    const query = queryFor(groups, indices, operator)

    if (seenQueries.has(query)) continue
    seenQueries.add(query)

    const wipo = wipoQuery(groups, indices)

    result.push({
      name: choice.name,
      included: indices.map(i => groups[i].concept).join('; '),
      omitted: [
        ...groups
          .filter((_, i) => !indices.includes(i))
          .map(g => g.concept),
        ...disabled,
      ].join('; '),
      query,
      url:
        'https://worldwide.espacenet.com/patent/search?q=' +
        encodeURIComponent(query),
      wipo_query: wipo.query,
      wipo_url: PATENTSCOPE,
      note: wipo.note +
        ' Selector any/= aplicado a Espacenet; PATENTSCOPE conserva su sintaxis propia.',
      core_note:
        'Solo filas marcadas. Clasificaciones seleccionadas en todas las consultas. Obligatorios respetados.',
      concepts: indices.length,
      text_concepts: indices.filter(i => text.includes(i)).length,
    })
  }

  return result
}
