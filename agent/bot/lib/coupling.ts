import { listRepoFiles, readText } from "./adapters/findings.js";
import { lockTargets, type MigrationPlan, type PlanItem } from "./plan.js";

/**
 * How tightly the files of the AI items depend on each other (Java only), read from the sources:
 * - two item files are coupled when one names a type the other declares, or when both use the same shared
 *   contract (an interface or abstract class that at least three files refer to);
 * - files outside the items that extend or implement a type an item file declares are "ripple" files: they
 *   have to change together with the item.
 * Items that fix one at a time and compile are not coupled; items that all sit on one base class or contract are.
 */
export type ItemCoupling = {
  /** AI items whose files belong to the largest coupled group. */
  items: number;
  /** Files in that group. */
  files: number;
  /** The shared contracts (interfaces or abstract classes) that tie the group together. */
  contracts: string[];
  /** Other files that extend or implement a type declared in the group. */
  rippleFiles: number;
  /** Which files, for the reasons text. */
  group: string[];
};

const none: ItemCoupling = { items: 0, files: 0, contracts: [], rippleFiles: 0, group: [] };
const typeDecl = /\b(?:public\s+|protected\s+|private\s+|final\s+|static\s+)*(abstract\s+)?(class|interface|enum|@interface)\s+([A-Z]\w*)/;
const minReferences = 3;

type Source = { file: string; text: string; type: string | null; contract: boolean };

function declared(file: string, text: string): Source {
  const body = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  const match = typeDecl.exec(body);
  const type = match ? match[3] : null;
  return { file, text: body, type, contract: Boolean(match && (match[2] === "interface" || match[1])) };
}

const mentions = (text: string, type: string) => new RegExp(`\\b${type}\\b`).test(text);

export function itemCoupling(plan: MigrationPlan, aiItems: PlanItem[]): ItemCoupling {
  if (plan.ecosystem !== "java" || aiItems.length < 2) return none;
  try {
    const itemFiles = new Map<string, PlanItem[]>();
    for (const item of aiItems) {
      for (const file of lockTargets(item)) {
        if (!file.endsWith(".java")) continue;
        itemFiles.set(file, [...(itemFiles.get(file) ?? []), item]);
      }
    }
    if (itemFiles.size < 2) return none;
    const sources = listRepoFiles(plan.repoPath)
      .filter((file) => file.endsWith(".java"))
      .map((file) => declared(file, readText(plan.repoPath, file)))
      .filter((source) => source.type);
    const byFile = new Map(sources.map((source) => [source.file, source]));
    const members = [...itemFiles.keys()].filter((file) => byFile.has(file));
    // Contracts: interfaces and abstract classes that enough files refer to.
    const contracts = sources.filter((source) => source.contract && sources.filter((other) => other !== source && mentions(other.text, source.type!)).length >= minReferences);
    const parent = new Map(members.map((file) => [file, file]));
    const find = (file: string): string => (parent.get(file) === file ? file : find(parent.get(file)!));
    const join = (a: string, b: string) => parent.set(find(a), find(b));
    const via = new Map<string, Set<string>>();
    for (let i = 0; i < members.length; i += 1) {
      for (let j = i + 1; j < members.length; j += 1) {
        const a = byFile.get(members[i])!;
        const b = byFile.get(members[j])!;
        const direct = mentions(a.text, b.type!) || mentions(b.text, a.type!);
        const shared = contracts.filter((contract) => contract !== a && contract !== b && mentions(a.text, contract.type!) && mentions(b.text, contract.type!));
        if (direct || shared.length) {
          join(a.file, b.file);
          for (const contract of shared) via.set(contract.type!, (via.get(contract.type!) ?? new Set()).add(a.file).add(b.file));
        }
      }
    }
    const groups = new Map<string, string[]>();
    for (const file of members) groups.set(find(file), [...(groups.get(find(file)) ?? []), file]);
    const largest = [...groups.values()].sort((a, b) => b.length - a.length)[0] ?? [];
    if (largest.length < 2) return none;
    const inGroup = new Set(largest);
    const items = new Set<PlanItem>();
    for (const file of largest) for (const item of itemFiles.get(file) ?? []) items.add(item);
    const groupTypes = largest.map((file) => byFile.get(file)!.type!);
    const ripple = sources.filter(
      (source) => !inGroup.has(source.file) && groupTypes.some((type) => new RegExp(`\\b(?:extends|implements)\\s+${type}\\b`).test(source.text)),
    );
    const names = [...via.entries()].filter(([, files]) => [...files].some((file) => inGroup.has(file))).map(([type]) => type).sort();
    return { items: items.size, files: largest.length, contracts: names, rippleFiles: ripple.length, group: largest.map((file) => byFile.get(file)!.type!) };
  } catch {
    return none;
  }
}
