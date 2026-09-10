const SVG_NS = 'http://www.w3.org/2000/svg'
const PAD = 40
// Au-delà, les navigateurs refusent d'allouer le canvas et toBlob renvoie null
const MAX_DIM = 12000

/** Exporte le synoptique affiché en PNG haute résolution.
 *  Le cadrage vient du getBBox() du groupe de contenu : tout est inclus (toiture
 *  hors zone, niveaux, colonnes) quel que soit le zoom/pan courant à l'écran. */
export async function exportSynopticPNG(filename: string, scale = 3): Promise<void> {
  const svg = document.querySelector<SVGSVGElement>('svg[data-synoptic]')
  if (!svg) throw new Error("Le synoptique n'est pas affiché — impossible de l'exporter.")

  const content = svg.firstElementChild as SVGGElement | null
  if (!content) throw new Error('Contenu du synoptique introuvable.')

  let box: DOMRect
  try {
    box = content.getBBox()
  } catch {
    throw new Error('Impossible de mesurer le synoptique.')
  }
  if (!box.width || !box.height) throw new Error('Le synoptique est vide.')

  const x = box.x - PAD, y = box.y - PAD
  const w = box.width + 2 * PAD, h = box.height + 2 * PAD
  const s = Math.max(1, Math.min(scale, MAX_DIM / w, MAX_DIM / h))
  const pxW = Math.round(w * s), pxH = Math.round(h * s)

  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.setAttribute('xmlns', SVG_NS)
  clone.removeAttribute('style')
  // viewBox en coordonnées de contenu, dimensions en pixels finaux : l'image a
  // directement la bonne taille intrinsèque, donc la rasterisation reste vectorielle
  clone.setAttribute('viewBox', `${x} ${y} ${w} ${h}`)
  clone.setAttribute('width', String(pxW))
  clone.setAttribute('height', String(pxH))
  // Le pan/zoom écran ne doit pas décaler l'export
  clone.firstElementChild?.removeAttribute('transform')

  const bg = document.createElementNS(SVG_NS, 'rect')
  bg.setAttribute('x', String(x))
  bg.setAttribute('y', String(y))
  bg.setAttribute('width', String(w))
  bg.setAttribute('height', String(h))
  bg.setAttribute('fill', '#ffffff')
  clone.insertBefore(bg, clone.firstChild)

  const svgUrl = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml;charset=utf-8' })
  )
  let png: Blob
  try {
    const img = await loadImage(svgUrl)
    const canvas = document.createElement('canvas')
    canvas.width = pxW
    canvas.height = pxH
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas indisponible.')
    ctx.drawImage(img, 0, 0)
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/png'))
    if (!blob) throw new Error('Synoptique trop grand pour être exporté.')
    png = blob
  } finally {
    URL.revokeObjectURL(svgUrl)
  }

  const url = URL.createObjectURL(png)
  Object.assign(document.createElement('a'), { href: url, download: filename }).click()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Échec du rendu du synoptique.'))
    img.src = src
  })
}
