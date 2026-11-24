import { asString, byType, formatMil, MILLIMETERS_TO_MILS } from "./format"
import type { CircuitElement } from "./types"

// Native kinds/fields match the pinned NodeMCU and HERON reference files.
const ruleTypes = {
  Clearance: 0,
  Width: 2,
  RoutingVias: 11,
  HoleToHoleClearance: 52,
  BoardOutlineClearance: 63,
} as const
type RuleKind = keyof typeof ruleTypes
const traceScope = "IsTrack Or IsArc"

export function createPcbManufacturingRuleRecords(
  circuitJson: CircuitElement[],
): string[] {
  const board = byType(circuitJson, "pcb_board")[0]
  if (!board) return []
  const records: string[] = []
  const addRule = (
    kind: RuleKind,
    name: string,
    scope1: string,
    scope2: string,
    netScope: string,
    fields: string[],
  ) => {
    records.push(
      [
        "|RECORD=Rule",
        `BINARYRECORDTYPE=${ruleTypes[kind]}`,
        `RULEKIND=${kind}`,
        `NAME=Tscircuit${name}`,
        "ENABLED=TRUE",
        "DEFINEDBYLOGICALDOCUMENT=FALSE",
        `PRIORITY=${records.length + 1000}`,
        `NETSCOPE=${netScope}`,
        "LAYERKIND=SameLayer",
        `SCOPE1EXPRESSION=${scope1}`,
        `SCOPE2EXPRESSION=${scope2}`,
        ...fields,
      ].join("|"),
    )
  }
  const value = (field: string): number | undefined => {
    const raw = board[field]
    if (raw === undefined) return undefined
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0)
      throw new RangeError(`Invalid PCB manufacturing constraint: ${field}`)
    return raw
  }
  const measurement = (mm: number) => formatMil(mm * MILLIMETERS_TO_MILS)
  const width = value("min_trace_width")
  if (width !== undefined)
    addRule("Width", "MinTraceWidth", traceScope, "All", "AnyNet", [
      `MINLIMIT=${measurement(width)}`,
    ])
  const clearances: [string, string, string, string, string][] = [
    [
      "min_trace_to_pad_edge_clearance",
      "TraceToPadClearance",
      traceScope,
      "IsPad",
      "DifferentNets",
    ],
    [
      "min_pad_edge_to_pad_edge_clearance",
      "PadToPadClearance",
      "IsPad",
      "IsPad",
      "DifferentNets",
    ],
    [
      "min_same_net_trace_edge_to_trace_edge_clearance",
      "SameNetTraceClearance",
      traceScope,
      traceScope,
      "SameNetOnly",
    ],
    [
      "min_different_net_trace_edge_to_trace_edge_clearance",
      "DifferentNetTraceClearance",
      traceScope,
      traceScope,
      "DifferentNets",
    ],
    [
      "min_via_edge_to_pad_edge_clearance",
      "ViaToPadClearance",
      "IsVia",
      "IsPad",
      "DifferentNets",
    ],
  ]
  for (const [field, name, scope1, scope2, netScope] of clearances) {
    const gap = value(field)
    if (gap !== undefined)
      addRule("Clearance", name, scope1, scope2, netScope, [
        `GAP=${measurement(gap)}`,
      ])
  }
  for (const [field, name, scope] of [
    [
      "min_via_hole_edge_to_via_hole_edge_clearance",
      "ViaDrillClearance",
      "IsVia",
    ],
    [
      "min_plated_hole_drill_edge_to_drill_edge_clearance",
      "PlatedDrillClearance",
      "IsPad And (PadIsPlated = 'True')",
    ],
  ] as const) {
    const gap = value(field)
    if (gap !== undefined)
      addRule("HoleToHoleClearance", name, scope, scope, "AnyNet", [
        `GAP=${measurement(gap)}`,
      ])
  }
  const edge = value("min_board_edge_clearance")
  if (edge !== undefined)
    addRule(
      "BoardOutlineClearance",
      "BoardEdgeClearance",
      "All",
      "All",
      "AnyNet",
      [`GAP=${measurement(edge)}`, `GENERICCLEARANCE=${measurement(edge)}`],
    )
  const holeDiameter = value("min_via_hole_diameter")
  const padDiameter = value("min_via_pad_diameter")
  if (holeDiameter !== undefined || padDiameter !== undefined)
    addRule("RoutingVias", "MinViaSize", "IsVia", "All", "AnyNet", [
      ...(holeDiameter === undefined
        ? []
        : [`MINHOLEWIDTH=${measurement(holeDiameter)}`]),
      ...(padDiameter === undefined
        ? []
        : [`MINWIDTH=${measurement(padDiameter)}`]),
    ])
  return records
}

export function getManufacturingRuleBinaryType(
  kind: unknown,
): number | undefined {
  return ruleTypes[asString(kind) as RuleKind]
}
