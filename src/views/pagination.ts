import { View, Div, Anchor, Span } from "@matthewp/zebra";
import type { ReadFilter } from "../storage/types.ts";

export interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  basePath: string;
  readFilter?: ReadFilter;
}

/**
 * Build a page URL preserving any pre-existing query string on `basePath`
 * (e.g. /app/search?q=foo) and the read filter.
 */
function buildPageUrl(basePath: string, page: number, readFilter?: ReadFilter): string {
  const [path, existing] = basePath.split("?", 2);
  const params = new URLSearchParams(existing ?? "");
  params.set("page", String(page));
  if (readFilter && readFilter !== "all") params.set("filter", readFilter);
  return `${path}?${params.toString()}`;
}

export class Pagination extends View {
  private props: PaginationProps;

  constructor(props: PaginationProps) {
    super();
    this.props = props;
  }

  render() {
    const { page, perPage, total, basePath, readFilter } = this.props;
    const totalPages = Math.ceil(total / perPage);
    if (totalPages <= 1) return new Div();

    const root = new Div().addClass("pagination");

    if (page > 1) {
      root.append(
        new Anchor().addClass("pagination__link")
          .setAttribute("href", buildPageUrl(basePath, page - 1, readFilter))
          .setText("← Previous"),
      );
    } else {
      root.append(new Span().addClass("pagination__link").addClass("pagination__link--disabled").setText("← Previous"));
    }

    root.append(new Span().addClass("pagination__info").setText(`Page ${page} of ${totalPages}`));

    if (page < totalPages) {
      root.append(
        new Anchor().addClass("pagination__link")
          .setAttribute("href", buildPageUrl(basePath, page + 1, readFilter))
          .setText("Next →"),
      );
    } else {
      root.append(new Span().addClass("pagination__link").addClass("pagination__link--disabled").setText("Next →"));
    }

    return root;
  }
}
