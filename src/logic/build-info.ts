import { AppComponents } from '../types'

export async function observeBuildInfo(components: Pick<AppComponents, 'config' | 'metrics'>) {
  const ethNetwork = (await components.config.getString('ETH_NETWORK')) ?? 'undefined'
  const commitHash = (await components.config.getString('COMMIT_HASH')) ?? 'undefined'
  components.metrics.observe('mini_comms_build_info', { ethNetwork, commitHash }, 1)
}
