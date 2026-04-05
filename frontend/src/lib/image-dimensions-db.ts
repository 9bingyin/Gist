import { get, set, getMany, createStore } from 'idb-keyval'

export interface ImageDimension {
  src: string
  width: number
  height: number
  ratio: number
}

const store = createStore('gist-image-dimensions', 'dimensions')

export async function getDimension(src: string): Promise<ImageDimension | undefined> {
  return get<ImageDimension>(src, store)
}

export async function saveDimension(dim: ImageDimension): Promise<void> {
  await set(dim.src, dim, store)
}

export async function getDimensionsBatch(srcs: string[]): Promise<Map<string, ImageDimension>> {
  const results = await getMany<ImageDimension>(srcs, store)
  const map = new Map<string, ImageDimension>()
  results.forEach((dim, i) => {
      const src = srcs[i]
      if (dim && src) {
        map.set(src, dim)
    }
  })
  return map
}
