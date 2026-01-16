/**
 * Shared Browse Filter Utility
 *
 * Generic client-side filtering for campaign browse pages.
 * Handles filter buttons, search input, results count, and optional section visibility.
 */

export interface FilterConfig {
  /** CSS selector for the filterable cards (e.g., '.character-card') */
  cardSelector: string;
  /** ID of the element displaying the visible count (without #) */
  countSelector: string;
  /** ID of the search input element (without #) */
  searchInputId: string;
  /** Optional CSS selector for sections that should hide when empty */
  sectionSelector?: string;
  /** Array of data-attribute names to filter on (e.g., ['subtype', 'status']) */
  filters: string[];
}

/**
 * Initialize browse filtering for a campaign index page.
 *
 * Expects the DOM to have:
 * - Cards with data-{filter} and data-name attributes
 * - Filter buttons in .filter-options[data-filter] containers with data-value
 * - An optional search input
 * - An optional results count element
 *
 * @param config - Configuration for the filter behavior
 */
export function initBrowseFilters(config: FilterConfig): void {
  // Initialize filter state
  const filters: Record<string, string> = {};
  config.filters.forEach((f) => (filters[f] = 'all'));
  let searchTerm = '';

  // Get DOM elements
  const cards = document.querySelectorAll(
    config.cardSelector
  ) as NodeListOf<HTMLElement>;
  const visibleCount = document.getElementById(config.countSelector);
  const sections = config.sectionSelector
    ? (document.querySelectorAll(
        config.sectionSelector
      ) as NodeListOf<HTMLElement>)
    : null;

  /**
   * Update card visibility based on current filter state
   */
  function updateFilters(): void {
    let count = 0;

    cards.forEach((card) => {
      // Check all filter criteria
      const matchesFilters = config.filters.every(
        (f) => filters[f] === 'all' || card.dataset[f] === filters[f]
      );

      // Check search term against data-name
      const name = card.dataset.name || '';
      const matchesSearch =
        !searchTerm || name.includes(searchTerm.toLowerCase());

      // Show/hide card
      if (matchesFilters && matchesSearch) {
        card.style.display = '';
        count++;
      } else {
        card.style.display = 'none';
      }
    });

    // Hide sections with no visible cards
    sections?.forEach((section) => {
      const visibleCards = section.querySelectorAll(
        `${config.cardSelector}:not([style*="display: none"])`
      );
      section.style.display = visibleCards.length > 0 ? '' : 'none';
    });

    // Update count display
    if (visibleCount) {
      visibleCount.textContent = String(count);
    }
  }

  // Attach filter button handlers
  document.querySelectorAll('.filter-options').forEach((group) => {
    const filterType = (group as HTMLElement).dataset.filter;

    group.querySelectorAll('.filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        // Update active state
        group
          .querySelectorAll('.filter-btn')
          .forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');

        // Update filter value and refresh
        if (filterType) {
          filters[filterType] = (btn as HTMLElement).dataset.value || 'all';
        }
        updateFilters();
      });
    });
  });

  // Attach search handler
  const searchInput = document.getElementById(
    config.searchInputId
  ) as HTMLInputElement | null;
  searchInput?.addEventListener('input', (e) => {
    searchTerm = (e.target as HTMLInputElement).value;
    updateFilters();
  });
}
