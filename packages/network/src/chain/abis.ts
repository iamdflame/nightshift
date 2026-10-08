/** Minimal ABIs for the Nightshift contracts (see contracts/ and docs/specs/fair-value-feed-v1.md). */
export const forecastBookAbi = [
  {
    type: "function",
    name: "commit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "round", type: "uint64" },
      { name: "anchorTime", type: "uint64" },
      { name: "root", type: "bytes32" },
      { name: "count", type: "uint32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "reveal",
    stateMutability: "nonpayable",
    inputs: [
      { name: "round", type: "uint64" },
      { name: "uri", type: "string" },
    ],
    outputs: [],
  },
] as const;

export const reportTuple = {
  type: "tuple",
  components: [
    { name: "fairValue", type: "uint128" },
    { name: "lower", type: "uint128" },
    { name: "upper", type: "uint128" },
    { name: "anchorTime", type: "uint64" },
    { name: "updatedAt", type: "uint64" },
    { name: "round", type: "uint64" },
    { name: "session", type: "uint8" },
    { name: "flags", type: "uint8" },
  ],
} as const;

export const oracleAbi = [
  {
    type: "function",
    name: "postReports",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokens", type: "address[]" },
      { name: "reports", type: "tuple[]", components: reportTuple.components },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getReport",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ name: "", type: "tuple", components: reportTuple.components }],
  },
] as const;
