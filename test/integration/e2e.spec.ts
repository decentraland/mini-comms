import { wsAsAsyncChannel } from '../../src/logic/ws-as-async-channel'
import { test } from '../components'
import { createEphemeralIdentity } from '../helpers/identity'
import { future } from 'fp-future'
import { craftMessage } from '../../src/logic/craft-message'
import { normalizeAddress } from '../../src/logic/address'
import { WebSocket as Ws } from 'ws'
import { URL } from 'url'
import { WebSocketReader } from '../../src/types'

export type WebSocket = WebSocketReader & {
  end: () => void
  send: (message: Uint8Array, cb: (err: any) => void) => void
}

test('end to end test', ({ components, spyComponents }) => {
  const aliceIdentity = createEphemeralIdentity('alice')
  const bobIdentity = createEphemeralIdentity('bob')
  const cloheIdentity = createEphemeralIdentity('clohe')

  async function createWs(relativeUrl: string): Promise<WebSocket> {
    const protocolHostAndProtocol = `ws://${await components.config.requireString(
      'HTTP_SERVER_HOST'
    )}:${await components.config.requireNumber('HTTP_SERVER_PORT')}`
    const url = new URL(relativeUrl, protocolHostAndProtocol).toString()
    const ws = new Ws(url) as any
    ws.end = ws.terminate
    return ws
  }

  async function connectSocket(identity: ReturnType<typeof createEphemeralIdentity>, room: string) {
    const ws = await createWs('/rooms/' + room)
    const channel = wsAsAsyncChannel(ws)

    await socketConnected(ws)
    await socketSend(ws, craftMessage({ peerIdentification: { address: identity.address } }))

    // get the challenge from the server
    const { challengeMessage } = await channel.yield(0, 'challenge message did not arrive for ' + identity.address)
    expect(challengeMessage).not.toBeUndefined()

    // sign the challenge
    const authChainJson = JSON.stringify(await identity.sign(challengeMessage.challengeToSign))
    await socketSend(ws, craftMessage({ signedChallengeForServer: { authChainJson } }))

    // expect welcome message from server
    const { welcomeMessage } = await channel.yield(0, 'welcome message did not arrive for ' + identity.address)
    expect(welcomeMessage).not.toBeUndefined()
    return Object.assign(ws, { welcomeMessage, channel, identity, challengeMessage, authChainJson })
  }
  it('connecting one socket and sending nothing should disconnect it after one second', async () => {
    const ws = await createWs('/rooms/test')
    const fut = futureWithTimeout(3000, 'The socket was not closed')

    ws.on('close', fut.resolve) // resolve on close
    ws.on('message', fut.reject) // fail on timeout and message

    await fut
  })

  it('connecting one socket and sending noise should disconnect it immediately', async () => {
    const ws = await createWs('/rooms/test')
    const fut = futureWithTimeout(3000, 'The socket was not closed')

    ws.on('close', fut.resolve) // resolve on close
    ws.on('message', fut.reject) // fail on timeout and message

    await socketConnected(ws)
    await socketSend(ws, new Uint8Array([1, 2, 3, 4, 5, 6]))
    await fut
  })

  it('connects the websocket and authenticates', async () => {
    const ws = await connectSocket(aliceIdentity, 'testRoom')
    ws.close()
  })

  it('connects the websocket and authenticates, doing it twice disconnects former connection', async () => {
    const ws1 = await connectSocket(aliceIdentity, 'testRoom')
    const ws2 = await connectSocket(aliceIdentity, 'testRoom')

    const ws1DisconnectPromise = futureWithTimeout(1000, 'Socket did not disconnect')
    ws1.on('close', ws1DisconnectPromise.resolve)

    // connect ws2 should say "alreadyConnected=true"
    expect(ws2.challengeMessage.alreadyConnected).toEqual(true)

    const { peerKicked } = await ws1.channel.yield(100, 'wait for kicked message')
    expect(peerKicked).not.toBeUndefined()

    // await for disconnection of ws1
    await ws1DisconnectPromise

    // cleanup
    ws2.close()
  })

  it('connects two the websocket and share messages', async () => {
    const alice = await connectSocket(aliceIdentity, 'testRoom')
    const bob = await connectSocket(bobIdentity, 'testRoom')

    // when bob joins the room, the welcome message contains alice's information
    expect(bob.welcomeMessage.peerIdentities).toEqual({
      [alice.welcomeMessage.alias]: normalizeAddress(alice.identity.address)
    })

    // when bob connects alice receives peerJoinMessage
    const { peerJoinMessage } = await alice.channel.yield(1000, 'when bob connects alice receives peerJoinMessage')
    expect(peerJoinMessage).not.toBeUndefined()
    expect(peerJoinMessage.address).toEqual(normalizeAddress(bob.identity.address))
    expect(peerJoinMessage.alias).toEqual(bob.welcomeMessage.alias)

    {
      // alice sends a message that needs to reach bob
      await socketSend(
        alice,
        craftMessage({ peerUpdateMessage: { fromAlias: 0, body: Uint8Array.from([1, 2, 3]), unreliable: false } })
      )
      const { peerUpdateMessage } = await bob.channel.yield(1000, 'alice awaits message from bob')
      expect(peerUpdateMessage).not.toBeUndefined()
      expect(Uint8Array.from(peerUpdateMessage.body)).toEqual(Uint8Array.from([1, 2, 3]))
      expect(peerUpdateMessage.fromAlias).toEqual(alice.welcomeMessage.alias)
    }

    {
      // when a new peer is connected to another room it does not ring any bell on the connected peers
      const clohe = await connectSocket(cloheIdentity, 'another-room')
      clohe.close()
    }

    {
      // bob sends a message that needs to reach alice
      await socketSend(
        bob,
        craftMessage({ peerUpdateMessage: { fromAlias: 0, body: Uint8Array.from([3, 2, 3]), unreliable: false } })
      )
      const { peerUpdateMessage } = await alice.channel.yield(1000, 'alice awaits message from bob')
      expect(peerUpdateMessage).not.toBeUndefined()
      expect(Uint8Array.from(peerUpdateMessage.body)).toEqual(Uint8Array.from([3, 2, 3]))
      expect(peerUpdateMessage.fromAlias).toEqual(bob.welcomeMessage.alias)
    }

    {
      // then clohe joins the room and leaves, sends a message and leaves
      const clohe = await connectSocket(cloheIdentity, 'testRoom')

      {
        // clohe receives welcome with bob and alice
        expect(clohe.welcomeMessage.peerIdentities).toEqual({
          [alice.welcomeMessage.alias]: normalizeAddress(alice.identity.address),
          [bob.welcomeMessage.alias]: normalizeAddress(bob.identity.address)
        })
      }

      {
        // alice receives peerJoinMessage
        const { peerJoinMessage } = await alice.channel.yield(1000, 'alice receives peerJoinMessage')
        expect(peerJoinMessage).not.toBeUndefined()
        expect(peerJoinMessage.address).toEqual(normalizeAddress(clohe.identity.address))
        expect(peerJoinMessage.alias).toEqual(clohe.welcomeMessage.alias)
      }

      {
        // bob receives peerJoinMessage
        const { peerJoinMessage } = await bob.channel.yield(1000, 'bob receives peerJoinMessage')
        expect(peerJoinMessage).not.toBeUndefined()
        expect(peerJoinMessage.address).toEqual(normalizeAddress(clohe.identity.address))
        expect(peerJoinMessage.alias).toEqual(clohe.welcomeMessage.alias)
      }
      {
        // then send a message
        await socketSend(
          clohe,
          craftMessage({ peerUpdateMessage: { fromAlias: 0, body: Uint8Array.from([6]), unreliable: false } })
        )

        {
          // alice receives update
          const { peerUpdateMessage } = await alice.channel.yield(1000, 'alice receives update')
          expect(peerUpdateMessage).not.toBeUndefined()
          expect(peerUpdateMessage.fromAlias).toEqual(clohe.welcomeMessage.alias)
          expect(Uint8Array.from(peerUpdateMessage.body)).toEqual(Uint8Array.from([6]))
        }

        {
          // bob receives update
          const { peerUpdateMessage } = await bob.channel.yield(1000, 'bob receives update')
          expect(peerUpdateMessage).not.toBeUndefined()
          expect(peerUpdateMessage.fromAlias).toEqual(clohe.welcomeMessage.alias)
          expect(Uint8Array.from(peerUpdateMessage.body)).toEqual(Uint8Array.from([6]))
        }
      }
      {
        // clohe leaves
        clohe.close()

        {
          // alice receives leave
          const { peerLeaveMessage } = await alice.channel.yield(1000, 'alice receives leave')
          expect(peerLeaveMessage).not.toBeUndefined()
          expect(peerLeaveMessage.alias).toEqual(clohe.welcomeMessage.alias)
        }

        {
          // bob receives leave
          const { peerLeaveMessage } = await bob.channel.yield(1000, 'bob receives leave')
          expect(peerLeaveMessage).not.toBeUndefined()
          expect(peerLeaveMessage.alias).toEqual(clohe.welcomeMessage.alias)
        }
      }
    }

    // and finally alice leaves
    alice.close()

    {
      // bob receives leave
      const { peerLeaveMessage } = await bob.channel.yield(1000, 'bob receives leave 2')
      expect(peerLeaveMessage).not.toBeUndefined()
      expect(peerLeaveMessage.alias).toEqual(alice.welcomeMessage.alias)
    }

    bob.close()
  })
})

function socketConnected(socket: WebSocket): Promise<void> {
  return new Promise((res) => socket.on('open', res))
}
function socketSend(socket: WebSocket, message: Uint8Array): Promise<void> {
  return new Promise((res, rej) => {
    socket.send(message, (err) => {
      if (err) rej(err)
      else res()
    })
  })
}
function futureWithTimeout<T = any>(ms: number, message = 'Timed out') {
  const fut = future<T>()
  const t = setTimeout(() => fut.reject(new Error(message)), ms)
  fut.finally(() => clearTimeout(t))
  return fut
}
