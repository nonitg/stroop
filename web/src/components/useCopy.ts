import { useToast } from './useToast'

/** Copies text, confirming with a toast; if the browser blocks the clipboard
    (e.g. plain http on a phone), shows the text in a field to copy by hand. */
export function useCopy() {
  const toast = useToast()
  return async (text: string, done: { title: string; body?: string }) => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(text)
      toast(done)
    } catch {
      toast({ title: 'Copy this by hand', body: 'Your browser blocked copying. Long-press or select the text below.', copyText: text })
    }
  }
}
