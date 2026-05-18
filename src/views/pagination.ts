import { View, Div, Anchor, Span } from "@matthewp/zebra";

export interface PaginationProps {
  page: number;
  perPage: number;
  total: number;
  basePath: string;
}

export class Pagination extends View {
  private props: PaginationProps;

  constructor(props: PaginationProps) {
    super();
    this.props = props;
  }

  render() {
    const { page, perPage, total, basePath } = this.props;
    const totalPages = Math.ceil(total / perPage);
    if (totalPages <= 1) return new Div();

    const root = new Div().addClass("pagination");

    if (page > 1) {
      root.append(
        new Anchor().addClass("page-link").setAttribute("href", `${basePath}?page=${page - 1}`).setText("← Previous"),
      );
    } else {
      root.append(new Span().addClass("page-link").addClass("disabled").setText("← Previous"));
    }

    root.append(new Span().addClass("page-info").setText(`Page ${page} of ${totalPages}`));

    if (page < totalPages) {
      root.append(
        new Anchor().addClass("page-link").setAttribute("href", `${basePath}?page=${page + 1}`).setText("Next →"),
      );
    } else {
      root.append(new Span().addClass("page-link").addClass("disabled").setText("Next →"));
    }

    return root;
  }
}
