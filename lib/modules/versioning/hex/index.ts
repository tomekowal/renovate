import type { RangeStrategy } from '../../../types/versioning.ts';
import { regEx } from '../../../util/regex.ts';
import { api as npm } from '../npm/index.ts';
import type { NewValueConfig, VersioningApi } from '../types.ts';

export const id = 'hex';
export const displayName = 'Hex';
export const urls = [
  '[Elixir Version module](https://hexdocs.pm/elixir/Version.html)',
];
export const supportsRanges = true;
export const supportedRangeStrategies: RangeStrategy[] = [
  'bump',
  'widen',
  'replace',
  'update-lockfile',
];

function hex2npm(input: string): string {
  // Hex frees the last part of a `~>` range, whatever the values, so
  // `~> 0.22` is `>= 0.22.0 and < 1.0.0`. An npm caret frees only the parts
  // below the first non-zero one, so `^0.22` is `>= 0.22.0 and < 0.23.0`. The
  // two agree when the major is not 0. npm has no operator for the range when
  // the major is 0, so write the interval out.
  return input
    .replace(regEx(/~>\s*0\.(\d+)($|[^\d.])/g), '>=0.$1.0 <1.0.0$2')
    .replace(regEx(/~>\s*(\d+\.\d+)($|[^\d.])/g), '^$1$2')
    .replace(regEx(/~>\s*(\d+\.\d+\.\d+)/), '~$1')
    .replace(regEx(/==|and/), '')
    .replace('or', '||')
    .replace(regEx(/!=\s*(\d+\.\d+(\.\d+.*)?)/), '>$1 <$1')
    .trim();
}

function npm2hex(input: string): string {
  const res = input
    .split(' ')
    .map((str) => str.trim())
    .filter((str) => str !== '');
  let output = '';
  const operators = ['^', '=', '>', '<', '<=', '>=', '~>'];
  for (let i = 0; i < res.length; i += 1) {
    if (i === res.length - 1) {
      output += res[i];
      break;
    }
    if (i < res.length - 1 && res[i + 1].includes('||')) {
      output += `${res[i]} or `;
      i += 1;
    } else if (operators.includes(res[i])) {
      output += `${res[i]} `;
    } else {
      output += `${res[i]} and `;
    }
  }
  return output;
}

function isLessThanRange(version: string, range: string): boolean {
  return !!npm.isLessThanRange?.(hex2npm(version), hex2npm(range));
}

function isValid(input: string): boolean {
  return !!npm.isValid(hex2npm(input));
}

function isSingleVersion(constraint: string): boolean {
  return (
    npm.isVersion(constraint) ||
    (constraint?.startsWith('==') &&
      npm.isVersion(constraint.substring(2).trim()))
  );
}

function getPinnedValue(newVersion: string): string {
  return `== ${newVersion}`;
}

function matches(version: string, range: string): boolean {
  return npm.matches(hex2npm(version), hex2npm(range));
}

function getSatisfyingVersion(
  versions: string[],
  range: string,
): string | null {
  return npm.getSatisfyingVersion(versions.map(hex2npm), hex2npm(range));
}

function minSatisfyingVersion(
  versions: string[],
  range: string,
): string | null {
  return npm.minSatisfyingVersion(versions.map(hex2npm), hex2npm(range));
}

function getNewValue({
  currentValue,
  rangeStrategy,
  currentVersion,
  newVersion,
}: NewValueConfig): string | null {
  // A range that already allows the new version needs no change. `bump` is
  // different, because it always raises the lower bound.
  if (rangeStrategy !== 'bump' && matches(newVersion, currentValue)) {
    return currentValue;
  }
  // `npm.getNewValue` rewrites a caret range, and `npm2hex` turns the result
  // back into a `~>` range, which the expanded `0.x` form cannot produce. Keep
  // the caret for the rewrite only. Invariant: this line is reached only when
  // `newVersion` falls outside the range, so the narrower npm meaning of
  // `^0.x` cannot change the outcome.
  const npmRewritableValue = currentValue.replace(
    regEx(/~>\s*(0\.\d+)($|[^\d.])/g),
    '^$1$2',
  );
  let newSemver = npm.getNewValue({
    currentValue: hex2npm(npmRewritableValue),
    rangeStrategy,
    currentVersion,
    newVersion,
  });
  if (newSemver) {
    newSemver = npm2hex(newSemver);

    if (regEx(/~>\s*(\d+\.\d+\.\d+)$/).test(currentValue)) {
      newSemver = newSemver.replace(
        regEx(/[\^~]\s*(\d+\.\d+\.\d+)/g),
        (_str, p1: string) => `~> ${p1}`,
      );
    } else {
      // Hex has no caret, so a caret in the result is an artifact of the round
      // trip through npm. Restore `~>` for every one of them.
      newSemver = newSemver.replace(
        regEx(/\^\s*(\d+\.\d+)(\.\d+)?/g),
        (_str, p1: string) => `~> ${p1}`,
      );
      if (!regEx(/~>\s*(\d+\.\d+)$/).test(currentValue)) {
        newSemver = newSemver.replace(regEx(/~\s*(\d+\.\d+\.\d)/g), '~> $1');
      }
    }
    if (npm.isVersion(newSemver)) {
      newSemver = `== ${newSemver}`;
    }
  }
  return newSemver;
}

export { isValid };

export const api: VersioningApi = {
  ...npm,
  isLessThanRange,
  isSingleVersion,
  isValid,
  matches,
  getSatisfyingVersion,
  minSatisfyingVersion,
  getNewValue,
  getPinnedValue,
};

export default api;
