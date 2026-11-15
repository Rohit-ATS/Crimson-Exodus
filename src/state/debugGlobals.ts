export interface DebugGlobalTarget {
  __jack?: unknown
  __live?: unknown
}

interface DebugEnvironment {
  DEV: boolean
  VITE_ENABLE_DEBUG_GLOBALS?: string
}

/** Browser automation can opt in; ordinary sessions publish no state globals. */
export function installDebugGlobals(
  env: DebugEnvironment,
  target: DebugGlobalTarget,
  store: unknown,
  liveState: unknown,
): boolean {
  if (!env.DEV || env.VITE_ENABLE_DEBUG_GLOBALS !== 'true') return false
  target.__jack = store
  target.__live = liveState
  return true
}
