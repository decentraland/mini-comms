import { Writer } from 'protobufjs/minimal'
import * as proto from '../proto/ws-comms-rfc-5'
import { AppComponents } from '../types'
import { validateMetricsDeclaration } from '@well-known-components/metrics'
import { WebSocket as uWebSocket } from 'uWebSockets.js'
import { WebSocket } from 'ws'

export type RoomComponent = {
  addSocketToRoom(ws: WebSocket | uWebSocket, address: string, room: string): void
  isAddressConnected(address: string): boolean
}

export type RoomSocket = {
  ws: WebSocket
  address: string
  alias: number
  room: string
}
export function isWs(x: any): x is WebSocket {
  return 'terminate' in x
}
export const roomsMetrics = validateMetricsDeclaration({
  dcl_ws_rooms_count: {
    help: 'Current amount of rooms',
    type: 'gauge'
  },
  dcl_ws_rooms_sent_messages_total: {
    help: 'Amount of user sent messages',
    type: 'counter'
  },
  dcl_ws_rooms_connections: {
    help: 'Current amount of connections',
    type: 'gauge'
  },
  dcl_ws_rooms_connections_total: {
    help: 'Total amount of connections',
    type: 'counter'
  },
  dcl_ws_rooms_kicks_total: {
    help: 'Total amount of kicked players',
    type: 'counter'
  },
  dcl_ws_rooms_unknown_sent_messages_total: {
    help: 'Total amount of unkown messages',
    type: 'counter'
  },
  dcl_ws_rooms_dropped_unreliable_messages_total: {
    help: 'Total amount of dropped unreliable messages',
    type: 'counter'
  }
})

// we use a shared writer to reduce allocations and leverage its allocation pool
const writer = new Writer()
export function craftMessage(packet: Partial<proto.WsPacket>): Uint8Array {
  writer.reset()
  proto.WsPacket.encode(packet as any, writer)
  return writer.finish()
}

