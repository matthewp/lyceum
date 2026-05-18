import {
  View,
  Div,
  Span,
  Img,
  H1,
  P,
  Anchor,
  Button,
  Form,
  Svg,
  Polyline,
  signal,
  computed,
  effect,
  type Element as ZebraElement,
} from "@matthewp/zebra";
import type { BookDetailData } from "../loaders/book-detail.ts";
import { RatingForm } from "../views/rating-form.ts";
import { ConvertControl } from "../views/convert-control.ts";
import { FormatModal } from "../views/format-modal.ts";

const isBrowser = typeof window !== "undefined";

export default class BookDetailPage extends View {
  private data: BookDetailData;

  // Reactive subset of book state.
  private formats = signal<string[]>([]);
  private readAt = signal<string | null>(null);

  // Format modal state.
  private formatModalOpen = signal(false);
  private currentFormat = signal("");

  constructor(data: BookDetailData) {
    super();
    this.data = data;
    this.formats(data.book.formats);
    this.readAt(data.book.read_at);
  }

  render() {
    const b = this.data.book;

    const pubYear = b.pubdate ? new Date(b.pubdate).getFullYear() : null;
    const pubYearValid = pubYear && pubYear > 100 ? pubYear : null;

    return new Div().append(
      this.backdrop(),
      new Div().addClass("detail-layout").append(
        this.leftColumn(),
        this.rightColumn(pubYearValid),
      ),
      new FormatModal({
        bookId: b.id,
        open: this.formatModalOpen,
        format: this.currentFormat,
        deviceNames: this.data.devices,
        onRemoved: (fmt) => this.formats(this.formats().filter(f => f !== fmt)),
      }),
    );
  }

  private backdrop() {
    const b = this.data.book;
    const backdrop = new Div().addClass("book-backdrop");
    if (b.has_cover) {
      backdrop.setStyle("--cover-url", `url(/app/cover/${b.id})`);
    }
    return backdrop;
  }

  private leftColumn() {
    const b = this.data.book;
    const col = new Div().addClass("detail-col-left");

    // Cover
    if (b.has_cover) {
      col.append(
        new Img().addClass("detail-cover")
          .setAttribute("src", `/app/cover/${b.id}`)
          .setAttribute("alt", "Cover")
          .setStyle("view-transition-name", `cover-${b.id}`),
      );
    } else {
      col.append(new Div().addClass("no-cover").setText("No Cover"));
    }

    // Format badges
    const formatsBlock = new Div().addClass("detail-formats").setAttribute("id", "book-formats");
    effect(() => {
      formatsBlock.clear();
      for (const f of this.formats()) {
        formatsBlock.append(
          new Button().addClass("format-badge").addClass("format-badge-btn")
            .setAttribute("data-format", f)
            .setText(f)
            .on("click", () => this.openFormatModal(f)),
        );
      }
    });
    col.append(formatsBlock);

    if (this.data.converterEnabled) {
      col.append(
        new ConvertControl({
          bookId: b.id,
          formats: this.formats,
          onConverted: (newFmt) => this.formats([...this.formats(), newFmt]),
        }),
      );
    }

    return col;
  }

