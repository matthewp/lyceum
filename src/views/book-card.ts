import { View, Anchor, Div, Img, Span } from "@matthewp/zebra";
import type { BookSummary } from "../storage/types.ts";

export class BookCard extends View {
  private book: BookSummary;

  constructor(book: BookSummary) {
    super();
    this.book = book;
  }

  render() {
    const b = this.book;
    const link = new Anchor()
      .addClass("book-card")
      .setAttribute("href", `/app/book/${b.id}`);

    if (b.has_cover) {
      link.append(
        new Div()
          .addClass("cover-wrap")
          .setStyle("view-transition-name", `cover-${b.id}`)
          .append(
            new Img().setAttribute("src", `/app/cover/${b.id}`).setAttribute("alt", ""),
            new Div().addClass("cover-overlay").append(
              new Span().addClass("cover-title")
                .setStyle("view-transition-name", `title-${b.id}`)
                .setText(b.title),
              new Span().addClass("cover-author").setText(b.authors.join(", ")),
            ),
          ),
      );
    } else {
      link.append(
        new Div().addClass("cover-wrap").addClass("no-cover-tile").append(
          new Span().addClass("no-cover-title")
            .setStyle("view-transition-name", `title-${b.id}`)
            .setText(b.title),
          new Span().addClass("no-cover-author").setText(b.authors.join(", ")),
        ),
      );
    }

    return link;
  }
}
