import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { heightAt } from '../mission/terrain'
import type { CrewPose } from '../multiplayer/protocol'
import type { LiveJack } from '../state/live'
import Jack from './Jack'

export default function NetworkJack({ pose, variant, dust = 0 }: { pose: CrewPose; variant: 'ev1' | 'ev2'; dust?: number }) {
  const target = useRef(pose)
  const actor = useRef<LiveJack>({
    x: pose.x, z: pose.z, y: heightAt(pose.x, pose.z), heading: pose.heading,
    speedMs: pose.speedMs, moving: pose.moving, stride: pose.stride, working: 0, tool: 'none',
  })
  useEffect(() => { target.current = pose }, [pose])
  useFrame((_, dt) => {
    const a = actor.current
    const p = target.current
    const k = Math.min(1, dt * 10)
    a.x += (p.x - a.x) * k
    a.z += (p.z - a.z) * k
    a.y = heightAt(a.x, a.z)
    a.heading += Math.atan2(Math.sin(p.heading - a.heading), Math.cos(p.heading - a.heading)) * k
    a.speedMs = p.speedMs
    a.moving += (p.moving - a.moving) * Math.min(1, dt * 8)
    a.stride = p.stride
  })
  return <Jack source={actor.current} variant={variant} dust={dust} />
}
