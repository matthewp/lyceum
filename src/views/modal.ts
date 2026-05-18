import {
  View,
  Div,
  Button,
  H2,
  Element,
  Document,
  signal,
  effect,
} from "@matthewp/zebra";

type SignalRW<T> = ((value: T) => void) & (() => T);

export interface ModalProps {
  id: string;
  title?: string;           // omit for headerless modal
  open: SignalRW<boolean>;  // parent owns open state
  body: Element;
  footer?: Element;
}

/**
 * Reusable modal. Open/close is driven by the `open` signal passed in by the
 * parent. Backdrop click and Escape both close.
 *
 * To match the legacy CSS transition (which expects the `.open` class to land
 * one frame after `hidden` flips off), we mirror `open` into a second
 * `openClass` signal with a 2-rAF delay on the way in. Going closed is
 * immediate so the transition runs in reverse.
 */
export class Modal extends View {
  private props: ModalProps;
  private openClass = signal(false);

  constructor(props: ModalProps) {
    super();
    this.props = props;
  }

  render() {
    const { id, title, open, body, footer } = this.props;

    effect(() => {
      if (open()) {
        requestAnimationFrame(() => requestAnimationFrame(() => this.openClass(true)));
      } else {
        this.openClass(false);
      }
    });

    new Document().on("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Escape" && open()) open(false);
    });

    const backdrop = new Div()
      .addClass("modal-backdrop")
      .setAttribute("id", id)
      .toggleAttribute("hidden", () => !open())
      .toggleClass("open", this.openClass)
      .on("click", (e) => {
        // Close only when the click target is the backdrop itself
        // (not a descendant) — i.e. the user clicked outside the modal box.
        const t = e.target as HTMLElement;
        if (t.classList?.contains("modal-backdrop")) open(false);
      });

    const modal = new Div().addClass("modal").setAttribute("role", "dialog");
    if (title !== undefined) {
      modal.setAttribute("aria-labelledby", `${id}-title`);
      modal.append(
        new Div().addClass("modal-header").append(
          new H2().addClass("modal-title").setAttribute("id", `${id}-title`).setText(title),
          new Button().addClass("modal-close").setAttribute("aria-label", "Close")
            .on("click", () => open(false))
            .append("×"),
        ),
      );
    }
    modal.append(new Div().addClass("modal-body").append(body));
    if (footer) modal.append(new Div().addClass("modal-footer").append(footer));

    return backdrop.append(modal);
  }
}
