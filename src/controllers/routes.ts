import { GlobalContext } from '../types'
import { WsPacket } from '../proto/ws-comms-rfc-5'
import {WebSocket} from 'ws'
import * as uWS from 'uWebSockets.js'
import { Authenticator } from '@dcl/crypto'
import { normalizeAddress } from '../logic/address'
import { handleSocketLinearProtocol } from '../logic/handle-linear-protocol'
import mitt from 'mitt'

export async function setupRouter({ app, components }: GlobalContext): Promise<void> {
  const { logs, metrics, ethereumProvider } = components
  const logger = logs.getLogger('rooms')
  const rooms = new Map<string, Set<WebSocket>>()

  function observeRoomCount() {
    metrics.observe('dcl_ws_rooms_count', {}, rooms.size)
  }

  app
    .get('/metrics', async (res) => {
      const body = await (metrics as any).registry.metrics()
      res.end(body)
    })
    .ws('/rooms/:roomId', {
      compression: uWS.DISABLED,
      upgrade: (res, req, context) => {
        const roomId = req.getParameter(0)
        res.upgrade(
          {
            // NOTE: this is user data
            url: req.getUrl(),
            roomId,
            readyState: WebSocket.CONNECTING,
            ...mitt()
          },
          /* Spell these correctly */
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context
        )
      },
      open: (ws) => {
        handleSocketLinearProtocol(components, ws, ws.roomId).catch((err) => {
          logger.error(err)
          try {
          ws.close()
          } catch {}
        })
        ws.readyState = WebSocket.OPEN
        ws.emit('open', { })
      },
      message: (_ws, message, isBinary) => {
        _ws.emit('message', Buffer.from(message))
      },
      close: (_ws) => {
        _ws.readyState = WebSocket.CLOSED
        _ws.emit('close', {})
      }
    })
}
