import { View, Anchor, Div, Img, Span, Svg, Path } from "@matthewp/zebra";
import type { BookSummary } from "../storage/types.ts";

function readBadge(): Div {
  const check = new Svg()
    .setAttribute("xmlns", "http://www.w3.org/2000/svg")
    .setAttribute("viewBox", "0 0 24 24")
    .setAttribute("fill", "none")
    .setAttribute("stroke", "currentColor")
    .setAttribute("stroke-width", "3")
    .setAttribute("stroke-linecap", "round")
    .setAttribute("stroke-linejoin", "round")
    .append(new Path().setAttribute("d", "M5 12l5 5L20 7"));
  return new Div().addClass("read-badge")
    .setAttribute("aria-label", "Read")
    .setAttribute("title", "Read")
    .append(check);
}

export class BookCard extends View {
  private book: BookSummary;

  constructor(book: BookSummary) {
    super();
    this.book = book;
  }

  render() {
    const b = this.book;
    const isRead = b.read_at != null;
    const link = new Anchor()
      .addClass("book-card")
      .setAttribute("href", `/app/book/${b.id}`);

    const wrap = new Div()
      .addClass("cover-wrap")
      .toggleClass("is-read", isRead);

    if (b.has_cover) {
      wrap
        .setStyle("view-transition-name", `cover-${b.id}`)
        .append(
          new Img().setAttribute("src", `/app/cover/${b.id}`).setAttribute("alt", ""),
          new Div().addClass("cover-overlay").append(
            new Span().addClass("cover-title")
              .setStyle("view-transition-name", `title-${b.id}`)
              .setText(b.title),
            new Span().addClass("cover-author").setText(b.authors.join(", ")),
          ),
        );
    } else {
      wrap.addClass("no-cover-tile").append(
        new Span().addClass("no-cover-title")
          .setStyle("view-transition-name", `title-${b.id}`)
          .setText(b.title),
        new Span().addClass("no-cover-author").setText(b.authors.join(", ")),
      );
    }

    if (isRead) wrap.append(readBadge());
    link.append(wrap);
    return link;
  }
}
