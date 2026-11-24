import { expect, test } from "bun:test"
import { type CircuitElement, extractArchive } from "./fixtures"

async function scenario() {
  const elements = (await Bun.file(
    new URL("./assets/nema17.circuit.json", import.meta.url),
  ).json()) as CircuitElement[]
  return {
    ...(await extractArchive(elements)),
    board: elements.find((element) => element.type === "pcb_board")!,
  }
}

test("preserves manufacturing width and clearance settings already present on the real board", async () => {
  const { pcb, board } = await scenario()
  const width = pcb.rules.find(
    (rule) => rule.get("NAME") === "TscircuitMinTraceWidth",
  )
  expect(width?.getAltiumMeasurement("MINLIMIT")?.toMillimeters()).toBeCloseTo(
    Number(board.min_trace_width),
    4,
  )
  const clearance = pcb.rules.find(
    (rule) => rule.get("NAME") === "TscircuitTraceToPadClearance",
  )
  expect(clearance?.getAltiumMeasurement("GAP")?.toMillimeters()).toBeCloseTo(
    Number(board.min_trace_to_pad_edge_clearance),
    4,
  )
  expect(
    pcb.rules
      .find((rule) => rule.ruleKind === "BoardOutlineClearance")
      ?.getAltiumMeasurement("GAP")
      ?.toMillimeters(),
  ).toBeCloseTo(Number(board.min_board_edge_clearance), 4)
}, 30_000)

test("records the real board's exported manufacturing minima", async () => {
  const { pcb } = await scenario()
  const minimum = (name: string, field: string) => {
    const value = pcb.rules
      .find((rule) => rule.get("NAME") === name)
      ?.getAltiumMeasurement(field)
      ?.toMillimeters()
    return value === undefined ? null : Number(value.toFixed(4))
  }
  expect({
    minimumTraceWidthMm: minimum("TscircuitMinTraceWidth", "MINLIMIT"),
    traceToPadGapMm: minimum("TscircuitTraceToPadClearance", "GAP"),
    boardEdgeGapMm: minimum("TscircuitBoardEdgeClearance", "GAP"),
    ruleCount: pcb.rules.length,
  }).toMatchInlineSnapshot(`
    {
      "boardEdgeGapMm": 0.2,
      "minimumTraceWidthMm": 0.1,
      "ruleCount": 8,
      "traceToPadGapMm": 0.1,
    }
  `)
}, 30_000)
