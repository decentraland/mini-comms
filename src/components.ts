import { HTTPProvider } from 'eth-connect'
import { createDotEnvConfigComponent } from '@well-known-components/env-config-provider'
import { createServerComponent, createStatusCheckComponent } from '@well-known-components/http-server'
import { createLogComponent } from '@well-known-components/logger'
import { createFetchComponent } from './adapters/fetch'
import { createMetricsComponent } from '@well-known-components/metrics'
import { AppComponents, GlobalContext } from './types'
import { metricDeclarations } from './metrics'
import { createWsComponent } from './adapters/ws'
import { createRealmComponent } from './adapters/realm'
import { catalystRegistryForProvider } from '@dcl/catalyst-contracts'
import { createStatusComponent } from './adapters/status'
import { observeBuildInfo } from './logic/build-info'
import { createRoomsComponent } from './adapters/rooms'

const DEFAULT_ETH_NETWORK = 'goerli'

// Initialize all the components of the app
export async function initComponents(): Promise<AppComponents> {
  const config = await createDotEnvConfigComponent({ path: ['.env.default', '.env'] })

  const ethNetwork = (await config.getString('ETH_NETWORK')) ?? DEFAULT_ETH_NETWORK

  const logs = await createLogComponent({})
  const ws = await createWsComponent({ logs })
  const server = await createServerComponent<GlobalContext>(
    { config, logs, ws: ws.ws },
    {
      cors: {
        maxAge: 36000
      }
    }
  )
  const statusChecks = await createStatusCheckComponent({ server, config })
  const fetch = await createFetchComponent()
  const metrics = await createMetricsComponent(metricDeclarations, { server, config })
  const ethereumProvider = new HTTPProvider(
    `https://rpc.decentraland.org/${encodeURIComponent(ethNetwork)}?project=mini-comms`,
    { fetch: fetch.fetch }
  )

  const contract = await catalystRegistryForProvider(ethereumProvider)
  const realm = await createRealmComponent({ config, logs, fetch, contract })
  const status = await createStatusComponent({ config, logs, fetch })
  const rooms = createRoomsComponent({ logs, metrics })

  await observeBuildInfo({ config, metrics })

  return {
    config,
    logs,
    server,
    statusChecks,
    fetch,
    metrics,
    ws,
    ethereumProvider,
    realm,
    contract,
    status,
    rooms
  }
}
