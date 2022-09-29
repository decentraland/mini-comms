import * as uWS from 'uWebSockets.js'
import { AppComponents } from './types'
import { WsPacket } from './proto/ws-comms-rfc-5'
import { Writer } from 'protobufjs/minimal'
import { Authenticator } from '@dcl/crypto'
import { normalizeAddress } from './logic/address'

const port = 9001

const writer = new Writer()
export function craftMessage(packet: Partial<WsPacket>): Uint8Array {
  writer.reset()
  WsPacket.encode(packet as any, writer)
  return writer.finish()
}

enum Stage {
  INITIAL,
  CHALLENGE_SENT,
  READY
}

type StatusByStage =
  | {
      stage: Stage.CHALLENGE_SENT | Stage.READY
      challengeToSign: string
      address: string
    }
  | { stage: Stage.INITIAL; challengeToSign?: string; address?: string }

type WebSocket = uWS.WebSocket & {
  roomId: string
  alias: number
} & StatusByStage

let connectionCounter = 0

export function runTest(components: Pick<AppComponents, 'logs' | 'ethereumProvider'>) {
  const logger = components.logs.getLogger('uwebsocket test')
  const rooms = new Map<string, Set<WebSocket>>()
  const app = uWS
    .App({})
    .ws('/rooms/:roomId', {
      compression: uWS.DISABLED,
      upgrade: (res, req, context) => {
        const roomId = req.getParameter(0)
        res.upgrade(
          {
            // NOTE: this is user data
            url: req.getUrl(),
            roomId
          },
          /* Spell these correctly */
          req.getHeader('sec-websocket-key'),
          req.getHeader('sec-websocket-protocol'),
          req.getHeader('sec-websocket-extensions'),
          context
        )
      },
      open: (ws) => {
        ws.stage = Stage.INITIAL
        ws.alias = ++connectionCounter
      },
      message: (_ws, message, isBinary) => {
        if (!isBinary) {
          logger.log('protocol error: data is not binary')
          return
        }

        const ws = _ws as any as WebSocket

        const changeStage = (toStage: Stage) => {
          logger.debug('Stage changed', {
            address: ws.address!,
            from: Stage[ws.stage],
            to: Stage[toStage]
          })
          ws.stage = toStage
        }

        const packet = WsPacket.decode(new Uint8Array(message))
        switch (ws.stage) {
          case Stage.INITIAL: {
            if (!packet.peerIdentification) {
              logger.debug('Closing connection. Expecting peer identification')
              ws.close()
              return
            }

            ws.challengeToSign = 'dcl-' + Math.random().toString(36)
            ws.address = normalizeAddress(packet.peerIdentification.address)

            logger.debug('Generating challenge', {
              challengeToSign: ws.challengeToSign,
              address: ws.address
            })

            const challenge = craftMessage({
              challengeMessage: {
                alreadyConnected: false,
                challengeToSign: ws.challengeToSign
              }
            })

            if (ws.send(challenge, true) !== 1) {
              logger.debug('Closing connection. Failed to send a challenge')
              ws.close()
              return
            }

            changeStage(Stage.CHALLENGE_SENT)
            break
          }
          case Stage.CHALLENGE_SENT: {
            if (!packet.signedChallengeForServer) {
              logger.debug('Closing connection. Signed challenge expected')
              ws.close()
              return
            }

            Authenticator.validateSignature(
              ws.challengeToSign,
              JSON.parse(packet.signedChallengeForServer.authChainJson),
              components.ethereumProvider
            )
              .then((result) => {
                if (result.ok) {
                  logger.debug(`Authentication successful`, { address: ws.address })

                  const peerIdentities: Record<number, string> = {}
                  const roomWss = rooms.get(ws.roomId) || new Set<WebSocket>()
                  for (const peerWs of roomWss) {
                    if (peerWs.stage === Stage.READY) {
                      peerIdentities[peerWs.alias] = ws.address
                    }
                  }
                  const welcomeMessage = craftMessage({
                    welcomeMessage: { alias: ws.alias, peerIdentities }
                  })
                  if (ws.send(welcomeMessage, true) !== 1) {
                    logger.debug('Closing connection. Failed to send welcome message')
                    ws.close()
                    return
                  }

                  // 2. broadcast to all room that this user is joining them
                  const joinedMessage = craftMessage({
                    peerJoinMessage: { alias: ws.alias, address: ws.address }
                  })
                  ws.subscribe(ws.roomId)
                  ws.publish(ws.roomId, joinedMessage, true)

                  roomWss.add(ws)
                  rooms.set(ws.roomId, roomWss)

                  changeStage(Stage.READY)
                } else {
                  logger.error(`Authentication failed`, { message: result.message } as any)
                  ws.close()
                }
              })
              .catch((err) => {
                logger.debug('Authenticator errr')
                logger.error(err)
                ws.close()
              })

            break
          }
          case Stage.READY: {
            if (!packet.peerUpdateMessage) {
              // we accept unknown messages to enable protocol extensibility and compatibility.
              // do NOT kick the users when they send unknown messages
              // components.metrics.increment('dcl_ws_rooms_unknown_sent_messages_total')
              return
            }

            if (!ws.alias) {
              logger.error('Missing alias but stage is ready')
              return
            }

            packet.peerUpdateMessage.fromAlias = ws.alias
            ws.publish(ws.roomId, craftMessage({ peerUpdateMessage: packet.peerUpdateMessage }), true)

            break
          }
        }
      },
      close: (_ws) => {
        logger.log('WS closed')

        const ws = _ws as any as WebSocket
        let roomsPeer = rooms.get(ws.roomId)
        if (roomsPeer) {
          roomsPeer.delete(ws)

          if (roomsPeer.size === 0) {
            rooms.delete(ws.roomId)
          }
        }
        app.publish(ws.roomId, craftMessage({ peerLeaveMessage: { alias: ws.alias } }), true)
      }
    })
    .listen(port, (token) => {
      if (token) {
        logger.log('Listening to port ' + port)
      } else {
        logger.log('Failed to listen to port ' + port)
      }
    })
}