  private rightColumn(pubYearValid: number | null) {
    const b = this.data.book;
    const col = new Div().addClass("detail-col-right");

    if (b.series && b.series_id) {
      col.append(
        new P().addClass("detail-series-label").append(
          new Anchor().setAttribute("href", `/app/series/${b.series_id}`).addClass("series-link")
            .setText(b.series + (b.series_index != null ? ` · Book ${b.series_index}` : "")),
        ),
      );
    }

    col.append(
      new H1().addClass("detail-title")
        .setStyle("view-transition-name", `title-${b.id}`)
        .setText(b.title),
      this.authorsRow(),
    );

    if (pubYearValid || b.publisher || (b.languages?.length ?? 0) > 0) {
      const metaRow = new P().addClass("detail-meta-row");
      if (pubYearValid) metaRow.append(new Span().setText(String(pubYearValid)));
      if (b.publisher) metaRow.append(new Span().setText(b.publisher));
      if (b.languages && b.languages.length) metaRow.append(new Span().setText(b.languages.join(", ")));
      col.append(metaRow);
    }

    if (b.tags && b.tags.length) {
      col.append(this.tagsRow(b.tags));
    }

    col.append(
      new RatingForm(b.id, typeof b.rating === "number" ? Math.round(b.rating) : 0),
    );

    if (b.reading_progress && !b.read_at) {
      const prog = b.reading_progress;
      const pct = Math.round(prog.percentage);
      col.append(
        new Div().addClass("detail-progress").append(
          new Div().addClass("progress-bar-track").append(
            new Div().addClass("progress-bar-fill").setStyle("width", `${pct}%`),
          ),
          new Span().addClass("progress-label").setText(`${pct}%${prog.device ? ` · ${prog.device}` : ""}`),
        ),
      );
    }

    col.append(this.readBlock());

    // Description (HTML). Render empty placeholder for SSR; fill innerHTML
    // post-hydrate (RawHTML doesn't currently survive Zebra hydration).
    const description = b.comments ?? "";
    if (description) {
      const descDiv = new Div().addClass("description");
      if (isBrowser) {
        queueMicrotask(() => {
          if (descDiv.el) descDiv.el.innerHTML = description;
        });
      }
      col.append(descDiv);
    }

    return col;
  }

  private authorsRow() {
    const b = this.data.book;
    const row = new P().addClass("detail-author");
    (b.authors ?? []).forEach((a, i) => {
      if (i > 0) row.append(", ");
      row.append(
        new Anchor().setAttribute("href", `/app/author/${encodeURIComponent(a)}`).setText(a),
      );
    });
    return row;
  }

  private tagsRow(tags: string[]) {
    const row = new Div().addClass("detail-tags");
    for (const t of tags) {
      row.append(
        new Anchor().addClass("tag").setAttribute("href", `/app/tag/${encodeURIComponent(t)}`).setText(t),
      );
    }
    return row;
  }

  private readBlock(): ZebraElement {
    const b = this.data.book;
    const isRead = computed(() => this.readAt() !== null);
    const readAtDate = computed(() => {
      const r = this.readAt();
      return r ? new Date(r).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
    });

    return new Div().addClass("detail-read-status").append(
      new Form().setAttribute("method", "POST").setAttribute("action", `/app/book/${b.id}/read`)
        .on("submit", (e) => {
          e.preventDefault();
          this.toggleRead();
        })
        .append(
          new Button().setAttribute("type", "submit")
            .addClass("read-toggle")
            .toggleClass("is-read", isRead)
            .append(
              checkIcon(),
              new Span().setText(computed(() => {
                if (isRead()) {
                  return `Read${readAtDate() ? ` · ${readAtDate()}` : ""}`;
                }
                return "Mark as read";
              })),
            ),
        ),
    );
  }

  private openFormatModal(format: string): void {
    this.currentFormat(format);
    this.formatModalOpen(true);
  }

  private async toggleRead(): Promise<void> {
    const b = this.data.book;
    const wasRead = this.readAt() !== null;
    const next = wasRead ? null : new Date().toISOString();
    this.readAt(next);  // optimistic
    try {
      // The server still expects a form-encoded POST with no body and
      // redirects (302) on completion. We swallow the redirect — our
      // optimistic update is the source of truth.
      await fetch(`/app/book/${b.id}/read`, { method: "POST", redirect: "manual" });
    } catch {
      this.readAt(wasRead ? b.read_at : null); // revert
    }
  }
}

function checkIcon(): Svg {
  return new Svg()
    .setAttribute("xmlns", "http://www.w3.org/2000/svg")
    .setAttribute("width", "14").setAttribute("height", "14").setAttribute("viewBox", "0 0 24 24")
    .setAttribute("fill", "none").setAttribute("stroke", "currentColor").setAttribute("stroke-width", "2.5")
    .setAttribute("stroke-linecap", "round").setAttribute("stroke-linejoin", "round")
    .append(new Polyline().setAttribute("points", "20 6 9 17 4 12"));
}
