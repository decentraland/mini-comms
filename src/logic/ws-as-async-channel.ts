import { AsyncQueue } from '@dcl/rpc/dist/push-channel'
import { WebSocket } from 'ws'
import { WebSocket as uWebSocket } from 'uWebSockets.js'
import { WsPacket } from '../proto/ws-comms-rfc-5'

export function wsAsAsyncChannel(socket: WebSocket | uWebSocket) {
  // Wire the socket to a pushable channel
  const channel = new AsyncQueue<WsPacket>((queue, action) => {
    if (action === 'close') {
      socket.off('message', processMessage)
      socket.off('close', closeChannel)
    }
  })
  function processMessage(data: Buffer) {
    try {
      channel.enqueue(WsPacket.decode(data))
    } catch (error) {
      socket.emit('error', error)
      socket.terminate()
    }
  }
  function closeChannel() {
    channel.close()
  }
  socket.on('message', processMessage)
  socket.on('close', closeChannel)
  socket.on('error', closeChannel)
  return Object.assign(channel, {
    async yield(timeoutMs: number, error?: string): Promise<WsPacket> {
      if (timeoutMs) {
        const next: any = (await Promise.race([channel.next(), timeout(timeoutMs, error)])) as any
        if (next.done) throw new Error('Cannot consume message from closed AsyncQueue. ' + error)
        return next.value
      } else {
        const next = await channel.next()
        if (next.done) throw new Error('Cannot consume message from closed AsyncQueue.' + error)
        return next.value
      }
    }
  })
}

function timeout(ms: number, error = 'Timed out') {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(error)), ms)
  })
}