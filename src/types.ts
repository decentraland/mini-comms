import type { IFetchComponent } from '@well-known-components/http-server'
import type {
  IConfigComponent,
  ILoggerComponent,
  IHttpServerComponent,
  IBaseComponent,
  IMetricsComponent
} from '@well-known-components/interfaces'
import { metricDeclarations } from './metrics'
import { HTTPProvider } from 'eth-connect'
import { RoomComponent } from './adapters/rooms'
import { TemplatedApp } from 'uWebSockets.js'
import { WebSocket } from 'ws'

export type GlobalContext = {
  app: TemplatedApp
  components: BaseComponents
}

export type RpcContext = GlobalContext

export type WebSocketComponent = IBaseComponent & {}

// components used in every environment
export type BaseComponents = {
  config: IConfigComponent
  logs: ILoggerComponent
  fetch: IFetchComponent
  metrics: IMetricsComponent<keyof typeof metricDeclarations>
  ethereumProvider: HTTPProvider
  rooms: RoomComponent
}

export type Channel<T> = {
  close: () => void
  [Symbol.asyncIterator]: () => AsyncGenerator<T>
}

// components used in runtime
export type AppComponents = BaseComponents & {}

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
