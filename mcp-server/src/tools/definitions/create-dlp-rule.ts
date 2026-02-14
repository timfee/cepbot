/**
 * Tool definition: creates Chrome DLP rules with a validate-then-create
 * workflow and BLOCK mode prohibition.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp";

import { createDlpRule } from "@lib/api/cloud-identity";
import { guardedToolCall } from "@tools/guarded-tool-call";
import { commonSchemas, getAuthToken } from "@tools/schemas";
import { z } from "zod";

const TRIGGER_MAPPING: Record<string, string> = {
  FILE_DOWNLOAD: "google.workspace.chrome.file.v1.download",
  FILE_UPLOAD: "google.workspace.chrome.file.v1.upload",
  NAVIGATION: "google.workspace.chrome.url.v1.navigation",
  PRINT: "google.workspace.chrome.page.v1.print",
  WEB_CONTENT_UPLOAD: "google.workspace.chrome.web_content.v1.upload",
};

interface ActionParams {
  blockScreenshot?: boolean;
  customEndUserMessage?: { unsafeHtmlMessageBody: string };
  saveContent?: boolean;
  watermarkMessage?: string;
}

interface ChromeAction {
  auditOnly?: Record<string, unknown>;
  warnUser?: { actionParams?: ActionParams };
}

interface RuleConfig {
  [key: string]: unknown;
  action?: { chromeAction: ChromeAction };
  condition: string;
  description?: string;
  displayName: string;
  state?: string;
  triggers: string[];
}

/**
 * Registers the create_dlp_rule tool with the MCP server.
 */
export function registerCreateDlpRuleTool(server: McpServer): void {
  server.registerTool(
    "create_dlp_rule",
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description:
        "Creates a new Chrome DLP rule for a specific Organizational Unit. Supports a validate_only mode to test rule creation without saving the rule.",
      inputSchema: {
        action: z
          .enum(["BLOCK", "WARN", "AUDIT"])
          .describe("Action to take when the rule is triggered"),
        blockScreenshot: z
          .boolean()
          .optional()
          .describe("Whether to block screenshots when the rule is triggered."),
        condition: z
          .string()
          .describe(
            "CEL condition string (e.g. \"all_content.contains('confidential')\")"
          ),
        customMessage: z
          .string()
          .optional()
          .describe(
            "Custom message to display to the user when the rule is triggered."
          ),
        customerId: commonSchemas.customerId,
        description: z.string().optional().describe("Description of the rule"),
        displayName: z.string().describe("Name of the rule"),
        orgUnitId: commonSchemas.orgUnitId.describe(
          "The target Organizational Unit ID"
        ),
        saveContent: z
          .boolean()
          .optional()
          .describe("Whether to save the content that triggered the rule."),
        state: z
          .enum(["ACTIVE", "INACTIVE"])
          .optional()
          .describe("Rule state (defaults to ACTIVE)"),
        triggers: z
          .array(
            z.enum([
              "FILE_UPLOAD",
              "FILE_DOWNLOAD",
              "WEB_CONTENT_UPLOAD",
              "PRINT",
              "NAVIGATION",
            ])
          )
          .describe("List of simplified triggers."),
        validateOnly: z
          .boolean()
          .optional()
          .describe("If true, the request is validated but not created."),
        watermarkMessage: z
          .string()
          .optional()
          .describe("Watermark message to display when the rule is triggered."),
      },
      title: "Create DLP Rule",
    },
    guardedToolCall({
      handler: async (params, { requestInfo }) => {
        const authToken = getAuthToken(requestInfo);
        const fullTriggers = params.triggers.map(
          (t: string) => TRIGGER_MAPPING[t]
        );

        const ruleConfig: RuleConfig = {
          condition: params.condition,
          description: params.description,
          displayName: params.displayName,
          state: params.state,
          triggers: fullTriggers,
        };

        const actionParams: ActionParams = {};
        if (params.customMessage) {
          actionParams.customEndUserMessage = {
            unsafeHtmlMessageBody: params.customMessage,
          };
        }
        if (params.watermarkMessage) {
          actionParams.watermarkMessage = params.watermarkMessage;
        }
        if (params.blockScreenshot) {
          actionParams.blockScreenshot = params.blockScreenshot;
        }
        if (params.saveContent) {
          actionParams.saveContent = params.saveContent;
        }

        const hasActionParams = Object.keys(actionParams).length > 0;

        switch (params.action) {
          case "WARN":
            ruleConfig.action = {
              chromeAction: {
                warnUser: hasActionParams ? { actionParams } : {},
              },
            };
            break;
          case "AUDIT":
            ruleConfig.action = { chromeAction: { auditOnly: {} } };
            break;
          /* v8 ignore next 4 -- unreachable: Zod enum + validate hook guarantee WARN|AUDIT */
          default:
            throw new Error(
              `Unsupported action: ${String(params.action)}. Supported actions are "AUDIT" and "WARN".`
            );
        }

        const createdPolicy = await createDlpRule(
          params.customerId ?? "",
          params.orgUnitId,
          ruleConfig,
          params.validateOnly,
          authToken
        );

        if (params.validateOnly) {
          return {
            content: [
              {
                text: "DLP rule validation successful. The rule was not created.",
                type: "text" as const,
              },
            ],
          };
        }

        return {
          content: [
            {
              text: `Successfully created DLP rule: ${createdPolicy.name}\n\nDetails:\n${JSON.stringify(createdPolicy, null, 2)}`,
              type: "text" as const,
            },
          ],
        };
      },
      transform: (params) => ({
        ...params,
        displayName: `\u{1F916} ${String(params.displayName)}`,
      }),
      validate: (params) => {
        if (params.action === "BLOCK") {
          throw new Error(
            'Creating DLP rules in "BLOCK" mode is not permitted. Supported actions are "AUDIT" and "WARN".'
          );
        }
      },
    })
  );
}
