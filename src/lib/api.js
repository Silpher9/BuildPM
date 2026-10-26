import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

export const LiveContext = createContext({ version: 0, toast: () => {}, refresh: () => {} })

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

async function handle(res) {
  let body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  if (!res.ok) {
    if (res.status === 401 && body?.error === 'pin') window.dispatchEvent(new CustomEvent('buildpm:pin'))
    throw new ApiError(res.status, body?.error || `Fout ${res.status}`)
  }
  return body
}

export const getJson = (path) => fetch(path, { headers: { Accept: 'application/json' } }).then(handle)

export const postJson = (path, body) =>
  fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).then(handle)

export async function uploadPhotos(files, hint) {
  const form = new FormData()
  if (hint) form.append('hint', hint)
  for (const f of files) form.append('photo', f, f.name)
  const res = await fetch('/api/upload', { method: 'POST', body: form })
  return handle(res)
}

/** Fetch JSON and refetch whenever the vault changes. Keeps old data while reloading. */
export function useApi(path) {
  const { version } = useContext(LiveContext)
  const [state, setState] = useState({ data: null, error: null, loading: true })
  const pathRef = useRef(path)
  useEffect(() => {
    if (!path) return
    let alive = true
    const switched = pathRef.current !== path
    pathRef.current = path
    setState((s) => ({ data: switched ? null : s.data, error: null, loading: true }))
    getJson(path)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState((s) => ({ data: s.data, error, loading: false })))
    return () => {
      alive = false
    }
  }, [path, version])
  return state
}

/** POST an action, show the outcome as a toast with an undo button. */
export function useAction() {
  const { toast } = useContext(LiveContext)
  return useCallback(
    async (path, body, { quiet = false } = {}) => {
      try {
        const res = await postJson(path, body)
        if (!quiet) toast({ text: res.label || 'Opgeslagen', undo: !!res.undo })
        return res
      } catch (err) {
        toast({ text: err.message, error: true })
        throw err
      }
    },
    [toast],
  )
}

export function useLive() {
  return useContext(LiveContext)
}
