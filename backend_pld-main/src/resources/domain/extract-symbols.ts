// domain/extract-symbols.ts
import { parse, isSymbolNode, isFunctionNode } from 'mathjs';

export function extractSymbols(expression: string): string[] {
  const tree = parse(expression);
  const candidateNodes = tree.filter((node, _path, parent) => {
    if (!isSymbolNode(node)) return false;
    // El nombre de una función (ej. "max" en max(A, B)) también es un
    // SymbolNode para mathjs -- hay que excluirlo, no es una dependencia.
    if (parent && isFunctionNode(parent) && parent.fn === node) return false;
    return true;
  });
  const symbolNodes = candidateNodes.filter(isSymbolNode);
  const names = symbolNodes.map((node) => node.name);
  return [...new Set(names)];
}
