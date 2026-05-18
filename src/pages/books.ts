import { View, Div, H1, Span, Table, Thead, Tr, Th, List } from "@matthewp/zebra";
import type { BookSummary } from "../storage/types.ts";
import { BookCard } from "../views/book-card.ts";
import { BookRow } from "../views/book-row.ts";
import { ViewToggle } from "../views/view-toggle.ts";
import { Pagination } from "../views/pagination.ts";

export interface BooksData {
  books: BookSummary[];
  total: number;
  page: number;
  perPage: number;
  basePath: string;
  pageTitle: string;
}

export default class BooksPage extends View {
  private data: BooksData;

  constructor(data: BooksData) {
    super();
    this.data = data;
  }

  render() {
    const { books, total, page, perPage, basePath, pageTitle } = this.data;

    return new Div().addClass("container").append(
      new Div().addClass("page-header").append(
        new H1().addClass("page-title").append(
          pageTitle + " ",
          new Span().addClass("page-count").setText(`${total} books`),
        ),
        new ViewToggle(),
      ),
      new Div().setAttribute("id", "books-container").append(
        this.coverWall(books),
        this.bookList(books),
      ),
      new Pagination({ page, perPage, total, basePath }),
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
        new Tr().addClass("list-header").append(
          new Th().addClass("col-cover"),
          new Th().addClass("col-title").setText("Title"),
          new Th().addClass("col-author").setText("Author"),
          new Th().addClass("col-year").setText("Year"),
          new Th().addClass("col-tags").setText("Tags"),
          new Th().addClass("col-format").setText("Format"),
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
