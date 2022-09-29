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

type ByStage =
  | {
      stage: Stage.CHALLENGE_SENT | Stage.READY
      challengeToSign: string
      address: string
    }
  | { stage: Stage.INITIAL; challengeToSign?: string; address?: string }

type RoomSocket = {
  roomId: string
  alias: number
} & ByStage

let connectionCounter = 0

export function runTest(components: Pick<AppComponents, 'logs' | 'ethereumProvider'>) {
  const logger = components.logs.getLogger('uwebsocket test')
  const status = new Map<uWS.WebSocket, RoomSocket>()
  uWS
    .App({})
    .ws('/rooms/:roomId', {
      compression: uWS.DISABLED,
      open: (ws) => {
        // const roomId = req.getParameter(0)
        logger.log('A WebSocket connected!')

        const alias = ++connectionCounter
        const roomId = '1'
        status.set(ws, { stage: Stage.INITIAL, roomId, alias })
      },
      message: (ws, message, isBinary) => {
        if (!isBinary) {
          logger.log('protocol error: data is not binary')
          return
        }
        const peerStatus = status.get(ws)
        if (!peerStatus) {
          logger.log('error: no status')
          return
        }

        const changeStage = (toStage: Stage) => {
          logger.debug('Stage changed', {
            address: peerStatus.address!,
            from: peerStatus.stage,
            to: toStage
          })
          peerStatus.stage = toStage
        }

        const packet = WsPacket.decode(new Uint8Array(message))
        switch (peerStatus.stage) {
          case Stage.INITIAL: {
            if (!packet.peerIdentification) {
              logger.debug('Closing connection. Expecting peer identification')
              ws.close()
              return
            }

            peerStatus.challengeToSign = 'dcl-' + Math.random().toString(36)
            peerStatus.address = normalizeAddress(packet.peerIdentification.address)

            logger.debug('Generating challenge', {
              challengeToSign: peerStatus.challengeToSign,
              address: peerStatus.address
            })
            const sendResult = ws.send(
              craftMessage({
                challengeMessage: {
                  alreadyConnected: false,
                  challengeToSign: peerStatus.challengeToSign
                }
              }),
              true
            )
            if (sendResult !== 1) {
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
              peerStatus.challengeToSign,
              JSON.parse(packet.signedChallengeForServer.authChainJson),
              components.ethereumProvider
            )
              .then((result) => {
                if (result.ok) {
                  logger.debug(`Authentication successful`, { address: peerStatus.address })

                  const peerIdentities: Record<number, string> = {}
                  for (const peer of status.values()) {
                    if (
                      peer.address !== peerStatus.address &&
                      peer.roomId === peerStatus.roomId &&
                      peer.stage === Stage.READY
                    ) {
                      peerIdentities[peer.alias] = peer.address
                    }
                  }
                  const welcomeMessage = craftMessage({
                    welcomeMessage: { alias: peerStatus.alias, peerIdentities }
                  })
                  ws.send(welcomeMessage, true)

                  // 2. broadcast to all room that this user is joining them
                  const joinedMessage = craftMessage({
                    peerJoinMessage: { alias: peerStatus.alias, address: peerStatus.address }
                  })
                  ws.subscribe(peerStatus.roomId)
                  ws.publish(peerStatus.roomId, joinedMessage, true)

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
            const peerStatus = status.get(ws)
            if (!peerStatus) {
              return
            }

            if (!packet.peerUpdateMessage) {
              // we accept unknown messages to enable protocol extensibility and compatibility.
              // do NOT kick the users when they send unknown messages
              // components.metrics.increment('dcl_ws_rooms_unknown_sent_messages_total')
              return
            }

            if (!peerStatus.alias) {
              logger.error('Missing alias but stage is ready')
              return
            }

            packet.peerUpdateMessage.fromAlias = peerStatus.alias
            ws.publish(peerStatus.roomId, craftMessage({ peerUpdateMessage: packet.peerUpdateMessage }), true)

            break
          }
        }
      },
      close: (ws) => {
        logger.log('WS closed')
        const peerStatus = status.get(ws)
        if (!peerStatus) {
          return
        }
        status.delete(ws)
        // ws.unsubscribe(peerStatus.roomId)
        // ws.publish(peerStatus.roomId, craftMessage({ peerLeaveMessage: { alias: peerStatus.alias } }), true)
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
