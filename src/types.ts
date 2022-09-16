import type { IFetchComponent, WebSocketServer } from '@well-known-components/http-server'
import type {
  IConfigComponent,
  ILoggerComponent,
  IHttpServerComponent,
  IBaseComponent,
  IMetricsComponent
} from '@well-known-components/interfaces'
import { metricDeclarations } from './metrics'
import { WebSocket } from 'ws'
import { RpcServer, RpcServerPort } from '@dcl/rpc'
import { IRealmComponent } from './adapters/realm'
import { CatalystContract } from '@dcl/catalyst-contracts'
import { IStatusComponent } from './adapters/status'
import { RoomComponent } from './adapters/rooms'

export type GlobalContext = {
  components: BaseComponents
}

export type RpcContext = GlobalContext

export type WebSocketComponent = IBaseComponent & {
  ws: WebSocketServer
}

// components used in every environment
export type BaseComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  server: IHttpServerComponent<GlobalContext>
  fetch: IFetchComponent
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  ws: WebSocketComponent
  realm: IRealmComponent
  ethereumProvider: any
  contract: CatalystContract
  status: IStatusComponent

  rooms: RoomComponent
}

export type Channel<T> = {
  close: () => void
  [Symbol.asyncIterator]: () => AsyncGenerator<T>
}

// components used in runtime
export type AppComponents = BaseComponents & {
  statusChecks: IBaseComponent
}

// components used in tests
export type TestComponents = BaseComponents & {
  // A fetch component that only hits the test server
  localFetch: IFetchComponent
  createLocalWebSocket: IWsTestComponent
}

export type IWsTestComponent = {
  createWs(relativeUrl: string): WebSocket
}

// this type simplifies the typings of http handlers
export type HandlerContextWithPath<
  ComponentNames extends keyof AppComponents,
  Path extends string = any
> = IHttpServerComponent.PathAwareContext<
  IHttpServerComponent.DefaultContext<{
    components: Pick<AppComponents, ComponentNames>
  }>,
  Path
>

export type Context<Path extends string = any> = IHttpServerComponent.PathAwareContext<GlobalContext, Path>
