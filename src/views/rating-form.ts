import { View, Form, Button, signal, computed } from "@matthewp/zebra";

export class RatingForm extends View {
  private bookId: number;
  private rating = signal(0);
  private hovered = signal<number | null>(null);

  constructor(bookId: number, initial: number) {
    super();
    this.bookId = bookId;
    this.rating(initial);
  }

  render() {
    const form = new Form().setAttribute("method", "POST")
      .setAttribute("action", `/app/book/${this.bookId}/rating`)
      .addClass("rating-form")
      .on("submit", (e) => e.preventDefault());

    for (let i = 1; i <= 5; i++) {
      form.append(this.star(i));
    }
    return form;
  }

  private star(val: number) {
    // Filled when the *displayed* rating (hover preview or actual) is ≥ this.
    const displayedRating = computed(() => this.hovered() ?? this.rating());
    const filled = computed(() => displayedRating() >= val);
    const preview = computed(() => this.hovered() !== null && (this.hovered() ?? 0) >= val);

    return new Button()
      .setAttribute("type", "submit")
      .setAttribute("name", "rating")
      // Clicking the active star clears the rating (current === clicked → 0).
      .setAttribute("value", computed(() => String(val === this.rating() ? 0 : val)))
      .addClass("rating-form__star")
      .toggleClass("rating-form__star--filled", filled)
      .toggleClass("rating-form__star--preview", preview)
      .setAttribute("aria-label", `${val} star`)
      .setText(computed(() => filled() ? "★" : "☆"))
      .on("mouseenter", () => this.hovered(val))
      .on("mouseleave", () => this.hovered(null))
      .on("click", () => this.submit(val === this.rating() ? 0 : val));
  }

  private submit(newRating: number): void {
    this.rating(newRating);
    fetch(`/app/book/${this.bookId}/rating`, {
      method: "POST",
      body: new URLSearchParams({ rating: String(newRating) }),
    }).catch(() => { /* ignore */ });
  }
}
