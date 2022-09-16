import { upgradeWebSocketResponse } from '@well-known-components/http-server/dist/ws'
import { WebSocket } from 'ws'
import { handleSocketLinearProtocol } from '../../logic/handle-linear-protocol'
import { HandlerContextWithPath } from '../../types'

export async function websocketHandler(
  context: HandlerContextWithPath<'logs' | 'ethereumProvider' | 'rooms', '/rooms/:roomId'>
) {
  const logger = context.components.logs.getLogger('Websocket Handler')

  return upgradeWebSocketResponse((socket) => {
    logger.debug('Websocket connected')
    // TODO fix ws types
    const ws = socket as any as WebSocket

    ws.on('error', (error) => {
      logger.error(error)
      ws.close()
    })

    ws.on('close', () => {
      logger.debug('Websocket closed')
    })

    handleSocketLinearProtocol(context.components, ws, context.params.roomId).catch((err) => {
      logger.info(err)
      ws.close()
    })
  })
}
