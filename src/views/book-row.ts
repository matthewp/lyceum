import { View, Tr, Td, Anchor, Img, Span, Div } from "@matthewp/zebra";
import type { BookSummary } from "../storage/types.ts";

export class BookRow extends View {
  private book: BookSummary;

  constructor(book: BookSummary) {
    super();
    this.book = book;
  }

  render() {
    const b = this.book;
    const pubYear = b.pubdate ? new Date(b.pubdate).getFullYear() : null;
    const yearStr = pubYear && pubYear > 100 ? String(pubYear) : "";

    const coverCell = b.has_cover
      ? new Img()
          .addClass("book-list__cover")
          .setAttribute("src", `/app/cover/${b.id}`)
          .setAttribute("alt", "")
          .setStyle("view-transition-name", `cover-${b.id}`)
      : new Span().addClass("book-list__cover--empty");

    const titleCell = new Td().addClass("book-list__col-title").append(
      new Anchor()
        .addClass("book-list__title")
        .setAttribute("href", `/app/book/${b.id}`)
        .setStyle("view-transition-name", `title-${b.id}`)
        .setText(b.title),
    );
    if (b.series && b.series_id) {
      const label = b.series + (b.series_index != null ? ` #${b.series_index}` : "");
      titleCell.append(
        new Anchor().addClass("book-list__series").setAttribute("href", `/app/series/${b.series_id}`).setText(label),
      );
    }

    const authorCell = new Td().addClass("book-list__col-author");
    b.authors.forEach((a, i) => {
      if (i > 0) authorCell.append(", ");
      authorCell.append(
        new Anchor().setAttribute("href", `/app/author/${encodeURIComponent(a)}`).setText(a),
      );
    });

    const tagsCell = new Td().addClass("book-list__col-tags").append(
      new Div().addClass("book-list__tag-list").append(
        ...b.tags.map(t =>
          new Anchor().addClass("tag").setAttribute("href", `/app/tag/${encodeURIComponent(t)}`).setText(t),
        ),
      ),
    );

    const yearCell = new Td().addClass("book-list__col-year");
    if (yearStr) yearCell.setText(yearStr);

    const formatStr = b.formats.join(" · ");
    const formatCell = new Td().addClass("book-list__col-format");
    if (formatStr) formatCell.setText(formatStr);

    return new Tr().addClass("book-list__row").append(
      new Td().addClass("book-list__col-cover").append(coverCell),
      titleCell,
      authorCell,
      yearCell,
      tagsCell,
      formatCell,
    );
  }
}
