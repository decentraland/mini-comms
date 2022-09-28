import { IMetricsComponent } from '@well-known-components/interfaces'
import { getDefaultHttpMetrics, validateMetricsDeclaration } from '@well-known-components/metrics'
import { roomsMetrics } from './adapters/rooms'

export const metricDeclarations = {
  ...getDefaultHttpMetrics(),
  ...roomsMetrics,
  test_ping_counter: {
    help: 'Count calls to ping',
    type: IMetricsComponent.CounterType,
    labelNames: ['pathname']
  },
  mini_comms_build_info: {
    help: 'Explorer BFF build info.',
    type: IMetricsComponent.GaugeType,
    labelNames: ['commitHash', 'ethNetwork']
  }
}

// type assertions
validateMetricsDeclaration(metricDeclarations)
