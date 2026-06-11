/**
 * Resolves effective delivery mode for skill/command generation.
 */

import type { Delivery } from './global-config.js';

export async function resolveEffectiveDelivery(
  _projectPath: string,
  delivery: Delivery,
  _workflows: readonly string[],
  _toolIds: readonly string[]
): Promise<Delivery> {
  return delivery;
}
