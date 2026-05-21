/**
 * Corrects delivery mode when skills are required but missing on disk.
 */

import type { Delivery } from './global-config.js';
import { hasActiveUpstreamOpenSpec } from './legacy-cleanup.js';

/**
 * When upstream OpenSpec is present and delivery is `commands`, upgrade to `both`
 * so QASpec can install `qas-*` skills while skipping overwrite of upstream artifacts.
 */
export async function resolveEffectiveDelivery(
  projectPath: string,
  delivery: Delivery,
  _workflows: readonly string[],
  _toolIds: readonly string[]
): Promise<Delivery> {
  if (delivery !== 'commands') {
    return delivery;
  }

  if (await hasActiveUpstreamOpenSpec(projectPath)) {
    return 'both';
  }

  return delivery;
}
