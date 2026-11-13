import { createContext, useContext } from 'react'

export interface ToastInput {
  title: string
  body?: string
  /** Transaction hash: adds a "View receipt" link to the public explorer. */
  hash?: string
}

export const ToastContext = createContext<(t: ToastInput) => void>(() => {})

export const useToast = () => useContext(ToastContext)
