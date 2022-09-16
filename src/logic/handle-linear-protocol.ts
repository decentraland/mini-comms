import { EthAddress } from '@dcl/schemas'
import { WebSocket } from 'ws'
import { craftMessage } from '../adapters/rooms'
import { AppComponents } from '../types'
import { Authenticator } from '@dcl/crypto'
import { wsAsAsyncChannel } from './ws-as-async-channel'

export async function handleSocketLinearProtocol(
  components: Pick<AppComponents, 'rooms' | 'logs' | 'ethereumProvider'>,
  socket: WebSocket,
  room: string
) {
  const logger = components.logs.getLogger('LinearProtocol')
  // Wire the socket to a pushable channel
  const channel = wsAsAsyncChannel(socket)

  try {
    // process the messages
    /// 1. the remote client sends their authentication message
    const { peerIdentification } = await channel.yield(1000, 'Timed out waining for peer identification')

    if (!peerIdentification) throw new Error('Invalid protocol. peerIdentification packet missed')
    if (!EthAddress.validate(peerIdentification.address))
      throw new Error('Invalid protocol. peerIdentification has an invalid address')

    const challengeToSign = 'dcl-' + Math.random().toString(36)
    const alreadyConnected = components.rooms.isAddressConnected(peerIdentification.address.toLowerCase())
    logger.debug('Generating challenge', {
      challengeToSign,
      address: peerIdentification.address,
      alreadyConnected: alreadyConnected + ''
    })

    /// 2. send the challenge back to the client
    socket.send(craftMessage({ challengeMessage: { alreadyConnected, challengeToSign } }), (err) => {
      if (err) {
        logger.error(err)
        console.error(err)
        socket.close()
        channel.close()
      }
    })

    /// 3. wait for the confirmation message
    const { signedChallengeForServer } = await channel.yield(1000, 'Timed out waiting for signed challenge response')

    if (!signedChallengeForServer) {
      throw new Error('Invalid protocol. signedChallengeForServer packet missed')
    }

    const result = await Authenticator.validateSignature(
      challengeToSign,
      JSON.parse(signedChallengeForServer.authChainJson),
      components.ethereumProvider
    )

    if (result.ok) {
      logger.debug(`Authentication successful`, { address: peerIdentification.address })

      components.rooms.addSocketToRoom(socket, peerIdentification.address.toLowerCase(), room)
    } else {
      logger.error(`Authentication failed`, { message: result.message } as any)
      throw new Error('Authentication failed')
    }
  } finally {
    // close the channel to remove the listener
    channel.close()
  }
}
