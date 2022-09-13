import { Router } from '@well-known-components/http-server'
import { GlobalContext } from '../types'
import { statusHandler } from './handlers/status-handler'
import { websocketHandler } from './handlers/room-handler'
import { pingHandler } from './handlers/ping-handler'

// We return the entire router because it will be easier to test than a whole server
export async function setupRouter(_: GlobalContext): Promise<Router<GlobalContext>> {
  const router = new Router<GlobalContext>()

  router.get('/ping', pingHandler)
  router.get('/rooms/status', statusHandler)
  router.get('/rooms/:roomId', websocketHandler)

  return router
}
