// AGENTIK-INTELLIGENCE-STRATEGIC-MEMORY-01
// Strategic Memory identity helpers — ID generation and validation

function randomHex(bytes: number): string {
  const chars = "0123456789abcdef";
  let result = "";
  for (let i = 0; i < bytes * 2; i++) {
    result += chars[Math.floor(Math.random() * 16)];
  }
  return result;
}

export function generateStrategicMemoryId(): string {
  return `smem_${Date.now()}_${randomHex(6)}`;
}

export function generateStrategicRelationId(): string {
  return `srel_${Date.now()}_${randomHex(6)}`;
}

export function generateStrategicSnapshotId(): string {
  return `ssnap_${Date.now()}_${randomHex(6)}`;
}

export function generateStrategicEvidenceId(): string {
  return `sevid_${Date.now()}_${randomHex(6)}`;
}

export function generateStrategicSignalId(): string {
  return `ssig_${Date.now()}_${randomHex(6)}`;
}

export function generateStrategicResultId(): string {
  return `sres_${Date.now()}_${randomHex(6)}`;
}

export function validateStrategicMemoryId(id: string): boolean {
  return typeof id === "string" && id.startsWith("smem_") && id.length > 10;
}

export function validateStrategicRelationId(id: string): boolean {
  return typeof id === "string" && id.startsWith("srel_") && id.length > 10;
}

export function validateStrategicSnapshotId(id: string): boolean {
  return typeof id === "string" && id.startsWith("ssnap_") && id.length > 10;
}

export function isStrategicMemoryId(id: string): boolean {
  return validateStrategicMemoryId(id);
}
