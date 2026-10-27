/**
 * Just enough semver for package dependencies: versions "1.2.3" (pre-release suffixes ignored)
 * and requirements as in Cargo/npm: "^1.2", "~1.2.3", ">=1.0.0 <2.0.0", "1.x", "*", "a || b".
 */
type Version = [number, number, number];
const parse = (value: string): Version | null => {
  const match = /^\s*v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/.exec(value);
  return match ? [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)] : null;
};
export function compareVersions(left: string, right: string): number {
  const a = parse(left) ?? [0, 0, 0], b = parse(right) ?? [0, 0, 0];
  for (let at = 0; at < 3; at++) if (a[at] !== b[at]) return a[at] < b[at] ? -1 : 1;
  return 0;
}
const cmp = (a: Version, b: Version) => { for (let at = 0; at < 3; at++) if (a[at] !== b[at]) return a[at] < b[at] ? -1 : 1; return 0; };

/** One comparator → [lowest allowed or null, highest excluded or null, inclusive upper?]. */
function comparator(raw: string): ((version: Version) => boolean) | null {
  const match = /^(\^|~|>=|<=|>|<|=)?\s*v?(\*|x|X|\d+)(?:\.(\*|x|X|\d+))?(?:\.(\*|x|X|\d+))?(?:-[\w.]+)?$/.exec(raw.trim());
  if (!match) return null;
  const operator = match[1] ?? "", wild = (part?: string) => part === undefined || /^[*xX]$/.test(part);
  const parts = [match[2], match[3], match[4]], given = parts.findIndex(wild), known = given < 0 ? 3 : given;
  const base: Version = [Number(wild(parts[0]) ? 0 : parts[0]), Number(wild(parts[1]) ? 0 : parts[1]), Number(wild(parts[2]) ? 0 : parts[2])];
  if (known === 0) return () => true;
  const bump = (position: number): Version => position === 0 ? [base[0] + 1, 0, 0] : position === 1 ? [base[0], base[1] + 1, 0] : [base[0], base[1], base[2] + 1];
  const range = (low: Version, high: Version | null) => (version: Version) => cmp(version, low) >= 0 && (!high || cmp(version, high) < 0);
  // Like Cargo (and the Rust side of BBForge), a bare version ("1.2.3", "1.2") means "^".
  const bare = operator === "" && parts.slice(known).every((part) => part === undefined);
  if (operator === "^" || bare) {
    const first = base[0] > 0 || known === 1 ? 0 : base[1] > 0 || known === 2 ? 1 : 2;
    return range(base, bump(first));
  }
  if (operator === "~") return range(base, bump(known === 1 ? 0 : 1));
  if (operator === ">=") return (version) => cmp(version, base) >= 0;
  if (operator === ">") return known === 3 ? (version) => cmp(version, base) > 0 : (version) => cmp(version, bump(known - 1)) >= 0;
  if (operator === "<=") return known === 3 ? (version) => cmp(version, base) <= 0 : (version) => cmp(version, bump(known - 1)) < 0;
  if (operator === "<") return (version) => cmp(version, base) < 0;
  // "=1.2.3", "1.x", "1.2.*": exact or wildcard match.
  return known === 3 ? (version) => cmp(version, base) === 0 : range(base, bump(known - 1));
}

/** Whether `version` meets `requirement`; an unreadable requirement is never met. */
export function satisfies(version: string, requirement: string): boolean {
  const parsed = parse(version);
  if (!parsed) return false;
  return requirement.split("||").some((alternative) => {
    const parts = alternative.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, "$1").split(/[\s,]+/).filter(Boolean);
    if (!parts.length) return false;
    const checks = parts.map(comparator);
    return checks.every((check) => check !== null) && checks.every((check) => check!(parsed));
  });
}

/** Whether a version that does not meet the requirement is too new (needs a downgrade) rather than too old. */
export function tooNew(version: string, requirement: string): boolean {
  if (satisfies(version, requirement)) return false;
  const lowest = /(\d+(?:\.\d+){0,2})/.exec(requirement)?.[1];
  return lowest !== undefined && compareVersions(version, lowest) > 0;
}
