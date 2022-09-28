import { Lifecycle } from '@well-known-components/interfaces'
import { runTest } from './main'
import { AppComponents, TestComponents } from './types'

// this function wires the business logic (adapters & controllers) with the components (ports)
export async function main(program: Lifecycle.EntryPointParameters<AppComponents | TestComponents>) {
  const { components, startComponents } = program

  // start ports: db, listeners, synchronizations, etc
  await startComponents()

  runTest(components)
}
