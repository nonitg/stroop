import { createContext, useContext } from 'react'

export interface ToastInput {
  title: string
  body?: string
  /** Transaction hash: adds a "View receipt" link to the public explorer. */
  hash?: string
  /** How long the transaction took to confirm on Stellar, in seconds. */
  secs?: number
  /** Text to show in a selectable field, for when the clipboard is unavailable. */
  copyText?: string
}

export const ToastContext = createContext<(t: ToastInput) => void>(() => {})

export const useToast = () => useContext(ToastContext)
