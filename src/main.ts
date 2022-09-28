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

export function runTest(components: Pick<AppComponents, 'rooms' | 'logs' | 'ethereumProvider'>) {
  const roomId = '1'
  const logger = components.logs.getLogger('uwebsocket test')
  const status = new Map<uWS.WebSocket, { stage: Stage; challengeToSign?: string; address?: string }>()
  uWS
    .App({})
    .ws('/rooms/:roomId', {
      open: (ws) => {
        // const roomId = req.getParameter(0)
        console.log('A WebSocket connected!')

        status.set(ws, { stage: Stage.INITIAL })
      },
      message: (ws, message, isBinary) => {
        if (!isBinary) {
          console.log('protocol error: data is not binary')
          return
        }
        const peerStatus = status.get(ws)
        if (!peerStatus) {
          console.log('error: no status')
          return
        }

        const packet = WsPacket.decode(new Uint8Array(message))
        switch (peerStatus.stage) {
          case Stage.INITIAL: {
            if (!packet.peerIdentification) {
              ws.close()
              logger.debug('Closing connection. Expecting peer identification')
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
              logger.error('cannot send challenge')
              ws.close()
            }

            peerStatus.stage = Stage.CHALLENGE_SENT
            logger.debug('Stage changed', {
              stage: peerStatus.stage
            })
            break
          }
          case Stage.CHALLENGE_SENT: {
            if (!packet.signedChallengeForServer) {
              ws.close()
              logger.debug('Closing connection. Expecting signed challenge')
              return
            }

            Authenticator.validateSignature(
              peerStatus.challengeToSign!,
              JSON.parse(packet.signedChallengeForServer.authChainJson),
              components.ethereumProvider
            )
              .then((result) => {
                if (result.ok) {
                  logger.debug(`Authentication successful`, { address: peerStatus.address! })

                  peerStatus.stage = Stage.READY
                  logger.debug('Stage changed', {
                    stage: peerStatus.stage
                  })
                  components.rooms.addSocketToRoom(ws, peerStatus.address!, roomId)
                } else {
                  logger.error(`Authentication failed`, { message: result.message } as any)
                  ws.close()
                }
              })
              .catch((err) => {
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
            components.rooms.onMessage(peerStatus.address!, packet.peerUpdateMessage)
            break
          }
        }
      },
      close: (ws) => {
        console.log('WS closed')
        const peerStatus = status.get(ws)
        if (!peerStatus) {
          return
        }
        components.rooms.onClose(peerStatus.address!)
      }
    })
    .listen(port, (token) => {
      if (token) {
        console.log('Listening to port ' + port)
      } else {
        console.log('Failed to listen to port ' + port)
      }
    })
}
