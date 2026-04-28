"use strict";

const { writeWaveHandoff } = require("../waves.js");

module.exports = Object.freeze({
  name: "bounty_write_wave_handoff",
  description:
    "Hunter-final writer for one structured wave handoff as markdown plus authoritative JSON.",
  inputSchema: {
    "type": "object",
    "properties": {
      "target_domain": {
        "type": "string"
      },
      "wave": {
        "type": "string",
        "pattern": "^w[1-9][0-9]*$"
      },
      "agent": {
        "type": "string",
        "pattern": "^a[1-9][0-9]*$"
      },
      "surface_id": {
        "type": "string"
      },
      "surface_status": {
        "type": "string",
        "enum": [
          "complete",
          "partial"
        ]
      },
      "handoff_token": {
        "type": "string",
        "minLength": 16
      },
      "summary": {
        "type": "string",
        "minLength": 1,
        "maxLength": 2000
      },
      "chain_notes": {
        "type": "array",
        "maxItems": 20,
        "items": {
          "type": "string",
          "minLength": 1,
          "maxLength": 300
        }
      },
      "blocked_harness_runs": {
        "type": "array",
        "maxItems": 20,
        "items": {
          "type": "object",
          "required": ["kind", "harness", "reason"],
          "properties": {
            "kind": {
              "type": "string",
              "enum": ["foundry_fork", "rpc_endpoint", "fuzzer", "symbolic_solver", "mock_dependency", "external_api", "other"]
            },
            "harness": { "type": "string", "minLength": 1, "maxLength": 120 },
            "reason": { "type": "string", "minLength": 1, "maxLength": 240 },
            "needed_for": { "type": "string", "minLength": 1, "maxLength": 200 }
          },
          "additionalProperties": false
        }
      },
      "bypass_attempts": {
        "type": "array",
        "maxItems": 30,
        "items": {
          "type": "object",
          "required": ["condition", "attempt_summary", "outcome"],
          "properties": {
            "condition": { "type": "string", "minLength": 4, "maxLength": 120 },
            "attempt_summary": { "type": "string", "minLength": 30, "maxLength": 500 },
            "outcome": {
              "type": "string",
              "enum": ["no_finding", "partial_evidence", "finding_recorded", "blocked"]
            },
            "finding_id": { "type": "string", "pattern": "^F-[1-9][0-9]*$" }
          },
          "additionalProperties": false
        }
      },
      "content": {
        "type": "string"
      },
      "dead_ends": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "waf_blocked_endpoints": {
        "type": "array",
        "items": {
          "type": "string"
        }
      },
      "lead_surface_ids": {
        "type": "array",
        "items": {
          "type": "string"
        }
      }
    },
    "required": [
      "target_domain",
      "wave",
      "agent",
      "surface_id",
      "surface_status",
      "summary",
      "content"
    ]
  },
  handler: writeWaveHandoff,
  role_bundles: ["hunter"],
  mutating: true,
  global_preapproval: true,
  network_access: false,
  browser_access: false,
  scope_required: false,
  sensitive_output: false,
  session_artifacts_written: ["handoff-wN-aN.json","handoff-wN-aN.md"],
  hook_required: false,
});