export async function createRoomsComponent(
  components: Pick<AppComponents, 'logs' | 'metrics' | 'config'>
): Promise<RoomComponent> {
  const rooms = new Map<string, Set<RoomSocket>>()
  const addressToSocket = new Map<string, RoomSocket>()
  const logger = components.logs.getLogger('RoomsComponent')
  const unreliableThreshold = (await components.config.getNumber('WS_MAX_BUFFERED_AMOUNT')) || 0

  let connectionCounter = 0

  // gets or creates a room
  function getRoom(room: string) {
    let r = rooms.get(room)
    if (!r) {
      logger.debug('Creating room', { room })
      r = new Set()
      rooms.set(room, r)
    }
    observeRoomCount()
    return r
  }

  function observeRoomCount() {
    components.metrics.observe('dcl_ws_rooms_count', {}, rooms.size)
  }
  function observeConnectionCount() {
    components.metrics.observe('dcl_ws_rooms_connections', {}, addressToSocket.size)
  }

  // Removes a socket from a room in the data structure and also forwards the
  // message to the rest of the room.
  // Deletes the room if it becomes empty
  function removeFromRoom(roomSocket: RoomSocket) {
    const roomInstance = getRoom(roomSocket.room)
    logger.debug('Disconnecting user', {
      room: roomSocket.room,
      address: roomSocket.address,
      alias: roomSocket.alias,
      count: addressToSocket.size
    })
    roomInstance.delete(roomSocket)
    addressToSocket.delete(roomSocket.address)
    if (roomInstance.size === 0) {
      logger.debug('Destroying room', { room: roomSocket.room, count: rooms.size })
      rooms.delete(roomSocket.room)
      observeRoomCount()
    } else {
      broadcastToRoom(roomInstance, craftMessage({ peerLeaveMessage: { alias: roomSocket.alias } }), roomSocket, true)
    }
    observeConnectionCount()
  }

  // simply sends a message to a socket. disconnects the socket upon failure
  function sendMessage(socket: WebSocket | uWebSocket, message: Uint8Array, reliable: boolean) {
    if (isWs(socket)) {
      if (socket.readyState === WebSocket.OPEN) {
        if ((socket.bufferedAmount <= unreliableThreshold || reliable) && !socket.isPaused) {
          try {
            socket.send(message, (err) => {
              if (err) {
                socket.terminate()
              }
            })
          } catch (err: any) {
            socket.terminate()
          }
        } else {
          components.metrics.increment('dcl_ws_rooms_dropped_unreliable_messages_total')
        }
      }
    } else {
      const result = socket.send(message, true)
      if (result !== 1) {
        logger.error(`cannot send message ${result}`)
        socket.close()
      }
    }
  }

  // broadcasts a message to a room. optionally it can skip one socket
  function broadcastToRoom(
    roomSockets: Set<RoomSocket>,
    message: Uint8Array,
    excludePeer: RoomSocket,
    reliable: boolean
  ) {
    for (const peer of roomSockets) {
      if (peer === excludePeer) continue
      sendMessage(peer.ws, message, reliable)
    }
  }

  // receives an authenticated socket and adds it to a room
  function addSocketToRoom(ws: WebSocket, address: string, room: string) {
    const alias = ++connectionCounter
    const newRoomSocket: RoomSocket = {
      ws,
      alias,
      address,
      room
    }
    logger.debug('Connecting user', { room, address, alias })

    // disconnect previous session
    const kicked = addressToSocket.get(newRoomSocket.address)

    if (kicked) {
      logger.info('Kicking user', { room, address, alias: kicked.alias })
      sendMessage(kicked.ws, craftMessage({ peerKicked: {} }), true)
      kicked.ws.close()
      removeFromRoom(kicked)
      logger.info('Kicked user', { room, address, alias: kicked.alias })
      components.metrics.increment('dcl_ws_rooms_kicks_total')
    }

    const roomInstance = getRoom(room)
    // 0. before anything else, add the user to the room and hook the 'close' and 'message' events
    roomInstance.add(newRoomSocket)
    addressToSocket.set(newRoomSocket.address, newRoomSocket)
    newRoomSocket.ws.on('error', (err) => {
      logger.error(err)
      removeFromRoom(newRoomSocket)
    })
    newRoomSocket.ws.on('close', () => removeFromRoom(newRoomSocket))
    newRoomSocket.ws.on('message', (body) => {
      const { peerUpdateMessage } = proto.WsPacket.decode(body as any)
      if (peerUpdateMessage) {
        broadcastToRoom(
          roomInstance,
          craftMessage({
            peerUpdateMessage: {
              fromAlias: newRoomSocket.alias,
              body: peerUpdateMessage.body,
              unreliable: peerUpdateMessage.unreliable
            }
          }),
          newRoomSocket,
          !peerUpdateMessage.unreliable
        )
        components.metrics.increment('dcl_ws_rooms_sent_messages_total')
      } else {
        // we accept unknown messages to enable protocol extensibility and compatibility.
        // do NOT kick the users when they send unknown messages
        components.metrics.increment('dcl_ws_rooms_unknown_sent_messages_total')
      }
    })

    observeConnectionCount()

    // 1. tell the user about their identity and the neighbouring peers,
    //    and disconnect other peers if the address is repeated
    const peerIdentities: Record<number, string> = {}
    for (const peer of roomInstance) {
      if (peer.address !== newRoomSocket.address) {
        peerIdentities[peer.alias] = peer.address
      }
    }
    const welcomeMessage = craftMessage({ welcomeMessage: { alias: newRoomSocket.alias, peerIdentities } })
    sendMessage(ws, welcomeMessage, true)

    // 2. broadcast to all room that this user is joining them
    const joinedMessage = craftMessage({
      peerJoinMessage: { alias: newRoomSocket.alias, address: newRoomSocket.address }
    })
    broadcastToRoom(roomInstance, joinedMessage, newRoomSocket, true)

    components.metrics.increment('dcl_ws_rooms_connections_total')
  }

  function isAddressConnected(address: string): boolean {
    return addressToSocket.has(address)
  }

  return {
    addSocketToRoom,
    isAddressConnected
  }
}
