import { GlobalContext, WebSocket, Stage } from '../types'
import { WsPacket } from '../proto/ws-comms-rfc-5'
import * as uWS from 'uWebSockets.js'
import { handleSocketLinearProtocol } from '../logic/handle-linear-protocol'
import mitt from 'mitt'
import { craftMessage } from '../logic/craft-message'

let connectionCounter = 0

export async function setupRouter({ app, components }: GlobalContext): Promise<void> {
  const { logs, metrics } = components
  const logger = logs.getLogger('rooms')

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
            ...mitt()
          },
          /* Spell these correctly */
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context
        )
      },
      open: (_ws) => {
        const ws = _ws as any as WebSocket
        ws.stage = Stage.LINEAR
        ws.alias = ++connectionCounter
        handleSocketLinearProtocol(components, ws)
          .then(() => {
            ws.stage = Stage.READY
          })
          .catch((err) => {
            logger.error(err)
            try {
              ws.close()
            } catch {}
          })
      },
      message: (_ws, message, isBinary) => {
        if (!isBinary) {
          logger.log('protocol error: data is not binary')
          return
        }

        const ws = _ws as any as WebSocket

        switch (ws.stage) {
          case Stage.LINEAR: {
            _ws.emit('message', Buffer.from(message))
            break
          }
          case Stage.READY: {
            const packet = WsPacket.decode(Buffer.from(message))
            if (!packet.peerUpdateMessage) {
              // we accept unknown messages to enable protocol extensibility and compatibility.
              // do NOT kick the users when they send unknown messages
              metrics.increment('dcl_ws_rooms_unknown_sent_messages_total')
              return
            }

            const { body, unreliable } = packet.peerUpdateMessage
            ws.publish(
              ws.roomId,
              craftMessage({
                peerUpdateMessage: {
                  fromAlias: ws.alias,
                  body,
                  unreliable
                }
              }),
              true
            )

            break
          }
        }
      },
      close: (_ws) => {
        logger.log('WS closed')

        const ws = _ws as any as WebSocket
        components.rooms.removeFromRoom(ws)
        app.publish(ws.roomId, craftMessage({ peerLeaveMessage: { alias: ws.alias } }), true)
      }
    })
}
