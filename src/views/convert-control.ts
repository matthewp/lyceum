import {
  View,
  Div,
  Button,
  Ul,
  Li,
  Span,
  Svg,
  Path,
  Polyline,
  Document,
  signal,
  computed,
  effect,
} from "@matthewp/zebra";

const SUPPORTED = ["EPUB", "MOBI", "TXT", "DOCX", "HTMLZ", "LRF"];

export interface ConvertControlProps {
  bookId: number;
  formats: () => string[];                    // current formats (reactive)
  onConverted: (newFormat: string) => void;   // called after a successful convert
}

/**
 * "Convert" button with a dropdown of target formats. Only renders formats
 * not yet present on the book. POSTs to /app/book/:id/convert; on success,
 * calls onConverted so the parent can refresh its formats list.
 */
export class ConvertControl extends View {
  private props: ConvertControlProps;
  private open = signal(false);
  private inFlight = signal(false);
  private errored = signal(false);

  constructor(props: ConvertControlProps) {
    super();
    this.props = props;
  }

  render() {
    const convertable = computed(() => SUPPORTED.filter(f => !this.props.formats().includes(f)));

    new Document().on("click", () => this.open(false));

    const wrap = new Div().addClass("convert-wrap").setAttribute("id", "convert-wrap")
      .toggleAttribute("hidden", computed(() => convertable().length === 0));

    const btn = new Button().addClass("convert-btn").setAttribute("id", "convert-btn")
      .setAttribute("aria-expanded", computed(() => this.open() ? "true" : "false"))
      .toggleClass("loading", this.inFlight)
      .toggleClass("convert-error", this.errored)
      .setDisabled(this.inFlight)
      .on("click", (e) => { e.stopPropagation(); this.open(!this.open()); })
      .append(
        convertIcon(),
        new Span().addClass("btn-label").setText("Convert"),
        new Span().addClass("btn-spinner"),
        chevronIcon(),
      );

    const dropdown = new Ul().addClass("convert-dropdown").setAttribute("id", "convert-dropdown")
      .setAttribute("role", "menu")
      .toggleClass("open", this.open)
      .on("click", (e) => e.stopPropagation());

    // Re-render dropdown items when the formats list changes. Block-body
    // arrow so nothing leaks as the effect's cleanup.
    effect(() => {
      dropdown.clear();
      for (const f of convertable()) {
        dropdown.append(
          new Li().append(
            new Button().addClass("convert-option").setAttribute("data-fmt", f)
              .setText(f)
              .on("click", () => this.run(f)),
          ),
        );
      }
    });

    return wrap.append(btn, dropdown);
  }

  private async run(toFormat: string): Promise<void> {
    this.open(false);
    this.inFlight(true);
    this.errored(false);
    try {
      const res = await fetch(`/app/book/${this.props.bookId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `to_format=${encodeURIComponent(toFormat)}`,
      });
      const data: { error?: string } = await res.json();
      if (data.error) throw new Error(data.error);
      this.props.onConverted(toFormat);
    } catch {
      this.errored(true);
      setTimeout(() => this.errored(false), 3000);
    } finally {
      this.inFlight(false);
    }
  }
}

function convertIcon(): Svg {
  return new Svg()
    .setAttribute("xmlns", "http://www.w3.org/2000/svg")
    .setAttribute("width", "12").setAttribute("height", "12").setAttribute("viewBox", "0 0 24 24")
    .setAttribute("fill", "none").setAttribute("stroke", "currentColor").setAttribute("stroke-width", "2")
    .setAttribute("stroke-linecap", "round").setAttribute("stroke-linejoin", "round")
    .append(
      new Polyline().setAttribute("points", "17 1 21 5 17 9"),
      new Path().setAttribute("d", "M3 11V9a4 4 0 0 1 4-4h14"),
      new Polyline().setAttribute("points", "7 23 3 19 7 15"),
      new Path().setAttribute("d", "M21 13v2a4 4 0 0 1-4 4H3"),
    );
}

function chevronIcon(): Svg {
  return new Svg().addClass("btn-chevron")
    .setAttribute("xmlns", "http://www.w3.org/2000/svg")
    .setAttribute("width", "12").setAttribute("height", "12").setAttribute("viewBox", "0 0 24 24")
    .setAttribute("fill", "none").setAttribute("stroke", "currentColor").setAttribute("stroke-width", "2.5")
    .setAttribute("stroke-linecap", "round").setAttribute("stroke-linejoin", "round")
    .append(new Polyline().setAttribute("points", "6 9 12 15 18 9"));
}
