import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { errorMessage } from '../lib/utils'

export function useAsyncData<T>(loader: () => Promise<T>, dependencies: DependencyList) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestId = useRef(0)

  const load = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      const currentRequest = requestId.current + 1
      requestId.current = currentRequest

      if (mode === 'initial') {
        setLoading(true)
      } else {
        setRefreshing(true)
      }
      setError(null)

      try {
        const result = await loader()
        if (requestId.current === currentRequest) {
          setData(result)
        }
      } catch (caught) {
        if (requestId.current === currentRequest) {
          setError(errorMessage(caught))
        }
      } finally {
        if (requestId.current === currentRequest) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    // The caller supplies the values that should invalidate the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    dependencies,
  )

  useEffect(() => {
    void load('initial')
    return () => {
      requestId.current += 1
    }
  }, [load])

  const reload = useCallback(() => load('refresh'), [load])

  return { data, loading, refreshing, error, reload, setData }
}
