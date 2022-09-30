import { EthAddress } from '@dcl/schemas'
import { AppComponents, WebSocket } from '../types'
import { Authenticator } from '@dcl/crypto'
import { wsAsAsyncChannel } from './ws-as-async-channel'
import { normalizeAddress } from './address'
import { craftMessage } from './craft-message'

export async function handleSocketLinearProtocol(
  { rooms, logs, ethereumProvider, metrics }: Pick<AppComponents, 'rooms' | 'logs' | 'ethereumProvider' | 'metrics'>,
  socket: WebSocket
) {
  const logger = logs.getLogger('LinearProtocol')
  // Wire the socket to a pushable channel
  const channel = wsAsAsyncChannel(socket)

  try {
    // process the messages
    /// 1. the remote client sends their authentication message
    const { peerIdentification } = await channel.yield(1000, 'Timed out waiting for peer identification')

    if (!peerIdentification) {
      throw new Error('Invalid protocol. peerIdentification packet missed')
    }

    if (!EthAddress.validate(peerIdentification.address))
      throw new Error('Invalid protocol. peerIdentification has an invalid address')

    const address = normalizeAddress(peerIdentification.address)

    const challengeToSign = 'dcl-' + Math.random().toString(36)
    const alreadyConnected = rooms.isAddressConnected(address)
    logger.debug('Generating challenge', {
      challengeToSign,
      address,
      alreadyConnected: alreadyConnected + ''
    })

    if (socket.send(craftMessage({ challengeMessage: { alreadyConnected, challengeToSign } }), true) !== 1) {
      logger.error('Closing connection: cannot send challenge')
      socket.close()
      return
    }

    /// 3. wait for the confirmation message
    const { signedChallengeForServer } = await channel.yield(1000, 'Timed out waiting for signed challenge response')

    if (!signedChallengeForServer) {
      throw new Error('Invalid protocol. signedChallengeForServer packet missed')
    }

    const result = await Authenticator.validateSignature(
      challengeToSign,
      JSON.parse(signedChallengeForServer.authChainJson),
      ethereumProvider
    )

    if (!result.ok) {
      logger.error(`Authentication failed`, { message: result.message } as any)
      throw new Error('Authentication failed')
    }
    logger.debug(`Authentication successful`, { address })

    // disconnect previous session
    const kicked = rooms.getSocket(address)

    if (kicked) {
      const room = socket.roomId
      logger.info('Kicking user', { room, address, alias: kicked.alias })
      kicked.send(craftMessage({ peerKicked: {} }), true)
      kicked.close()
      rooms.removeFromRoom(kicked)
      logger.info('Kicked user', { room, address, alias: kicked.alias })
      metrics.increment('dcl_ws_rooms_kicks_total')
    }

    socket.address = address
    rooms.addSocketToRoom(socket, address)

    // 1. tell the user about their identity and the neighbouring peers,
    //    and disconnect other peers if the address is repeated
    const peerIdentities: Record<number, string> = {}
    for (const peer of rooms.getRoom(socket.roomId)) {
      if (peer !== socket && peer.address) {
        peerIdentities[peer.alias] = peer.address
      }
    }

    const welcomeMessage = craftMessage({ welcomeMessage: { alias: socket.alias, peerIdentities } })
    if (socket.send(welcomeMessage, true) !== 1) {
      logger.error('Closing connection: cannot send welcome message')
      socket.close()
      return
    }

    // 2. broadcast to all room that this user is joining them
    const joinedMessage = craftMessage({
      peerJoinMessage: { alias: socket.alias, address }
    })
    socket.subscribe(socket.roomId)
    socket.publish(socket.roomId, joinedMessage, true)

    metrics.increment('dcl_ws_rooms_connections_total')
  } finally {
    // close the channel to remove the listener
    channel.close()
  }
}
