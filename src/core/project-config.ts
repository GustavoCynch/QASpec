import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { formatPlanningRelativePath, joinPlanningPath } from './planning-dir.js';

/**
 * Zod schema for project configuration.
 *
 * Purpose:
 * 1. Documentation - clearly defines the config file structure
 * 2. Type safety - TypeScript infers ProjectConfig type from schema
 * 3. Runtime validation - uses safeParse() for resilient field-by-field validation
 *
 * Why Zod over manual validation:
 * - Helps understand QASpec's data interfaces at a glance
 * - Single source of truth for type and validation
 * - Consistent with other QASpec schemas
 */
const MultipleSubagentsConfigSchema = z.object({
  review: z.boolean().optional().describe('Dual Task analysts for analyze/review phase'),
  cases: z.boolean().optional().describe('Dual Task analysts for cases phase'),
});

const WorkflowConfigSchema = z.object({
  multipleSubagents: MultipleSubagentsConfigSchema.optional(),
});

const TcmsConfigSchema = z.object({
  provider: z.string().optional().describe('TCMS provider (any MCP-backed provider)'),
  project: z.string().optional().describe('TCMS project code'),
  baseUrl: z.string().optional().describe('TCMS base URL'),
});

export const ProjectConfigSchema = z.object({
  // Required: which schema to use (e.g., "spec-driven", or project-local schema name)
  schema: z
    .string()
    .min(1)
    .describe('The workflow schema to use (e.g., "spec-driven")'),

  // Optional: project context (injected into all artifact instructions)
  // Max size: 50KB (enforced during parsing)
  context: z
    .string()
    .optional()
    .describe('Project context injected into all artifact instructions'),

  // Optional: per-artifact rules (additive to schema's built-in guidance)
  rules: z
    .record(
      z.string(), // artifact ID
      z.array(z.string()) // list of rules
    )
    .optional()
    .describe('Per-artifact rules, keyed by artifact ID'),

  // Optional: workflow execution toggles (e.g. dual blind subagents per phase)
  workflow: WorkflowConfigSchema.optional(),

  // Optional: user-managed TCMS defaults for publish (provider, project code,
  // base URL). The per-change target in the change's .qaspec.yaml wins;
  // publish flows never write this block.
  tcms: TcmsConfigSchema.optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

const MAX_CONTEXT_SIZE = 50 * 1024; // 50KB hard limit

/**
 * Read and parse qaspec/config.yaml from project root.
 * Uses resilient parsing - validates each field independently using Zod safeParse.
 * Returns null if file doesn't exist.
 * Returns partial config if some fields are invalid (with warnings).
 *
 * Performance note (Jan 2025):
 * Benchmarks showed direct file reads are fast enough without caching:
 * - Typical config (1KB): ~0.5ms per read
 * - Large config (50KB): ~1.6ms per read
 * - Missing config: ~0.01ms per read
 * Config is read 1-2 times per command (schema resolution + instruction loading),
 * adding ~1-3ms total overhead. Caching would add complexity (mtime checks,
 * invalidation logic) for negligible benefit. Direct reads also ensure config
 * changes are reflected immediately without stale cache issues.
 *
 * @param projectRoot - The root directory of the project (where `qaspec/` lives)
 * @returns Parsed config or null if file doesn't exist
 */
export function readProjectConfig(projectRoot: string): ProjectConfig | null {
  const configRelYaml = formatPlanningRelativePath(projectRoot, 'config.yaml');
  const configRelYml = formatPlanningRelativePath(projectRoot, 'config.yml');

  // Try both .yaml and .yml, prefer .yaml
  let configPath = joinPlanningPath(projectRoot, 'config.yaml');
  if (!existsSync(configPath)) {
    configPath = joinPlanningPath(projectRoot, 'config.yml');
    if (!existsSync(configPath)) {
      return null; // No config is OK
    }
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const raw = parseYaml(content);

    if (!raw || typeof raw !== 'object') {
      console.warn(`${configRelYaml} is not a valid YAML object`);
      return null;
    }

    const config: Partial<ProjectConfig> = {};

    // Parse schema field using Zod
    const schemaField = z.string().min(1);
    const schemaResult = schemaField.safeParse(raw.schema);
    if (schemaResult.success) {
      config.schema = schemaResult.data;
    } else if (raw.schema !== undefined) {
      console.warn(`Invalid 'schema' field in config (must be non-empty string)`);
    }

    // Parse context field with size limit
    if (raw.context !== undefined) {
      const contextField = z.string();
      const contextResult = contextField.safeParse(raw.context);

      if (contextResult.success) {
        const contextSize = Buffer.byteLength(contextResult.data, 'utf-8');
        if (contextSize > MAX_CONTEXT_SIZE) {
          console.warn(
            `Context too large (${(contextSize / 1024).toFixed(1)}KB, limit: ${MAX_CONTEXT_SIZE / 1024}KB)`
          );
          console.warn(`Ignoring context field`);
        } else {
          config.context = contextResult.data;
        }
      } else {
        console.warn(`Invalid 'context' field in config (must be string)`);
      }
    }

    // Parse rules field using Zod
    if (raw.rules !== undefined) {
      const rulesField = z.record(z.string(), z.array(z.string()));

      // First check if it's an object structure (guard against null since typeof null === 'object')
      if (typeof raw.rules === 'object' && raw.rules !== null && !Array.isArray(raw.rules)) {
        const parsedRules: Record<string, string[]> = {};
        let hasValidRules = false;

        for (const [artifactId, rules] of Object.entries(raw.rules)) {
          const rulesArrayResult = z.array(z.string()).safeParse(rules);

          if (rulesArrayResult.success) {
            // Filter out empty strings
            const validRules = rulesArrayResult.data.filter((r) => r.length > 0);
            if (validRules.length > 0) {
              parsedRules[artifactId] = validRules;
              hasValidRules = true;
            }
            if (validRules.length < rulesArrayResult.data.length) {
              console.warn(
                `Some rules for '${artifactId}' are empty strings, ignoring them`
              );
            }
          } else {
            console.warn(
              `Rules for '${artifactId}' must be an array of strings, ignoring this artifact's rules`
            );
          }
        }

        if (hasValidRules) {
          config.rules = parsedRules;
        }
      } else {
        console.warn(`Invalid 'rules' field in config (must be object)`);
      }
    }

    // Parse workflow.multipleSubagents (resilient per flag)
    if (raw.workflow !== undefined) {
      if (typeof raw.workflow === 'object' && raw.workflow !== null && !Array.isArray(raw.workflow)) {
        const workflowRaw = raw.workflow as Record<string, unknown>;
        const msRaw = workflowRaw.multipleSubagents;
        if (msRaw !== undefined) {
          if (typeof msRaw === 'object' && msRaw !== null && !Array.isArray(msRaw)) {
            const msObj = msRaw as Record<string, unknown>;
            const parsedMs: { review?: boolean; cases?: boolean } = {};
            let hasMs = false;

            if (msObj.review !== undefined) {
              const reviewResult = z.boolean().safeParse(msObj.review);
              if (reviewResult.success) {
                parsedMs.review = reviewResult.data;
                hasMs = true;
              } else {
                console.warn(
                  `Invalid 'workflow.multipleSubagents.review' in config (must be boolean)`
                );
              }
            }

            if (msObj.cases !== undefined) {
              const casesResult = z.boolean().safeParse(msObj.cases);
              if (casesResult.success) {
                parsedMs.cases = casesResult.data;
                hasMs = true;
              } else {
                console.warn(
                  `Invalid 'workflow.multipleSubagents.cases' in config (must be boolean)`
                );
              }
            }

            if (msObj.matrix !== undefined) {
              const matrixResult = z.boolean().safeParse(msObj.matrix);
              if (matrixResult.success) {
                if (parsedMs.cases === undefined) {
                  parsedMs.cases = matrixResult.data;
                  console.warn(
                    'Renamed config key workflow.multipleSubagents.matrix → workflow.multipleSubagents.cases'
                  );
                } else if (matrixResult.data !== parsedMs.cases) {
                  console.warn(
                    'Both workflow.multipleSubagents.cases and legacy .matrix are set — using cases (canonical)'
                  );
                }
                hasMs = true;
              } else {
                console.warn(
                  `Invalid 'workflow.multipleSubagents.matrix' in config (must be boolean)`
                );
              }
            }

            if (hasMs) {
              config.workflow = { multipleSubagents: parsedMs };
            }
          } else {
            console.warn(`Invalid 'workflow.multipleSubagents' in config (must be object)`);
          }
        }
      } else {
        console.warn(`Invalid 'workflow' field in config (must be object)`);
      }
    }

    // Parse tcms block (resilient per field)
    if (raw.tcms !== undefined) {
      if (typeof raw.tcms === 'object' && raw.tcms !== null && !Array.isArray(raw.tcms)) {
        const tcmsRaw = raw.tcms as Record<string, unknown>;
        const parsedTcms: { provider?: string; project?: string; baseUrl?: string } = {};
        let hasTcms = false;

        if (tcmsRaw.provider !== undefined) {
          const providerResult = z.string().safeParse(tcmsRaw.provider);
          if (providerResult.success) {
            parsedTcms.provider = providerResult.data;
            hasTcms = true;
          } else {
            console.warn(`Invalid 'tcms.provider' in config (must be string)`);
          }
        }

        if (tcmsRaw.project !== undefined) {
          const projectResult = z.string().safeParse(tcmsRaw.project);
          if (projectResult.success) {
            parsedTcms.project = projectResult.data;
            hasTcms = true;
          } else {
            console.warn(`Invalid 'tcms.project' in config (must be string)`);
          }
        }

        if (tcmsRaw.baseUrl !== undefined) {
          const baseUrlResult = z.string().safeParse(tcmsRaw.baseUrl);
          if (baseUrlResult.success) {
            parsedTcms.baseUrl = baseUrlResult.data;
            hasTcms = true;
          } else {
            console.warn(`Invalid 'tcms.baseUrl' in config (must be string)`);
          }
        }

        if (hasTcms) {
          config.tcms = parsedTcms;
        }
      } else {
        console.warn(`Invalid 'tcms' field in config (must be object)`);
      }
    }

    // Return partial config even if some fields failed
    return Object.keys(config).length > 0 ? (config as ProjectConfig) : null;
  } catch (error) {
    console.warn(`Failed to parse ${configRelYaml}:`, error);
    return null;
  }
}

/**
 * Validate artifact IDs in rules against a schema's artifacts.
 * Called during instruction loading (when schema is known).
 * Returns warnings for unknown artifact IDs.
 *
 * @param rules - The rules object from config
 * @param validArtifactIds - Set of valid artifact IDs from the schema
 * @param schemaName - Name of the schema for error messages
 * @returns Array of warning messages for unknown artifact IDs
 */
/** Legacy rules keys mapped to canonical artifact ids (still accepted in user config). */
export const LEGACY_RULE_ARTIFACT_ALIASES: Record<string, string> = {
  'test-matrix': 'test-cases',
};

export function validateConfigRules(
  rules: Record<string, string[]>,
  validArtifactIds: Set<string>,
  schemaName: string
): string[] {
  const warnings: string[] = [];

  for (const artifactId of Object.keys(rules)) {
    if (LEGACY_RULE_ARTIFACT_ALIASES[artifactId]) {
      continue;
    }
    if (!validArtifactIds.has(artifactId)) {
      const validIds = Array.from(validArtifactIds).sort().join(', ');
      warnings.push(
        `Unknown artifact ID in rules: "${artifactId}". ` +
          `Valid IDs for schema "${schemaName}": ${validIds}`
      );
    }
  }

  return warnings;
}

/**
 * Resolves rules for an artifact id, honoring legacy rule keys with a one-time notice.
 */
export function resolveRulesForArtifact(
  rules: Record<string, string[]> | undefined,
  artifactId: string,
  onNotice?: (message: string) => void
): string[] | undefined {
  if (!rules) {
    return undefined;
  }
  const canonical = rules[artifactId];
  if (canonical && canonical.length > 0) {
    return canonical;
  }
  for (const [legacyId, canonicalId] of Object.entries(LEGACY_RULE_ARTIFACT_ALIASES)) {
    if (canonicalId === artifactId) {
      const legacy = rules[legacyId];
      if (legacy && legacy.length > 0) {
        onNotice?.(`Renamed config rules key "${legacyId}" → "${canonicalId}"`);
        return legacy;
      }
    }
  }
  return undefined;
}

/**
 * Suggest valid schema names when user provides invalid schema.
 * Uses fuzzy matching to find similar names.
 *
 * @param invalidSchemaName - The invalid schema name from config
 * @param availableSchemas - List of available schemas with their type (built-in or project-local)
 * @returns Error message with suggestions and available schemas
 */
export function suggestSchemas(
  invalidSchemaName: string,
  availableSchemas: { name: string; isBuiltIn: boolean }[],
  projectRoot: string = process.cwd()
): string {
  // Simple fuzzy match: Levenshtein distance
  function levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[b.length][a.length];
  }

  // Find closest matches (distance <= 3)
  const suggestions = availableSchemas
    .map((s) => ({ ...s, distance: levenshtein(invalidSchemaName, s.name) }))
    .filter((s) => s.distance <= 3)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);

  const builtIn = availableSchemas.filter((s) => s.isBuiltIn).map((s) => s.name);
  const projectLocal = availableSchemas.filter((s) => !s.isBuiltIn).map((s) => s.name);

  const configRel = formatPlanningRelativePath(projectRoot, 'config.yaml');
  let message = `Schema '${invalidSchemaName}' not found in ${configRel}\n\n`;

  if (suggestions.length > 0) {
    message += `Did you mean one of these?\n`;
    suggestions.forEach((s) => {
      const type = s.isBuiltIn ? 'built-in' : 'project-local';
      message += `  - ${s.name} (${type})\n`;
    });
    message += '\n';
  }

  message += `Available schemas:\n`;
  if (builtIn.length > 0) {
    message += `  Built-in: ${builtIn.join(', ')}\n`;
  }
  if (projectLocal.length > 0) {
    message += `  Project-local: ${projectLocal.join(', ')}\n`;
  } else {
    message += `  Project-local: (none found)\n`;
  }

  message += `\nFix: Edit ${configRel} and change 'schema: ${invalidSchemaName}' to a valid schema name`;

  return message;
}
