import {
  View,
  Header as HeaderEl,
  Div,
  Anchor,
  Img,
  Form,
  Input,
  Button,
  Element,
  Document,
  Window,
  signal,
} from "@matthewp/zebra";
import { searchIcon, userBookIcon } from "./icons.ts";

export class AppHeader extends View {
  private opaque = signal(false);
  private menuOpen = signal(false);
  private searchInput = new Input()
    .setAttribute("type", "text")
    .setAttribute("name", "q")
    .setAttribute("placeholder", "Search books...")
    .addClass("search-form__input");

  render() {
    const root = new HeaderEl()
      .addClass("header")
      .toggleClass("header--opaque", this.opaque);

    new Window().on("scroll", () => this.opaque(window.scrollY > 30));
    new Document().on("keydown", (e) => {
      const ke = e as KeyboardEvent;
      if ((ke.ctrlKey || ke.metaKey) && ke.key === "k") {
        ke.preventDefault();
        this.searchInput.focus();
      }
    });
    new Document().on("click", () => this.menuOpen(false));

    return root.append(
      new Div().addClass("header__left").append(
        new Anchor().setAttribute("href", "/app").addClass("logo").append(
          new Img().setAttribute("src", "/public/logo.webp").setAttribute("alt", "").addClass("logo__img"),
          "Lyceum",
        ),
      ),
      new Div().addClass("header__right").append(
        new Form()
          .setAttribute("action", "/app/search")
          .setAttribute("method", "GET")
          .addClass("search-form")
          .append(
            searchIcon(),
            this.searchInput,
            new Element("kbd").addClass("search-form__kbd").append("Ctrl K"),
          ),
        this.userMenu(),
      ),
    );
  }

  private userMenu(): Element {
    return new Div().addClass("user-menu").append(
      new Button()
        .addClass("user-menu__btn")
        .setAttribute("id", "user-btn")
        .setAttribute("aria-label", "User menu")
        .setAttribute("aria-expanded", () => (this.menuOpen() ? "true" : "false"))
        .on("click", (e) => {
          e.stopPropagation();
          this.menuOpen(!this.menuOpen());
        })
        .append(userBookIcon()),
      new Div()
        .addClass("user-menu__dropdown")
        .setAttribute("id", "user-dropdown")
        .toggleAttribute("hidden", () => !this.menuOpen())
        .append(
          new Form().setAttribute("method", "POST").setAttribute("action", "/app/logout").append(
            new Button().setAttribute("type", "submit").addClass("user-menu__dropdown-item").append("Sign out"),
          ),
        ),
    );
  }
}
