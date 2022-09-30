import { Writer } from 'protobufjs/minimal'
import { WsPacket } from '../proto/ws-comms-rfc-5'

// we use a shared writer to reduce allocations and leverage its allocation pool
const writer = new Writer()

export function craftMessage(packet: Partial<WsPacket>): Uint8Array {
  writer.reset()
  WsPacket.encode(packet as any, writer)
  return writer.finish()
}
