import { useCopy } from '../components/useCopy'
import { useToast } from '../components/useToast'

/** Native share sheet on phones; copy to clipboard elsewhere. */
export function useShare() {
  const copy = useCopy()
  const toast = useToast()
  return async (url: string, what: string, body?: string) => {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ url, title: what })
        return
      } catch {
        /* dismissed: fall back to copy */
      }
    }
    if (await copy(url, { title: `${what} copied` }, { silent: true })) toast({ title: `${what} copied`, body })
  }
}
