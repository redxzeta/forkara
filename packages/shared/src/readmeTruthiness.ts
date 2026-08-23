// FILE: readmeTruthiness.ts
// Purpose: Pure README claim checks over caller-supplied factual Git evidence.

export interface ReadmeTruthinessRemote {
  readonly name: string;
  readonly fetchUrl: string;
}

export interface ReadmeTruthinessEvidence {
  readonly upstreamRef: string | null;
  readonly remotes: readonly ReadmeTruthinessRemote[];
  readonly hasUpstreamRemote: boolean;
}

export interface ReadmeClaim {
  readonly line: number;
  readonly text: string;
  readonly pattern: string;
}

export interface ReadmeTruthinessFinding {
  readonly id: string;
  readonly title: string;
  readonly message: string;
  readonly readmeClaims: readonly ReadmeClaim[];
  readonly evidence: readonly string[];
}

const BUILT_FROM_SCRATCH_PATTERNS = [
  /\bbuilt\s+from\s+the\s+ground\s+up\b/i,
  /\bbuilt\s+from\s+scratch\b/i,
  /\bfrom\s+scratch\b/i,
] as const;
const NO_FORK_RELATIONSHIP_PATTERNS = [
  /\bno\s+fork\s+relationship\b/i,
  /\bthis\s+is\s+not\s+a\s+fork\b/i,
  /\bnot\s+a\s+fork\b/i,
  /\bnot\s+technically\s+a\s+fork\b/i,
] as const;

function collectReadmeClaims(readmeContents: string) {
  const builtFromScratch: ReadmeClaim[] = [];
  const noFork: ReadmeClaim[] = [];
  for (const [index, line] of readmeContents.split(/\r?\n/).entries()) {
    for (const pattern of BUILT_FROM_SCRATCH_PATTERNS) {
      if (!pattern.test(line)) continue;
      builtFromScratch.push({ line: index + 1, text: line.trim(), pattern: pattern.source });
      break;
    }
    for (const pattern of NO_FORK_RELATIONSHIP_PATTERNS) {
      if (!pattern.test(line)) continue;
      noFork.push({ line: index + 1, text: line.trim(), pattern: pattern.source });
      break;
    }
  }
  return { builtFromScratch, noFork };
}

export function detectReadmeTruthiness(
  readmeContents: string,
  gitEvidence: ReadmeTruthinessEvidence,
): readonly ReadmeTruthinessFinding[] {
  const hasUpstreamFact =
    Boolean(gitEvidence.upstreamRef) ||
    gitEvidence.hasUpstreamRemote ||
    gitEvidence.remotes.some((remote) => remote.name !== "origin");
  if (!hasUpstreamFact) return [];

  const claims = collectReadmeClaims(readmeContents);
  const remoteLines = gitEvidence.remotes.map((remote) => `${remote.name}: ${remote.fetchUrl}`);
  const evidence = [
    gitEvidence.upstreamRef !== null
      ? `upstream ref: ${gitEvidence.upstreamRef}`
      : "upstream ref: none",
    remoteLines.length > 0 ? `remotes: ${remoteLines.join(", ")}` : "remotes: none",
  ];
  const findings: ReadmeTruthinessFinding[] = [];
  if (claims.builtFromScratch.length > 0) {
    findings.push({
      id: "technically-ambitious",
      title: "Technically Ambitious",
      message:
        "The README says this was built from the ground up, but local git still remembers where the lineage came from.",
      readmeClaims: claims.builtFromScratch,
      evidence,
    });
  }
  if (claims.noFork.length > 0) {
    findings.push({
      id: "factual-fork-relationship",
      title: "Factual Fork Relationship",
      message:
        "The README calls this unrelated, yet git metadata points to a tracked upstream lineage.",
      readmeClaims: claims.noFork,
      evidence,
    });
  }
  return findings;
}
