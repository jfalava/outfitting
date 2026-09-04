export function parseCliVersion(
  value: string,
): [number, number, number] | undefined {
  const match = /^(?:cli-v|v)?(\d+)\.(\d+)\.(\d+)$/.exec(value);
  if (!match) {
    return undefined;
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = parseCliVersion(candidate);
  const currentParts = parseCliVersion(current);
  if (!candidateParts || !currentParts) {
    throw new Error(
      `Cannot compare CLI versions "${current}" and "${candidate}".`,
    );
  }

  for (let index = 0; index < candidateParts.length; index += 1) {
    if (candidateParts[index]! > currentParts[index]!) {
      return true;
    }
    if (candidateParts[index]! < currentParts[index]!) {
      return false;
    }
  }
  return false;
}
