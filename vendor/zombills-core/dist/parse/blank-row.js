/** A row is blank when every cell is empty or contains only whitespace. */
export function isBlankRow(cells) {
    return cells.every((cell) => cell.trim() === "");
}
