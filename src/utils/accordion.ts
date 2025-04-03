/**
 * Utility functions for handling accordion state
 */

/**
 * Updates the expanded items array when toggling an accordion item
 * Ensures only one top-level facility accordion of each type (library/academic) can be open at a time
 * 
 * @param value The accordion item ID being toggled
 * @param prevItems The current array of expanded accordion items
 * @returns The updated array of expanded accordion items
 */
export const getUpdatedAccordionItems = (value: string, prevItems: string[]): string[] => {
  // If the item is already in the list, just remove it (close the accordion)
  if (prevItems.includes(value)) {
    return prevItems.filter((item) => item !== value);
  }

  // Handle only top-level facility accordions (ensure only one of each type is open)
  // Match exactly library-{id} or building-{id} pattern (no additional segments)
  const libraryPattern = /^library-[^-]+$/;
  const buildingPattern = /^building-[^-]+$/;

  if (libraryPattern.test(value)) {
    // For library facilities, close any other open library facility
    const filteredItems = prevItems.filter(item => !libraryPattern.test(item));
    return [...filteredItems, value];
  } else if (buildingPattern.test(value)) {
    // For academic buildings, close any other open academic building
    const filteredItems = prevItems.filter(item => !buildingPattern.test(item));
    return [...filteredItems, value];
  }

  // For all other items (like room accordions or available/occupied sections), just add them
  return [...prevItems, value];
};
