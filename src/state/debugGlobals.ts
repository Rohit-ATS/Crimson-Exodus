export interface DebugGlobalTarget {
  __jack?: unknown
  __live?: unknown
  __merv?: unknown
  __mp?: unknown
}

interface DebugEnvironment {
  DEV: boolean
  VITE_ENABLE_DEBUG_GLOBALS?: string
}

/**
 * Is the opt-in set?
 *
 * Separate from `installDebugGlobals` so a module can publish one global of
 * its own without having to pass the others — passing `null` for them would
 * overwrite whatever the mission store had already set.
 */
export function debugGlobalsEnabled(env: DebugEnvironment): boolean {
  return !!env.DEV && env.VITE_ENABLE_DEBUG_GLOBALS === 'true'
}

/** Browser automation can opt in; ordinary sessions publish no state globals. */
export function installDebugGlobals(
  env: DebugEnvironment,
  target: DebugGlobalTarget,
  store: unknown,
  liveState: unknown,
  /** The rover's conversational store, so its transcript is inspectable. */
  roverStore?: unknown,
): boolean {
  if (!debugGlobalsEnabled(env)) return false
  target.__jack = store
  target.__live = liveState
  if (roverStore !== undefined) target.__merv = roverStore
  return true
}
