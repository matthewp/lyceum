import { View, Div, H1, Span, Table, Thead, Tr, Th, List } from "@matthewp/zebra";
import type { BookSummary, ReadFilter } from "../storage/types.ts";
import { BookCard } from "../views/book-card.ts";
import { BookRow } from "../views/book-row.ts";
import { ViewToggle } from "../views/view-toggle.ts";
import { FilterDropdown } from "../views/filter-dropdown.ts";
import { Pagination } from "../views/pagination.ts";

export interface BooksData {
  books: BookSummary[];
  total: number;
  page: number;
  perPage: number;
  basePath: string;
  pageTitle: string;
  readFilter: ReadFilter;
}

export default class BooksPage extends View {
  private data: BooksData;

  constructor(data: BooksData) {
    super();
    this.data = data;
  }

  render() {
    const { books, total, page, perPage, basePath, pageTitle, readFilter } = this.data;

    return new Div().addClass("container").append(
      new Div().addClass("page-header").append(
        new H1().addClass("page-header__title").append(
          pageTitle + " ",
          new Span().addClass("page-header__count").setText(`${total} books`),
        ),
        new Div().addClass("page-header__controls").append(
          new FilterDropdown({ readFilter, basePath }),
          new ViewToggle(),
        ),
      ),
      new Div().setAttribute("id", "books-container").append(
        this.coverWall(books),
        this.bookList(books),
      ),
      new Pagination({ page, perPage, total, basePath, readFilter }),
    );
  }

  private coverWall(books: BookSummary[]) {
    return new List<BookSummary>(
      books,
      b => b.id,
      b => new BookCard(b),
      "div",
    ).addClass("cover-wall");
  }

  private bookList(books: BookSummary[]) {
    return new Table().addClass("book-list").append(
      new Thead().append(
        new Tr().addClass("book-list__header").append(
          new Th().addClass("book-list__col-cover"),
          new Th().addClass("book-list__col-title").setText("Title"),
          new Th().addClass("book-list__col-author").setText("Author"),
          new Th().addClass("book-list__col-year").setText("Year"),
          new Th().addClass("book-list__col-tags").setText("Tags"),
          new Th().addClass("book-list__col-format").setText("Format"),
        ),
      ),
      new List<BookSummary>(
        books,
        b => b.id,
        b => new BookRow(b),
        "tbody",
      ),
    );
  }
}
