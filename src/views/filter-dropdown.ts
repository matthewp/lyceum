import { View, Div, Label, Select, Option } from "@matthewp/zebra";
import type { ReadFilter } from "../storage/types.ts";

export interface FilterDropdownProps {
  /** Current read filter (from URL/loader). */
  readFilter: ReadFilter;
  /**
   * Base path of the current page (without query string).
   * Used to build the navigation target when the filter changes.
   * e.g. "/app", "/app/tag/Sci-Fi", "/app/author/Asimov".
   */
  basePath: string;
}

/**
 * Build the target URL for a new filter value. The `basePath` can already
 * contain a query string (e.g. /app/search?q=foo), so we have to parse it.
 * Resetting the filter to "all" drops the param entirely so URLs stay clean.
 * Changing the filter always resets pagination to page 1.
 */
function buildFilterUrl(basePath: string, value: ReadFilter): string {
  const [path, existing] = basePath.split("?", 2);
  const params = new URLSearchParams(existing ?? "");
  params.delete("page");
  if (value === "all") params.delete("filter");
  else params.set("filter", value);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export class FilterDropdown extends View {
  private props: FilterDropdownProps;

  constructor(props: FilterDropdownProps) {
    super();
    this.props = props;
  }

  render() {
    const { readFilter, basePath } = this.props;

    const mkOption = (value: ReadFilter, label: string) => {
      const opt = new Option().setAttribute("value", value).setText(label);
      // Mark the active option with the `selected` attribute so the SSR'd
      // HTML displays the correct value before hydration. (Setting
      // `value` on the <select> isn't valid HTML and browsers ignore it.)
      if (value === readFilter) opt.setAttribute("selected", "");
      return opt;
    };

    const select = new Select()
      .addClass("filter-dropdown__select")
      .setAttribute("id", "books-filter")
      .setAttribute("aria-label", "Filter books")
      .on("change", (e) => {
        const value = (e.target as HTMLSelectElement).value as ReadFilter;
        if (typeof window !== "undefined") {
          window.location.href = buildFilterUrl(basePath, value);
        }
      })
      .append(
        mkOption("all", "All books"),
        mkOption("unread", "Unread"),
        mkOption("read", "Read"),
      );

    return new Div().addClass("filter-dropdown").append(
      new Label()
        .addClass("filter-dropdown__label")
        .setAttribute("for", "books-filter")
        .setText("Filter:"),
      select,
    );
  }
}
