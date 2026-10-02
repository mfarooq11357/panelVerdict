/** Stable anonymous labels. Index 0 is "A". */
export function labelFor(index) {
  if (!Number.isInteger(index) || index < 0 || index > 25) {
    throw new Error(`label index out of range: ${index}`);
  }
  return String.fromCharCode(65 + index);
}

export function labelsFor(count) {
  return Array.from({ length: count }, (_, i) => labelFor(i));
}
